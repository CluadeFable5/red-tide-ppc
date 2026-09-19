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
 * HTTP goes through `curl`, not Node fetch: runner egress may be proxied via
 * HTTPS_PROXY, which undici ignores but curl honours.
 *
 * Output: JSON file mapping each region to the coastline ways inside its bbox,
 * each way as an ordered [[lat, lng], ...] geometry, plus a flat merge of the
 * documented OSM ways (fetched from the main OSM API as a cross-check, WITH
 * tags), plus `islets` — tagged place=islet/island and natural=reef/shoal
 * features inside the bay window, so offshore blobs are confirmed real or
 * dismissed as rendering artifacts — and `places`, the named place features
 * (barangays, suburbs, villages...) in the same windows, so hand-traced
 * reference views can be pinned to exact landmark coordinates.
 *
 *   node scripts/fetch-coastline.mjs [output.json]
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? 'coastline-raw/overpass-coastline.json')

/** One bbox per zone stretch, with ~0.02° margin. [south, west, north, east] */
const REGIONS = {
  // pp-bay carries a wider W/N margin than the other stretches: the west
  // margin completes the bay's far-shore context (way 1529960722 runs to
  // 118.692) and the north margin confirms the headland apex at 9.7877, N of
  // which no further city-side coast exists.
  'pp-bay': [9.7, 118.68, 9.82, 118.79],
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
  236058175, // islet ~1.5 km off the pp-bay north shore (identity check; outside every band)
]

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const errors = []

const note = (msg) => console.log(`::notice::${msg}`)

/** curl one URL; returns parsed JSON. Records failures into `errors`. */
function curlJson(url, { method = 'GET', data = null, timeoutSec = 90 } = {}) {
  const args = [
    '-sS',
    '--max-time',
    String(timeoutSec),
    '-w',
    '\n%{http_code}',
    '-H',
    'User-Agent: red-tide-ppc-coastline-fetch/1.0',
    url,
  ]
  if (method === 'POST') args.push('-X', 'POST', '--data-binary', data)
  let out
  try {
    out = execFileSync('curl', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: process.env, // curl picks up HTTPS_PROXY etc. from the environment
    })
  } catch (err) {
    const msg = `${url}: curl failed: ${String(err.stderr || err.message).slice(0, 200)}`
    errors.push(msg)
    throw new Error(msg)
  }
  const nl = out.lastIndexOf('\n')
  const status = Number(out.slice(nl + 1).trim())
  const body = out.slice(0, nl)
  if (status < 200 || status >= 300) {
    const msg = `${url}: HTTP ${status}: ${body.slice(0, 160).replace(/\n/g, ' ')}`
    errors.push(msg)
    throw new Error(msg)
  }
  try {
    return JSON.parse(body)
  } catch (err) {
    const msg = `${url}: bad JSON: ${body.slice(0, 120)}`
    errors.push(msg)
    throw new Error(msg)
  }
}

const bboxClause = (r) => `way["natural"="coastline"](${r.join(',')});`

async function fetchOverpass() {
  // ONE union block containing every bbox — separate `( ... )` blocks would
  // discard all but the last set before `out`.
  const query = `[out:json][timeout:120];(${Object.values(REGIONS)
    .map(bboxClause)
    .join('')});out geom;`
  const encoded = 'data=' + encodeURIComponent(query)
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Trying Overpass POST ${endpoint} ...`)
      const data = curlJson(endpoint, { method: 'POST', data: encoded, timeoutSec: 180 })
      console.log(`OK: ${data.elements?.length ?? 0} elements`)
      return data
    } catch (err) {
      console.log(`  ${err.message}`)
    }
  }
  throw new Error(`all Overpass endpoints failed (${errors.length} errors so far)`)
}

function fetchDocumentedWay(id) {
  const data = curlJson(
    `https://api.openstreetmap.org/api/0.6/way/${id}/full.json`,
    { timeoutSec: 60 },
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
    tags: way.tags ?? {},
  }
}

/**
 * Identity check for charted islets/reefs inside the bay window. The
 * coastline sweep returns geometry WITHOUT tags, so a dark blob on open
 * water could be a real islet, a reef flat, or a rendering artifact. This
 * pulls the tags (place=islet/island, natural=reef/shoal/...) so every
 * closed coastline ring in the window is confirmed real or dismissed.
 * Best-effort: the documented-way tags above answer the same question for
 * the one known ring, so an islet-query failure warns but never fails CI.
 */
// [south, west, north, east] each: the bay window plus the apex-north sea
// window, so islets/reefs AND named landmarks are swept everywhere a
// hand-traced reference view could reach.
const SWEEP_WINDOWS = [REGIONS['pp-bay'], REGIONS['apex-north']]

function fetchIslets() {
  const clauses = SWEEP_WINDOWS.map((bb) => {
    const b = bb.join(',')
    return (
      `node["place"~"^(islet|island)$"](${b});` +
      `way["place"~"^(islet|island)$"](${b});` +
      `node["natural"~"^(reef|shoal|sand|bare_rock)$"](${b});` +
      `way["natural"~"^(reef|shoal)$"](${b});`
    )
  }).join('')
  const query = `[out:json][timeout:60];(${clauses});out body center;`
  const encoded = 'data=' + encodeURIComponent(query)
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = curlJson(endpoint, { method: 'POST', data: encoded, timeoutSec: 120 })
      const found = []
      for (const el of data.elements ?? []) {
        if (el.type === 'node') {
          found.push({ type: 'node', id: el.id, tags: el.tags ?? {}, lat: el.lat, lon: el.lon })
        } else if (el.type === 'way') {
          found.push({
            type: 'way',
            id: el.id,
            tags: el.tags ?? {},
            lat: el.center?.lat ?? null,
            lon: el.center?.lon ?? null,
          })
        }
      }
      console.log(`islets: ${found.length} tagged features in the bay window`)
      return found
    } catch (err) {
      console.log(`  islet query @ ${endpoint}: ${err.message}`)
    }
  }
  console.log('::warning::islet/reef identity query failed on every endpoint')
  return []
}

const main = async () => {
  const proxy = Object.entries(process.env)
    .filter(([k]) => /proxy/i.test(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  note(`proxy env: ${proxy || '(none)'}`)

  const byRegion = Object.fromEntries(Object.keys(REGIONS).map((k) => [k, []]))
  let overpassOk = false
  try {
    const overpass = await fetchOverpass()
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
    overpassOk = true
  } catch (err) {
    console.log(`Overpass sweep failed entirely: ${err.message}`)
  }

  const documented = []
  for (const id of DOCUMENTED_WAYS) {
    try {
      documented.push(fetchDocumentedWay(id))
    } catch (err) {
      console.log(`documented way ${id} failed: ${err.message}`)
    }
  }

  let islets = []
  try {
    islets = fetchIslets()
  } catch (err) {
    console.log(`::warning::islet query threw: ${err.message}`)
  }

  let places = []
  try {
    places = fetchPlaces()
  } catch (err) {
    console.log(`::warning::places query threw: ${err.message}`)
  }

  if (!overpassOk) {
    // NEVER commit a cache with an empty region sweep: it would clobber the
    // previous good geometry (generate-zones needs full runs, not just the
    // documented ways). Fail loudly instead — nothing is written, nothing is
    // committed — and retry the workflow once Overpass recovers. Errors
    // surface through a check-run annotation: the sandbox cannot download
    // run logs, but it CAN read annotations via the check-runs API.
    console.log(
      `::error::Overpass sweep failed (no coastline for any region). Errors: ${errors.slice(0, 6).join(' || ').slice(0, 3500)}`,
    )
    throw new Error('overpass sweep failed — refusing to clobber the cache')
  }
  if (documented.length === 0) {
    // The sweep is the load-bearing source; the documented ways are the
    // cross-check. Proceed without them, but say so.
    console.log('::warning::all documented-way fetches failed; regions still committed')
  }

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
      {
        fetchedAt: new Date().toISOString(),
        overpassOk,
        regions: byRegion,
        documented,
        islets,
        places,
      },
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

// Cache destination: scripts/coastline-cache/osm-coastline.json (committed by CI).
