/**
 * TEMPORARY helper (Arena session, 2026-09-18) — not part of the app.
 *
 * Downloads the real OpenStreetMap coastline (and a few anchor features)
 * around Puerto Princesa from the Overpass API and writes it under
 * `.cache/coastline/` (git-ignored) so the advisory-zone polygons in
 * `src/data/zones.ts` can be re-plotted against the actual shoreline.
 *
 * It runs on a GitHub Actions runner because the coding sandbox cannot reach
 * Overpass directly. Output is uploaded as a workflow artifact, never
 * committed. Delete this file (and `.github/workflows/coastline-data.yml`)
 * once the polygons are re-plotted.
 */
import { mkdir, writeFile } from 'node:fs/promises'

const BBOX = [9.62, 118.58, 10.32, 119.02] // south, west, north, east
const bbox = BBOX.join(',')

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
]

const QUERY = `[out:json][timeout:300];
way["natural"="coastline"](${bbox});
out geom;
(
  way["natural"~"^(reef|shoal|sand|beach|wetland)$"](${bbox});
  way["wetland"="mangrove"](${bbox});
  way["man_made"~"^(pier|breakwater|groyne|jetty|quay|wharf)$"](${bbox});
  way["waterway"~"^(riverbank|dock)$"](${bbox});
  way["natural"="water"](${bbox});
);
out geom;
(
  node["place"~"^(village|hamlet|town|neighbourhood|suburb|locality|islet)$"](${bbox});
  node["natural"~"^(bay|cape|beach|reef|peak)$"](${bbox});
  node["man_made"~"^(lighthouse|beacon)$"](${bbox});
  node["amenity"="ferry_terminal"](${bbox});
  node["seamark:type"~"^(light|beacon|buoy)$"](${bbox});
);
out;`

async function fetchOverpass() {
  const body = new URLSearchParams({ data: QUERY })
  const errors = []
  for (const url of MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        process.stdout.write(`→ ${url} (attempt ${attempt})… `)
        const response = await fetch(url, {
          method: 'POST',
          body,
          headers: { 'User-Agent': 'red-tide-ppc-coastline-plot/1.0' },
          signal: AbortSignal.timeout(240_000),
        })
        const text = await response.text()
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
        const json = JSON.parse(text)
        console.log(`ok (${json.elements?.length ?? 0} elements)`)
        return json
      } catch (error) {
        console.log(`failed — ${error.message}`)
        errors.push(`${url}: ${error.message}`)
      }
    }
  }
  throw new Error(`All Overpass mirrors failed:\n${errors.join('\n')}`)
}

/** Normalise the Overpass payload into a small, stable shape. */
function normalise(payload) {
  const coastline = []
  const areas = []
  const points = []

  for (const element of payload.elements) {
    if (element.type === 'way' && element.geometry) {
      const entry = {
        id: element.id,
        tags: element.tags ?? {},
        coords: element.geometry.map(({ lat, lon }) => [lat, lon]),
      }
      if (element.tags?.natural === 'coastline') coastline.push(entry)
      else areas.push(entry)
    } else if (element.type === 'node') {
      points.push({
        id: element.id,
        tags: element.tags ?? {},
        coords: [element.lat, element.lon],
      })
    }
  }

  return { bbox: BBOX, coastline, areas, points }
}

const outDir = '.cache/coastline'
await mkdir(outDir, { recursive: true })

const payload = await fetchOverpass()
await writeFile(`${outDir}/overpass-raw.json`, JSON.stringify(payload))
console.log('wrote overpass-raw.json')

const normalised = normalise(payload)
await writeFile(`${outDir}/coastline.json`, JSON.stringify(normalised))

const nodes = normalised.coastline.reduce((sum, way) => sum + way.coords.length, 0)
console.log(
  `coastline ways: ${normalised.coastline.length} (${nodes} nodes), ` +
    `area ways: ${normalised.areas.length}, nodes: ${normalised.points.length}`,
)
