# Coastline cache

Raw OpenStreetMap `natural=coastline` geometry fetched by CI
(`.github/workflows/fetch-coastline.yml` → `scripts/fetch-coastline.mjs`) and
committed back to the branch, because the dev sandbox has no direct egress to
the OSM/Overpass APIs.

- `osm-coastline.json` — per-region bbox sweep plus the documented ways from
  `src/data/zones.ts`, each as ordered `[lat, lng]` node runs.
- Consumed by `scripts/generate-zones.ts`, which extracts each zone's landward
  coastline run, writes the curated reference into `src/data/coastline.ts`, and
  regenerates the zone polygons.

Re-fetch: edit any comment line in `scripts/fetch-coastline.mjs` and push.
