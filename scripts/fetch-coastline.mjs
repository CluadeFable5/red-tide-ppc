#!/usr/bin/env node
/**
 * Fetch the real OpenStreetMap `natural=coastline` geometry for the stretches
 * of shore behind the zone polygons in `src/data/zones.ts`.
 *
 * This sandbox/dev environment cannot reach the OSM or Overpass APIs directly
 * (egress is blocked), but GitHub Actions runners can. CI runs this script and
 * uploads the result as the `coastline-raw` artifact; the dev pulls it back
 * with `gh run download -n coastline-raw`. See .github/workflows/fetch-coastline.yml.
 *
 * Output: JSON file mapping each region to the coastline ways inside its bbox,
 * each way as an ordered [[lat, lng], ...] geometry, plus a flat merge of the
 * documented OSM ways (fetched from the main OSM API as a cross-check).
 *
 *   node scripts/fetch-coastline.mjs [output.json]
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? 'coastline-raw/overpass-coastline.json')

/** One bbox per zone stretch, with ~0.02° margin. [south, west, north, east] */
const REGIONS = {
  'pp-bay': [9.7, 118.71, 9.79, 118.79],
  'sta-lourdes': [9.75, 118.72, 9.87, 118.79],
  honda: [9.83, 118.72, 9.95, 118.79],
  binuatan: [9.92, 118.8, 10.0, 118.93],
  sabang: [10.18, 118.85, 10.23, 118.95],
}

/**
 * The way ids documented in the header of src/data/zones.ts — fetched
 * explicitly from the main OSM API as a cross-check that the Overpass bbox
 * sweep caught everything the polygons were drawn against.
 */
const DOCUMENTED_WAYS = [
  1201582689, 1201581683, 1201581684, 4247188, // pp-bay shore + port basin
  62049956, // sta-lourdes peninsula east coast
  1530225665, 1530225667, 1530236382, // honda-inner bay west shore
  62050018, 1530271755, // honda-outer mangrove shore + creek mouth
  1530291482, 62049965, // binuatan Honda Bay north shore + NE coast
  61557844, 62049996, // sabang St. Paul Bay shore + east headland
  1530271757, // mangrove creek complex (context only; never traced)
]

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const bboxQuery = (r) =>
  `(way["natural"="coastline"](${r.join(',')}););out geom;`

async function fetchJson(url, init, timeoutMs = 120_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOverpass() {
  const query = `[out:json][timeout:180];${Object.values(REGIONS)
    .map(bboxQuery)
    .join('')}out geom;`
  let lastErr
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Trying Overpass endpoint ${endpoint} ...`)
      const data = await fetchJson(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      console.log(`OK: ${data.elements?.length ?? 0} elements`)
      return data
    } catch (err) {
      console.log(`  failed: ${err.message}`)
      lastErr = err
    }
  }
  throw lastErr
}

async function fetchDocumentedWay(id) {
  const data = await fetchJson(
    `https://api.openstreetmap.org/api/0.6/way/${id}/full.json`,
  )
  const nodes = new Map(
    data.elements
      .filter((el) => el.type === 'node')
      .map((el) => [el.id, [el.lat, el.lon]]),
  )
  const way = data.elements.find((el) => el.type === 'way' && el.id === id)
  if (!way) throw new Error(`way ${id} missing from response`)
  return {
    id,
    geometry: way.nodes.map((n) => nodes.get(n)).filter(Boolean),
  }
}

const main = async () => {
  const overpass = await fetchOverpass()

  const byRegion = {}
  for (const [region, [s, w, n, e]] of Object.entries(REGIONS)) {
    byRegion[region] = []
  }
  const seen = new Set()
  for (const el of overpass.elements ?? []) {
    if (el.type !== 'way' || !el.geometry) continue
    if (seen.has(el.id)) continue
    seen.add(el.id)
    const coords = el.geometry.map((g) => [g.lat, g.lon])
    for (const [region, [s, w, n, e]] of Object.entries(REGIONS)) {
      // Assign a way to every region whose bbox contains any of its points.
      if (coords.some(([lat, lng]) => lat >= s && lat <= n && lng >= w && lng <= e)) {
        byRegion[region].push({ id: el.id, geometry: coords })
      }
    }
  }

  let documented = []
  const docFails = []
  const results = await Promise.allSettled(DOCUMENTED_WAYS.map(fetchDocumentedWay))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') documented.push(r.value)
    else docFails.push(`${DOCUMENTED_WAYS[i]}: ${r.reason?.message}`)
  })
  if (docFails.length) console.log('Documented-way fallback misses:', docFails.join('; '))

  const summary = Object.fromEntries(
    Object.entries(byRegion).map(([k, v]) => [
      k,
      `${v.length} ways, ${v.reduce((n, w) => n + w.geometry.length, 0)} nodes`,
    ]),
  )
  console.log('Per-region:', JSON.stringify(summary, null, 2))

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify(
      { fetchedAt: new Date().toISOString(), regions: byRegion, documented },
      null,
      1,
    ),
  )
  console.log(`Wrote ${OUT}`)
}

main().catch((err) => {
  console.error('FETCH FAILED:', err?.message ?? err)
  process.exit(1)
})
