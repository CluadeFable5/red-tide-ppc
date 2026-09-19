#!/usr/bin/env node
/**
 * Regenerate the zone polygons in `src/data/zones.ts` from the real OSM
 * coastline geometry cached in `scripts/coastline-cache/osm-coastline.json`
 * (fetched by CI — see scripts/fetch-coastline.mjs).
 *
 * For every zone:
 *   1. extract the LANDWARD edge as the actual connected OSM coastline node
 *      run between two anchor points (Dijkstra over the coastline way graph),
 *      bridging thin out-and-back spurs (piers, fish pens) wherever the
 *      bridge chord would stay within 15 m of the real coastline;
 *   2. densify it to ≤20 m spacing and Douglas-Peucker simplify at ε = 8 m,
 *      so every point of the drawn edge stays within ~10 m of the real
 *      coastline — no chords cutting across land, no gap of open water;
 *   3. build the SEAWARD edge as the flat-cap-cut, water-side arc of a true
 *      geodesic line buffer of the landward edge (turf), Douglas-Peucker
 *      simplified at ε = 15 m: a smooth parallel offset at exactly the band
 *      width everywhere, including around piers, corners and headlands;
 *   4. verify — landward deviation vs the dense coastline, ring simplicity,
 *      pairwise non-overlap, strip width — then write `src/data/coastline.ts`
 *      (dense reference runs, used by `src/data/zones.test.ts`) and patch the
 *      polygon arrays in `src/data/zones.ts`.
 *
 *   npx tsx scripts/generate-zones.ts           # regenerate + verify + write
 *   npx tsx scripts/generate-zones.ts --check   # verify only, write nothing
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buffer as turfBuffer, lineString } from '@turf/turf'

const CHECK_ONLY = process.argv.includes('--check')
const CACHE = resolve('scripts/coastline-cache/osm-coastline.json')
const ZONES_TS = resolve('src/data/zones.ts')
const COASTLINE_TS = resolve('src/data/coastline.ts')

/** [south-west anchor, north-east anchor, a point in the water, band width m] */
interface ZoneRun {
  from: [number, number]
  to: [number, number]
  water: [number, number]
  width: number
}

const ZONE_RUNS: Record<string, ZoneRun> = {
  'pp-bay': {
    from: [9.7229, 118.7684], // Bancao-Bancao lighthouse
    // Headland apex N of San Jose (way 1529960715/1529960721 junction): the
    // coast reverses here onto the bay's far shore, so this is the natural
    // northern cap — the run's NNE reach, E-W corner and NNW climb to the
    // tip all face the same bay water as the city waterfront.
    to: [9.7877, 118.7194],
    water: [9.705, 118.72],
    width: 400,
  },
  'sta-lourdes': {
    from: [9.7689, 118.7731], // Blue Palawan beach
    // Runs through the bight, around the Sta. Lourdes wharf pier complex and
    // up the harbour shore — its water side stays consistently E/SE the whole
    // way, which honda-inner's cannot (the pier is a hairpin).
    to: [9.848, 118.744],
    water: [9.8, 118.79],
    width: 350,
  },
  'honda-inner': {
    from: [9.848, 118.744], // straight N-going shore N of the wharf pier
    to: [9.894, 118.7457], // shared with honda-outer
    water: [9.87, 118.77],
    width: 350,
  },
  'honda-outer': {
    from: [9.894, 118.7457], // shared with honda-inner
    to: [9.93068, 118.75356], // just W of the Honda Bay creek mouth V
    water: [9.92, 118.77],
    width: 350,
  },
  binuatan: {
    from: [9.9400388, 118.820647], // NE coast S end (Honda Bay mouth)
    to: [9.9756, 118.9148], // toward Babuyan
    water: [9.96, 118.93],
    width: 400,
  },
  sabang: {
    from: [10.2098884, 118.8676876], // W end, St. Paul Bay shore
    to: [10.2076, 118.9381], // headland east of Sabang village
    water: [10.22, 118.9],
    width: 350,
  },
}

/**
 * Zones whose seaward flat-cap vertex is shared with another zone, so the
 * polygons tile exactly. Only used where both strips face the same way; at
 * the Sta. Lourdes wharf the coast turns ~90° (E-facing strip meets
 * N-facing strip), so those two take their natural caps instead and a small
 * wedge of open water stays uncovered at the headland — same as the
 * pp-bay / sta-lourdes seam at San Jose.
 */
const SHARED_CAPS: Array<[string, string]> = [['honda-inner', 'honda-outer']]

// ---------------------------------------------------------------- geometry --

const toRad = (d: number) => (d * Math.PI) / 180

function metersBetween(a: [number, number], b: [number, number]): number {
  const latM = (a[0] - b[0]) * 111_000
  const lngM = (a[1] - b[1]) * 111_000 * Math.cos(((a[0] + b[0]) / 2) * toRad(1))
  return Math.hypot(latM, lngM)
}

/** Distance from point p to segment [a, b], in metres. */
function distToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const k = Math.cos(toRad((a[0] + b[0]) / 2))
  const px = (p[1] - a[1]) * 111_320 * k
  const py = (p[0] - a[0]) * 110_540
  const bx = (b[1] - a[1]) * 111_320 * k
  const by = (b[0] - a[0]) * 110_540
  const len2 = bx * bx + by * by
  let t = len2 > 0 ? (px * bx + py * by) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - t * bx, py - t * by)
}

/** Min distance from p to a polyline. */
function distToPolyline(p: [number, number], poly: [number, number][]): number {
  let min = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const d = distToSegment(p, poly[i], poly[i + 1])
    if (d < min) min = d
  }
  return min
}

/** Densify a polyline so consecutive points are at most `step` m apart. */
function densify(poly: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [poly[0]]
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]
    const b = poly[i]
    const d = metersBetween(a, b)
    const n = Math.ceil(d / step)
    for (let j = 1; j <= n; j++) {
      out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n])
    }
  }
  return out
}

/** Douglas-Peucker simplification with tolerance ε (metres). Keeps endpoints. */
function simplifyDP(poly: [number, number][], eps: number): [number, number][] {
  if (poly.length <= 2) return poly.slice()
  const keep = new Array<boolean>(poly.length).fill(false)
  keep[0] = keep[poly.length - 1] = true
  const stack: Array<[number, number]> = [[0, poly.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    let maxD = -1
    let maxK = -1
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(poly[k], poly[i], poly[j])
      if (d > maxD) {
        maxD = d
        maxK = k
      }
    }
    if (maxD > eps && maxK > 0) {
      keep[maxK] = true
      stack.push([i, maxK], [maxK, j])
    }
  }
  return poly.filter((_, i) => keep[i])
}

type Pt = [number, number]

function orient(a: Pt, b: Pt, c: Pt): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const eps = 1e-9
  return v > eps ? 1 : v < -eps ? -1 : 0
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const o1 = orient(p1, p2, q1)
  const o2 = orient(p1, p2, q2)
  const o3 = orient(q1, q2, p1)
  const o4 = orient(q1, q2, p2)
  return o1 * o2 < 0 && o3 * o4 < 0
}

/** Proper intersection point of segments ab × cd, or null. */
function segIntersect(
  a: Pt,
  b: Pt,
  c: Pt,
  d: Pt,
): Pt | null {
  const r1 = orient(a, b, c)
  const r2 = orient(a, b, d)
  const r3 = orient(c, d, a)
  const r4 = orient(c, d, b)
  if (!(r1 * r2 < 0 && r3 * r4 < 0)) return null
  const denom = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
  if (Math.abs(denom) < 1e-12) return null
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denom
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

/** True iff the closed ring has no self-crossing edges. */
function ringIsSimple(ring: Pt[]): boolean {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (share a vertex) and the wrap-around pair
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]))
        return false
    }
  }
  return true
}

function pointStrictlyInside(p: Pt, ring: Pt[]): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const cross =
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    if (Math.abs(cross) < 1e-9) {
      const within =
        Math.min(a[0], b[0]) - 1e-12 <= p[0] &&
        p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
        Math.min(a[1], b[1]) - 1e-12 <= p[1] &&
        p[1] <= Math.max(a[1], b[1]) + 1e-12
      if (within) return false
    }
  }
  let inside = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (a[0] > p[0] !== b[0] > p[0]) {
      const lngAt = a[1] + ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0])
      if (p[1] < lngAt) inside = !inside
    }
  }
  return inside
}

function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j], b[(j + 1) % b.length])) return true
    }
    if (pointStrictlyInside(a1, b)) return true
  }
  for (const p of b) {
    if (pointStrictlyInside(p, a)) return true
  }
  return false
}

// ------------------------------------------------------- coastline graph ----

interface Way {
  id: number
  geometry: [number, number][]
}

function loadWays(): Way[] {
  const raw = JSON.parse(readFileSync(CACHE, 'utf8'))
  const byId = new Map<number, Way>()
  for (const w of [...Object.values(raw.regions).flat(), ...raw.documented] as Way[]) {
    if (!byId.has(w.id)) byId.set(w.id, { id: w.id, geometry: w.geometry })
  }
  return [...byId.values()]
}

interface Graph {
  coords: Map<string, [number, number]>
  adj: Map<string, Map<string, number>>
  key: (p: [number, number]) => string
}

function buildGraph(ways: Way[]): Graph {
  const key = (p: [number, number]) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`
  const coords = new Map<string, [number, number]>()
  const adj = new Map<string, Map<string, number>>()
  const link = (a: [number, number], b: [number, number]) => {
    const ka = key(a)
    const kb = key(b)
    coords.set(ka, a)
    coords.set(kb, b)
    if (!adj.has(ka)) adj.set(ka, new Map())
    if (!adj.has(kb)) adj.set(kb, new Map())
    const d = metersBetween(a, b)
    adj.get(ka)!.set(kb, d)
    adj.get(kb)!.set(ka, d)
  }
  for (const w of ways) {
    for (let i = 1; i < w.geometry.length; i++) link(w.geometry[i - 1], w.geometry[i])
  }
  return { coords, adj, key }
}

/** Dijkstra shortest path between the nodes nearest `from` and `to`. */
function shortestPath(
  g: Graph,
  from: [number, number],
  to: [number, number],
): { path: [number, number][]; hint: string } {
  const snap = (p: [number, number]) => {
    let best: string | null = null
    let bestD = Infinity
    for (const [k, c] of g.coords) {
      const d = metersBetween(c, p)
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    if (bestD > 200)
      throw new Error(
        `anchor ${p} snaps to ${bestD.toFixed(0)} m away — no coastline node`,
      )
    return best!
  }
  const start = snap(from)
  const goal = snap(to)
  const dist = new Map<string, number>([[start, 0]])
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  const pq: Array<[string, number]> = [[start, 0]]
  while (pq.length) {
    pq.sort((a, b) => a[1] - b[1])
    const [u, du] = pq.shift()!
    if (visited.has(u)) continue
    visited.add(u)
    if (u === goal) break
    for (const [v, w] of g.adj.get(u) ?? []) {
      const nd = du + w
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd)
        prev.set(v, u)
        pq.push([v, nd])
      }
    }
  }
  if (!visited.has(goal))
    throw new Error('no connected coastline path between anchors')
  const path: [number, number][] = []
  for (let k: string | undefined = goal; k; k = prev.get(k)) {
    path.unshift(g.coords.get(k)!)
  }
  return { path, hint: `${path.length} nodes, ${(dist.get(goal)! / 1000).toFixed(2)} km` }
}

/** All coastline segments, for chord-validity checks. */
function allSegments(ways: Way[]): Array<[Pt, Pt]> {
  const segs: Array<[Pt, Pt]> = []
  for (const w of ways) {
    for (let i = 1; i < w.geometry.length; i++) {
      segs.push([w.geometry[i - 1], w.geometry[i]])
    }
  }
  return segs
}

/**
 * Remove out-and-back coastal spurs (piers, fish pens, thin mangrove hooks)
 * from a coastline path: bridge from P[i] to P[j] when the sub-path between
 * them is long but its endpoints sit close together, PROVIDED the straight
 * bridge chord stays within 15 m of the real coastline — so the landward edge
 * only ever cuts across the foot of a thin water-side spur, never through a
 * headland or across a cove. Largest loop first; repeats until stable.
 */
function despikePath(path: [number, number][], segs: Array<[Pt, Pt]>, label: string): [number, number][] {
  const coastDist = (p: Pt) => {
    let min = Infinity
    for (const [a, b] of segs) {
      const d = distToSegment(p, a, b)
      if (d < min) min = d
    }
    return min
  }
  const chordHugsCoast = (a: Pt, b: Pt) => {
    const d = metersBetween(a, b)
    const steps = Math.max(1, Math.ceil(d / 10))
    for (let s = 0; s <= steps; s++) {
      const q: Pt = [
        a[0] + ((b[0] - a[0]) * s) / steps,
        a[1] + ((b[1] - a[1]) * s) / steps,
      ]
      if (coastDist(q) > 15) return false
    }
    return true
  }

  let p = path
  for (let round = 0; round < 400; round++) {
    const candidates: Array<{ i: number; j: number; subLen: number }> = []
    for (let i = 0; i < p.length - 2; i++) {
      for (let j = i + 2; j < p.length; j++) {
        const d = metersBetween(p[i], p[j])
        if (d > 400) continue
        let subLen = 0
        for (let k = i + 1; k <= j; k++) subLen += metersBetween(p[k - 1], p[k])
        if (subLen < 60) continue
        if (d > 0.4 * subLen + 20) continue
        candidates.push({ i, j, subLen })
      }
    }
    if (candidates.length === 0) break
    candidates.sort((a, b) => b.subLen - a.subLen)
    const pick = candidates.find((c) => chordHugsCoast(p[c.i], p[c.j]))
    if (!pick) break
    console.log(
      `  ${label}: bridged spur nodes ${pick.i}–${pick.j} (${pick.subLen.toFixed(0)} m path → ${metersBetween(p[pick.i], p[pick.j]).toFixed(0)} m chord)`,
    )
    p = [...p.slice(0, pick.i + 1), ...p.slice(pick.j)]
  }
  return p
}

// ------------------------------------------------------- seaward (buffer) ---

/**
 * Seaward edge = the water-side arc of a true geodesic line buffer of the
 * landward edge, cut flat where the buffer's end semicircles begin.
 *
 * Returns vertices ordered from the landward-END side to the landward-START
 * side, so `polygon = [...landward, ...seaward]` closes correctly.
 */
function seawardFromBuffer(
  landward: [number, number][],
  widthM: number,
  water: [number, number],
): [number, number][] {
  const line = lineString(landward.map(([lat, lng]) => [lng, lat]))
  const buf = turfBuffer(line, widthM / 1000, { units: 'kilometers' })
  if (!buf) throw new Error('turf buffer failed')

  // largest polygon ring, as [lat, lng]
  const polys =
    buf.geometry.type === 'Polygon'
      ? [buf.geometry.coordinates]
      : buf.geometry.type === 'MultiPolygon'
        ? buf.geometry.coordinates
        : []
  if (polys.length === 0) throw new Error('unexpected buffer geometry')
  let bestRing: [number, number][] = []
  let bestArea = -1
  for (const rings of polys) {
    const outer = rings[0]
    let area = 0
    for (let i = 0; i < outer.length - 1; i++) {
      area +=
        outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1]
    }
    if (Math.abs(area) > bestArea) {
      bestArea = Math.abs(area)
      bestRing = outer.map(([lng, lat]) => [lat, lng] as [number, number])
    }
  }
  const ring = bestRing

  const nearestIdx = (p: [number, number]) => {
    let bi = 0
    let bd = Infinity
    for (let i = 0; i < ring.length; i++) {
      const d = metersBetween(ring[i], p)
      if (d < bd) {
        bd = d
        bi = i
      }
    }
    return bi
  }

  // tangent at each landward end over ~150 m of context
  const endTangent = (atStart: boolean) => {
    const n = landward.length
    let a = atStart ? 0 : n - 1
    let b = a
    let acc = 0
    if (atStart) {
      for (let k = 0; k < n - 1 && acc < 150; k++) {
        acc += metersBetween(landward[k], landward[k + 1])
        b = k + 1
      }
    } else {
      for (let k = n - 1; k > 0 && acc < 150; k--) {
        acc += metersBetween(landward[k], landward[k - 1])
        a = k - 1
      }
    }
    const dx = landward[b][1] - landward[a][1]
    const dy = landward[b][0] - landward[a][0]
    const len = Math.hypot(dx, dy) || 1
    return [dx / len, dy / len] as [number, number] // [lng-dir, lat-dir]
  }
  const capCorner = (atStart: boolean, side: 1 | -1): [number, number] => {
    const [tx, ty] = endTangent(atStart)
    // left normal of the tangent in metric space: (-ty, tx) — side flips it
    const nx = -ty * side
    const ny = tx * side
    const v = atStart ? landward[0] : landward[landward.length - 1]
    const k = Math.cos(toRad(v[0]))
    return [v[0] + (ny * widthM) / 110_540, v[1] + (nx * widthM) / (111_320 * k)]
  }

  // per end, pick the cap-corner side that faces the open water
  const waterCorner = (atStart: boolean): [number, number] => {
    const a = capCorner(atStart, 1)
    const b = capCorner(atStart, -1)
    return metersBetween(a, water) <= metersBetween(b, water) ? a : b
  }
  const iS = nearestIdx(waterCorner(true))
  const iE = nearestIdx(waterCorner(false))
  // walk both arcs between iE and iS
  const arcF: [number, number][] = []
  for (let i = iE; ; i = (i + 1) % ring.length) {
    arcF.push(ring[i])
    if (i === iS) break
  }
  const arcB: [number, number][] = []
  for (let i = iE; ; i = (i - 1 + ring.length) % ring.length) {
    arcB.push(ring[i])
    if (i === iS) break
  }
  const midOf = (arc: [number, number][]) => arc[Math.floor(arc.length / 2)]
  const score = (arc: [number, number][]) =>
    metersBetween(midOf(arc), water)
  const waterArc = score(arcF) <= score(arcB) ? arcF : arcB
  return waterArc
}

// ------------------------------------------------------------- generation ---

interface ZoneResult {
  id: string
  landward: [number, number][]
  seaward: [number, number][]
  width: number
  wayIds: number[]
}

const round6 = (p: [number, number]): [number, number] => [
  Number(p[0].toFixed(6)),
  Number(p[1].toFixed(6)),
]

function main() {
  const ways = loadWays()
  console.log(`coastline cache: ${ways.length} ways`)
  const g = buildGraph(ways)
  console.log(`graph: ${g.coords.size} nodes`)
  const segs = allSegments(ways)

  const results: ZoneResult[] = []
  const paths: Record<string, [number, number][]> = {}
  for (const [id, cfg] of Object.entries(ZONE_RUNS)) {
    const sp = shortestPath(g, cfg.from, cfg.to)
    const despiked = despikePath(sp.path, segs, id)
    const pathKm = sp.path.reduce(
      (s, p, i) => (i ? s + metersBetween(sp.path[i - 1], p) : 0),
      0,
    )
    const despikedKm = despiked.reduce(
      (s, p, i) => (i ? s + metersBetween(despiked[i - 1], p) : 0),
      0,
    )
    if (despikedKm < pathKm - 5)
      console.log(
        `  ${id}: path ${(pathKm / 1000).toFixed(2)} km → ${(despikedKm / 1000).toFixed(2)} km after spur bridging`,
      )
    paths[id] = despiked
    const dense = densify(despiked, 20)
    const landward = simplifyDP(dense, 8).map(round6)
    const seaward = simplifyDP(seawardFromBuffer(landward, cfg.width, cfg.water), 15).map(round6)

    // provenance: which documented ways contributed nodes
    const nodeSet = new Set(despiked.map((p) => g.key(p)))
    const wayIds = ways
      .filter((w) => w.geometry.some((p) => nodeSet.has(g.key(p))))
      .map((w) => w.id)
      .sort((a, b) => a - b)
    results.push({ id, landward, seaward, width: cfg.width, wayIds })
    console.log(
      `${id}: landward ${landward.length} vtx, seaward ${seaward.length} vtx, run ${sp.hint}, ways ${wayIds.join(',')}`,
    )
  }

  // ---- shared flat caps: make neighbouring cap vertices identical
  const byId = Object.fromEntries(results.map((r) => [r.id, r]))
  for (const [aId, bId] of SHARED_CAPS) {
    const a = byId[aId]
    const b = byId[bId]
    // seaward[] runs landward-END → landward-START
    const capOf = (z: ZoneResult, other: ZoneRun): 'first' | 'last' =>
      metersBetween(z.landward[z.landward.length - 1], other.from) < 60 ||
      metersBetween(z.landward[z.landward.length - 1], other.to) < 60
        ? 'first'
        : 'last'
    const aEnd = capOf(a, ZONE_RUNS[bId])
    const bEnd = capOf(b, ZONE_RUNS[aId])
    const aCap = aEnd === 'first' ? a.seaward[0] : a.seaward[a.seaward.length - 1]
    const bCap = bEnd === 'first' ? b.seaward[0] : b.seaward[b.seaward.length - 1]
    const shared: [number, number] = [
      Number(((aCap[0] + bCap[0]) / 2).toFixed(6)),
      Number(((aCap[1] + bCap[1]) / 2).toFixed(6)),
    ]
    if (aEnd === 'first') a.seaward[0] = shared
    else a.seaward[a.seaward.length - 1] = shared
    if (bEnd === 'first') b.seaward[0] = shared
    else b.seaward[b.seaward.length - 1] = shared
    console.log(
      `shared cap ${aId}(${aEnd})|${bId}(${bEnd}): (${shared[0]}, ${shared[1]}) — cap spread was ${metersBetween(aCap, bCap).toFixed(1)} m`,
    )
  }

  // -------------------------------- verification -----------------------------
  const coastlineByZone: Record<string, [number, number][]> = {}
  let failures = 0
  const fail = (msg: string) => {
    console.error(`  ✗ ${msg}`)
    failures++
  }

  for (const r of results) {
    // Reference = the raw OSM node run (no interpolation): interpolated points
    // lie ON its segments, so distance-to-polyline is identical either way.
    coastlineByZone[r.id] = paths[r.id].map(round6)
    const ring = [...r.landward, ...r.seaward]
    const samples: number[] = []
    for (let i = 0; i < r.landward.length - 1; i++) {
      const a = r.landward[i]
      const b = r.landward[i + 1]
      const steps = Math.max(1, Math.ceil(metersBetween(a, b) / 8))
      for (let s = 0; s <= steps; s++) {
        samples.push(
          distToPolyline(
            [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps],
            paths[r.id],
          ),
        )
      }
    }
    const maxDev = Math.max(...samples)
    const meanDev = samples.reduce((s, d) => s + d, 0) / samples.length
    console.log(
      `  ${r.id}: landward deviation mean ${meanDev.toFixed(1)} m, max ${maxDev.toFixed(1)} m`,
    )
    if (maxDev > 15)
      fail(`${r.id} landward edge deviates ${maxDev.toFixed(1)} m from the coastline`)
    if (!ringIsSimple(ring)) {
      const n = ring.length
      let located = ''
      for (let i = 0; i < n && !located; i++) {
        for (let j = i + 2; j < n; j++) {
          if (j === i + 1 || (i === 0 && j === n - 1)) continue
          const x = segIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])
          if (x) {
            located = ` near [${x[0].toFixed(5)}, ${x[1].toFixed(5)}] (edges ${i}/${j})`
            break
          }
        }
      }
      fail(`${r.id} polygon is not simple (self-intersects)${located}`)
    }
    // strip width sampled along the seaward edge
    const widths: number[] = r.seaward.map((p) => distToPolyline(p, r.landward))
    const wMean = widths.reduce((s, d) => s + d, 0) / widths.length
    const wMinI = widths.indexOf(Math.min(...widths))
    const wMin = widths[wMinI]
    const wMax = Math.max(...widths)
    console.log(
      `  ${r.id}: width mean ${wMean.toFixed(0)} m (min ${wMin.toFixed(0)}, max ${wMax.toFixed(0)}), target ${r.width} m`,
    )
    if (wMin < r.width * 0.8) fail(`${r.id} strip narrows to ${wMin.toFixed(0)} m`)
    if (wMax > r.width * 1.15) fail(`${r.id} strip widens to ${wMax.toFixed(0)} m`)
  }

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = [...results[i].landward, ...results[i].seaward]
      const b = [...results[j].landward, ...results[j].seaward]
      if (polygonsOverlap(a, b)) {
        let where = ''
        outer: for (let x = 0; x < a.length; x++) {
          for (let y = 0; y < b.length; y++) {
            if (segmentsCross(a[x], a[(x + 1) % a.length], b[y], b[(y + 1) % b.length])) {
              const p = a[x]
              const q = b[y]
              where = ` edges ${x}/${y} near [${p[0].toFixed(5)}, ${p[1].toFixed(5)}] vs [${q[0].toFixed(5)}, ${q[1].toFixed(5)}]`
              break outer
            }
          }
          if (pointStrictlyInside(a[x], b)) {
            where = ` vertex ${x} inside`
            break
          }
        }
        fail(`${results[i].id} overlaps ${results[j].id}${where}`)
      }
    }
  }
  if (failures) {
    console.error(`\n${failures} verification failure(s) — not writing files.`)
    process.exit(1)
  }
  console.log('verification passed')

  if (CHECK_ONLY) {
    console.log('--check: no files written')
    return
  }

  // ------------------------------------ write --------------------------------
  const fmt = (pts: [number, number][], indent: string) =>
    pts.map(([lat, lng]) => `${indent}[${lat}, ${lng}],`).join('\n')

  // 1. zones.ts — patch each polygon array in place
  let zonesSrc = readFileSync(ZONES_TS, 'utf8')
  for (const r of results) {
    const re = new RegExp(
      `(id: '${r.id}',[\\s\\S]*?polygon: \\[\\n)([\\s\\S]*?)(\\n    \\],)`,
    )
    if (!re.test(zonesSrc)) throw new Error(`could not locate polygon block for ${r.id}`)
    zonesSrc = zonesSrc.replace(
      re,
      (_m, head: string, _body: string, tail: string) =>
        `${head}${fmt([...r.landward, ...r.seaward], '      ')}${tail}`,
    )
  }
  writeFileSync(ZONES_TS, zonesSrc)
  console.log(`wrote ${ZONES_TS}`)

  // 2. coastline.ts — dense reference runs for the tolerance test
  const header = `/**
 * Dense reference runs of the REAL OpenStreetMap coastline behind each zone's
 * landward edge — the ground truth that \`zones.test.ts\` measures the polygons
 * against (landward edge must stay within 20 m of these lines).
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *
 *   npx tsx scripts/generate-zones.ts
 *
 * Source: scripts/coastline-cache/osm-coastline.json, fetched from the OSM API
 * and Overpass by CI (scripts/fetch-coastline.mjs). These are the raw OSM
 * coastline nodes of each zone's run, in order, [lat, lng], 6-decimal
 * (~0.1 m) rounding.
 */

export const COASTLINE_RUNS: Record<string, [number, number][]> = {
`
  const body = Object.entries(coastlineByZone)
    .map(([id, pts]) => `  '${id}': [\n${fmt(pts, '    ')}\n  ],`)
    .join('\n\n')
  writeFileSync(COASTLINE_TS, `${header}${body}\n}\n`)
  console.log(`wrote ${COASTLINE_TS}`)
}

main()
