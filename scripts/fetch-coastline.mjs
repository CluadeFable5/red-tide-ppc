/**
 * TEMPORARY helper (Arena session, 2026-09-18) — not part of the app.
 *
 * Downloads the real OpenStreetMap coastline (and a few anchor features)
 * around Puerto Princesa from the Overpass API and writes a compact snapshot
 * under `.cache/coastline/` (git-ignored) so the advisory-zone polygons in
 * `src/data/zones.ts` can be re-plotted against the actual shoreline.
 *
 * It runs on a GitHub Actions runner because the coding sandbox cannot reach
 * Overpass directly. Delete this file (and
 * `.github/workflows/coastline-data.yml`) once the polygons are re-plotted.
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
        process.stdout.write(`-> ${url} (attempt ${attempt})... `)
        const response = await fetch(url, {
          method: 'POST',
          body,
          headers: { 'User-Agent': 'red-tide-ppc-coastline-plot/1.0' },
          signal: AbortSignal.timeout(240_000),
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
        }
        const json = JSON.parse(text)
        console.log(`ok (${json.elements?.length ?? 0} elements)`)
        return json
      } catch (error) {
        console.log(`failed - ${error.message}`)
        errors.push(`${url}: ${error.message}`)
      }
    }
  }
  throw new Error(`All Overpass mirrors failed:\n${errors.join('\n')}`)
}

const round = (value) => Math.round(value * 1e5) / 1e5 // ~1 m

/** Normalise the Overpass payload into a compact, stable shape. */
function normalise(payload) {
  const coastline = []
  const areas = []
  const points = []

  for (const element of payload.elements) {
    if (element.type === 'way' && element.geometry) {
      const entry = {
        id: element.id,
        tags: Object.fromEntries(
          Object.entries(element.tags ?? {}).filter(([key]) =>
            [
              'natural',
              'wetland',
              'man_made',
              'waterway',
              'name',
              'landuse',
              'water',
              'surface',
            ].includes(key),
          ),
        ),
        coords: element.geometry.map(({ lat, lon }) => [round(lat), round(lon)]),
      }
      if (element.tags?.natural === 'coastline') coastline.push(entry)
      else areas.push(entry)
    } else if (element.type === 'node') {
      points.push({
        id: element.id,
        tags: element.tags ?? {},
        coords: [round(element.lat), round(element.lon)],
      })
    }
  }

  return {
    bbox: BBOX,
    source: 'OpenStreetMap via Overpass API (ODbL)',
    coastline,
    areas,
    points,
  }
}

const outDir = '.cache/coastline'
await mkdir(outDir, { recursive: true })

const payload = await fetchOverpass()
const normalised = normalise(payload)
await writeFile(`${outDir}/coastline.json`, JSON.stringify(normalised))

const nodes = normalised.coastline.reduce((sum, way) => sum + way.coords.length, 0)
const stats = [
  `coastline ways:  ${normalised.coastline.length}`,
  `coastline nodes: ${nodes}`,
  `area ways:       ${normalised.areas.length}`,
  `point features:  ${normalised.points.length}`,
  `snapshot size:   ${JSON.stringify(normalised).length} bytes`,
  '',
  'way ids (coastline):',
  normalised.coastline.map((way) => `  ${way.id}`).join('\n'),
].join('\n')

await writeFile(`${outDir}/README.txt`, stats)
console.log(stats)
