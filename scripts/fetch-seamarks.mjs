#!/usr/bin/env node
/**
 * Fetch seamark / navigation-feature data (`seamark:type=*`) around Puerto
 * Princesa Bay and Honda Bay from Overpass, to establish whether OpenStreetMap
 * carries any real shipping-lane, traffic-separation or navigational-route
 * data for the area — the raw input for the navigation-hazard overlay idea.
 *
 * This is deliberately SEPARATE from scripts/fetch-coastline.mjs and the
 * coastline cache: that query asks for `natural=coastline` only and carries no
 * seamark tags. This script, cache directory and workflow are independent.
 *
 * The dev sandbox has no egress to the Overpass/OSM APIs; CI runners do.
 * This runs in CI and the raw result is committed back to the branch at
 * scripts/seamark-cache/osm-seamarks.json (same workaround as the coastline
 * fetch — run logs and artifacts are not downloadable from the sandbox).
 *
 *   node scripts/fetch-seamarks.mjs [output.json]
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? 'scripts/seamark-cache/osm-seamarks.json')

/** Puerto Princesa Bay + Honda Bay + the north coast to Sabang, padded. */
const LOCAL_BBOX = [9.55, 118.55, 10.4, 119.05]

/** Philippine waters — to locate the nearest REAL mapped traffic-separation
 * scheme for honest context when the local area has none. */
const PH_BBOX = [4.0, 114.0, 22.5, 129.5]

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const errors = []

/** curl one URL; returns parsed JSON. Records failures into `errors`. */
function curlJson(url, { data = null, timeoutSec = 120 } = {}) {
  const args = [
    '-sS',
    '--max-time',
    String(timeoutSec),
    '-w',
    '\n%{http_code}',
    '-H',
    'User-Agent: red-tide-ppc-seamark-fetch/1.0',
    url,
  ]
  if (data) args.push('-X', 'POST', '--data-binary', data)
  let out
  try {
    out = execFileSync('curl', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: process.env, // curl honours HTTPS_PROXY etc.
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

function runOverpass(query, label) {
  const encoded = 'data=' + encodeURIComponent(query)
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Overpass ${label} via ${endpoint} ...`)
      const data = curlJson(endpoint, { data: encoded, timeoutSec: 300 })
      console.log(`  OK: ${data.elements?.length ?? 0} elements`)
      return data
    } catch (err) {
      console.log(`  ${err.message}`)
    }
  }
  throw new Error(`all Overpass endpoints failed for ${label}`)
}

/** Route/navigation-relevant seamark types (as opposed to buoys, lights etc.) */
const ROUTE_TYPES =
  '^(separation_|one_way_route|two_way_route|recommended_track|recommended_traffic_lane|traffic_route|deep_water_route|precautionary_area|inshore_traffic_zone|navigation_line|fairway)$'

function countByType(elements) {
  const counts = {}
  for (const el of elements) {
    const t = el.tags?.['seamark:type'] ?? '(no seamark:type)'
    counts[t] = (counts[t] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}

const main = () => {
  // 1. EVERY seamark-tagged object in the local bays — the honest answer to
  //    "does OSM have navigation data here?", whatever it turns out to be.
  const localQuery = `[out:json][timeout:180];(nwr["seamark:type"](${LOCAL_BBOX.join(',')}););out geom;`
  const local = runOverpass(localQuery, 'local seamark:sweep')

  // 2. Philippine-wide: where are the nearest real route/traffic-separation
  //    features, if the local sweep comes back empty?
  const phQuery = `[out:json][timeout:180];(nwr["seamark:type"~"${ROUTE_TYPES}"](${PH_BBOX.join(',')}););out center;`
  const ph = runOverpass(phQuery, 'philippine route sweep')

  const localElements = local.elements ?? []
  const phElements = ph.elements ?? []
  const localCounts = countByType(localElements)
  const phCounts = countByType(phElements)
  console.log('Local seamark:type counts:', JSON.stringify(localCounts, null, 1))
  console.log('PH route-relevant counts:', JSON.stringify(phCounts, null, 1))

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        localBbox: LOCAL_BBOX,
        phBbox: PH_BBOX,
        localElements,
        localCounts,
        phElements,
        phCounts,
      },
      null,
      1,
    ),
  )
  console.log(`Wrote ${OUT}`)
}

try {
  main()
} catch (err) {
  console.error(
    `::error::Seamark fetch failed. Errors: ${errors.slice(0, 6).join(' || ').slice(0, 3000)} | ${err?.message ?? err}`,
  )
  console.error('FETCH FAILED:', err?.message ?? err)
  process.exit(1)
}
