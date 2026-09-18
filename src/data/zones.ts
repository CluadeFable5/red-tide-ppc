import type { LatLng, ZoneStatus } from '../types'

/**
 * Pre-seeded zones for the Puerto Princesa coastline.
 *
 * These are hand-drawn, APPROXIMATE coastal areas — good enough to tell a
 * fisherman "this is your bay", not a survey boundary.
 *
 * HOW THE SHAPES ARE BUILT (re-plotted 2026-09-18)
 * ------------------------------------------------
 * Every zone is ONE simple polygon of exactly 12 vertices: a nearshore band.
 *
 *   - the LANDWARD edge is a run of real OpenStreetMap coastline nodes,
 *     simplified by hand to 6 corners (8-33 mapped nodes per zone were
 *     reduced; corners were chosen so no straight chord cuts more than
 *     ~165 m across land, and none leaves more than ~430 m of nearshore
 *     water uncovered);
 *   - the SEAWARD edge is that same run offset 300-400 m perpendicular into
 *     the water, miter-joined at each corner and capped at 1.35x the band
 *     width so sharp bends (the port basin corner, the creek mouth) cannot
 *     spike out to sea.
 *
 * So each zone is a contiguous ribbon of shallow water 1.4-4.7 km2 in area,
 * following the contour of its bay or inlet — never a raw coastline trace,
 * never a sliver, never self-intersecting. Because the bands are that narrow,
 * the Honda Bay islands (Cowrie, Luli, Starfish and the rest) now sit OUTSIDE
 * them, in open bay water: these zones mark the shore, reef flat and mangrove
 * edge people actually glean from, not the whole island-hopping area.
 *
 * Adjacent zones share their boundary vertices exactly, so they tile edge to
 * edge without overlapping:
 *
 *   sta-lourdes | honda-inner   share [9.8431, 118.7438] + [9.84224, 118.74802]
 *                               (the Sta. Lourdes wharf)
 *   honda-inner | honda-outer   share [9.894, 118.7457] + [9.89526, 118.74901]
 *
 * Shoreline sources (retrieved 2026-09-17/18 from the OSM API and Overpass):
 *
 *   pp-bay        1201582689, 1201581683, 1201581684 (Bancao-Bancao shore),
 *                 4247188 + node 1044151904 (port basin and city waterfront)
 *   sta-lourdes   62049956 (peninsula east coast, Blue Palawan -> wharf)
 *   honda-inner   1530225665, 1530225667, 1530236382 (bay west shore)
 *   honda-outer   62050018 (mangrove shore to the creek mouth); the creek
 *                 complex 1530271757/1530271755 is deliberately NOT traced —
 *                 it doubles back on itself through the mangroves and the
 *                 band stops at its mouth
 *   binuatan      1530291482 and neighbours (Honda Bay north shore),
 *                 62049965 (northeast coast to Babuyan)
 *   sabang        61557844 (St. Paul Bay shore), 62049996 (headland east of
 *                 Sabang village)
 *
 * Reference points the shapes were drawn against:
 *
 *   LAND / SHORELINE
 *   Puerto Princesa city centre          9.7399 N, 118.7438 E
 *   Bancao-Bancao Lighthouse (PCG)       9.7229 N, 118.7684 E
 *   Pristine/White Beach, Bancao-Bancao  9.7270 N, 118.7553 E
 *   Blue Palawan Beach (city waterfront) 9.7672 N, 118.7716 E
 *   Antonio Bautista Golf Course         9.7451 N, 118.7649 E
 *   San Manuel (barangay, N of city)     9.7789 N, 118.7584 E
 *   Tagburos (barangay)                  9.8198 N, 118.7410 E
 *   Santa Lourdes (barangay)             9.8345 N, 118.7255 E
 *   Santa Lourdes Wharf                  9.8433 N, 118.7463 E
 *   Marayugon (barangay, NE coast)       9.9777 N, 118.8547 E
 *   Babuyan (barangay, NE coast)         9.9802 N, 118.9295 E
 *   Sabang village (Sitio Sabang)       10.1962 N, 118.8929 E
 *   Sabang boat terminal (Underg. River)10.1974 N, 118.8931 E
 *
 *   WATER / ISLANDS (orientation only — outside the nearshore bands)
 *   Honda Bay (OSM natural=bay node)     9.8904 N, 118.8088 E
 *   Cowrie Island                        9.8383 N, 118.7721 E
 *   Cañon Island                         9.8522 N, 118.7617 E
 *   Luli Island                          9.8726 N, 118.7685 E
 *   Bonita Island                        9.8759 N, 118.7637 E
 *   Makesi Island (loc. Isla Pandan)     9.8756 N, 118.8154 E
 *   Meara Island                         9.8839 N, 118.7855 E
 *   Starfish Island                      9.9021 N, 118.7971 E
 *   Kalungpang Island                    9.9057 N, 118.8308 E
 *   Parunponon Island                    9.9214 N, 118.8418 E
 *   Fondeado Island                      9.9337 N, 118.9238 E
 *   Saint Paul Rock (St. Paul Bay)      10.2500 N, 118.9167 E
 *
 * Note on names: there is no coastal place called "Binuatan" — the only
 * Binuatan in the Philippines is a weaving centre in Barangay Santa Monica,
 * inside the city. The `binuatan` id is kept for continuity, but the polygon
 * is the real northeast-coast water off Marayugon/Babuyan. Zone `name` values
 * are asserted verbatim by `src/App.test.tsx`, so change them there too.
 *
 * Replace the polygons with real BFAR/LGU fisheries boundaries before this is
 * used to make actual public-health decisions.
 *
 * This file is imported by BOTH the browser app (demo mode) and
 * `scripts/seed.ts`, so it must stay free of DOM and Firebase imports.
 */

export interface SeedZone {
  id: string
  name: string
  description: string
  polygon: LatLng[]
  status: ZoneStatus
}

export const SEED_ZONES: SeedZone[] = [
  {
    id: 'pp-bay',
    name: 'Puerto Princesa Bay (City Proper)',
    description:
      'The city bay southwest of the poblacion — Bancao-Bancao, San Jose and the port side. Where most city market shellfish is landed.',
    /**
     * 12 vertices, 400 m band. Landward edge: Bancao-Bancao shore by the PCG
     * lighthouse -> Pristine/White Beach -> the port basin's southwest corner
     * -> the city quay -> San Jose waterfront. Water lies west/southwest, so
     * the band is offset to the left of the shore as it runs northwest then
     * north. The port corner is the sharpest bend in the set; its miter is
     * capped, which is why vertex J sits a little further out than 400 m.
     */
    polygon: [
      [9.7231, 118.766], // Bancao-Bancao shore (S end)
      [9.7269, 118.753], // Pristine/White Beach
      [9.7397, 118.7281], // port basin, southwest corner
      [9.7444, 118.736], // city quay — shore fixture
      [9.7553, 118.738], // San Jose waterfront
      [9.7611, 118.7338], // N end of the city waterfront
      [9.7607, 118.72962], // --- seaward edge, back south ---
      [9.75442, 118.73414],
      [9.74667, 118.73272],
      [9.73976, 118.72318],
      [9.72354, 118.75165],
      [9.71955, 118.76529],
    ],
    status: 'safe',
  },
  {
    id: 'sta-lourdes',
    name: 'Sta. Lourdes Coastal Waters',
    description:
      'The shallow waters between the city and Honda Bay, off Sta. Lourdes and Manggahan — the route the bancas take out to the islands.',
    /**
     * 12 vertices, 350 m band. Landward edge: the peninsula's east coast from
     * where way 4590522 ends (9.7689) north through the Blue Palawan shore,
     * the Tagburos mangrove inlet and on to the Sta. Lourdes wharf. Water
     * (Honda Bay) lies east, so the band is offset to the right of the shore.
     * The wharf tip is shared with honda-inner: the two zones tile from there.
     */
    polygon: [
      [9.7689, 118.7731], // S end, junction with the peninsula east coast
      [9.7946, 118.7753],
      [9.8139, 118.7659],
      [9.8199, 118.7547], // Tagburos mangrove inlet
      [9.8255, 118.7574],
      [9.8431, 118.7438], // Sta. Lourdes wharf — shared with honda-inner
      [9.84224, 118.74802], // --- seaward edge, back south ---
      [9.82594, 118.76115],
      [9.81963, 118.75811],
      [9.81676, 118.76774],
      [9.79444, 118.77862],
      [9.76825, 118.77622],
    ],
    status: 'safe',
  },
  {
    id: 'honda-inner',
    name: 'Honda Bay — Inner Islands',
    description:
      'Inner Honda Bay along the mainland shore north of the Sta. Lourdes wharf — the shallow reef flat the bancas cross to Cowrie, Luli and Snake Island, and the closest gleaning water to the city.',
    /**
     * 12 vertices, 350 m band. Landward edge: the bay's west shore from the
     * Sta. Lourdes wharf north to 9.894 — the straightest stretch of coastline
     * in the set (mapped nodes sit within ~20 m of these chords). Water lies
     * east. Shares both of its end caps with its neighbours.
     */
    polygon: [
      [9.8431, 118.7438], // Sta. Lourdes wharf — shared with sta-lourdes
      [9.851, 118.7447], // shore fixture
      [9.8584, 118.7459],
      [9.8743, 118.7457],
      [9.8833, 118.7486],
      [9.894, 118.7457], // N end — shared with honda-outer
      [9.89526, 118.74901], // --- seaward edge, back south ---
      [9.88341, 118.7523],
      [9.87376, 118.74885],
      [9.85858, 118.74942],
      [9.8511, 118.7479],
      [9.84224, 118.74802],
    ],
    status: 'safe',
  },
  {
    id: 'honda-outer',
    name: 'Honda Bay — Outer Islands',
    description:
      'Outer Honda Bay: the mangrove shore and tidal channel north of the inner bay, where the water narrows toward the bay mouth before opening onto the Sulu Sea past Pandan and Starfish Island.',
    /**
     * 12 vertices, 350 m band — the narrowest water of the six, so the offset
     * was checked node by node against the mangrove spit east of it (way
     * 1530271757) and stays inside the channel. Landward edge: the mainland
     * mangrove shore north from 9.894 to the creek mouth at 9.9307; the creek
     * itself is not traced (it doubles back through the mangroves). Water lies
     * east/southeast.
     */
    polygon: [
      [9.894, 118.7457], // S end — shared with honda-inner
      [9.911, 118.7457],
      [9.9172, 118.7495],
      [9.9236, 118.7517],
      [9.9286, 118.7501],
      [9.9307, 118.7536], // creek mouth, 89 m from the shore fixture
      [9.92799, 118.75525], // --- seaward edge, back south ---
      [9.92718, 118.7539],
      [9.92356, 118.75506],
      [9.91585, 118.75241],
      [9.90981, 118.7487],
      [9.89526, 118.74901],
    ],
    status: 'safe',
  },
  {
    id: 'binuatan',
    name: 'Binuatan (Northeast Coast)',
    description:
      'Northeast coast past the Honda Bay mouth — the mangrove-lined shore off Marayugon toward Babuyan, and its small-scale gleaning grounds.',
    /**
     * 12 vertices, 400 m band, the longest zone (~10 km of coast). Landward
     * edge: from the Honda Bay mouth (9.9400) northeast along way 62049965
     * past Marayugon, around the headland at 9.9812 and east toward Babuyan.
     * Water (the Sulu Sea) lies south/southeast, i.e. to the right of the
     * shore as it runs northeast then east.
     */
    polygon: [
      [9.94, 118.8206], // Honda Bay mouth — shore fixture
      [9.9505, 118.8316],
      [9.9694, 118.8502], // off Marayugon
      [9.9812, 118.8824], // headland
      [9.9748, 118.9001], // small embayment
      [9.9756, 118.9148], // E end, toward Babuyan
      [9.97211, 118.91575], // --- seaward edge, back southwest ---
      [9.9711, 118.89884],
      [9.97756, 118.88255],
      [9.96651, 118.8524],
      [9.94782, 118.83406],
      [9.93764, 118.82337],
    ],
    status: 'safe',
  },
  {
    id: 'sabang',
    name: 'Sabang — St. Paul Bay (North Coast)',
    description:
      'The north coast at Sabang, by the Underground River. Tourist boats and local gleaning share these waters.',
    /**
     * 12 vertices, 350 m band, L-shaped around the bay at Sabang village.
     * Landward edge: southeast from the western end of the shore (10.2099) to
     * Sabang village and the boat terminal, then east/northeast along St. Paul
     * Bay to the headland east of the village. Water lies north, i.e. to the
     * left of the shore as it runs southeast then northeast. The small cove at
     * 10.2006/118.9273 is bridged by a straight chord rather than followed in.
     */
    polygon: [
      [10.2099, 118.8677], // W end of the Sabang shore — shore fixture
      [10.2083, 118.8814],
      [10.1966, 118.8935], // Sabang village / boat terminal
      [10.1979, 118.9061],
      [10.2034, 118.9229],
      [10.2076, 118.9381], // E end
      [10.21025, 118.93635], // --- seaward edge, back west ---
      [10.20605, 118.92111],
      [10.20097, 118.90515],
      [10.19983, 118.89473],
      [10.21132, 118.88285],
      [10.21304, 118.86807],
    ],
    status: 'safe',
  },
]

/** Rough centre of the covered area, used as the map's initial centre. */
export const MAP_CENTER: LatLng = [9.94, 118.83]

/** Fallback zoom if there are no zones to fit bounds against. */
export const MAP_DEFAULT_ZOOM = 11

export const MAP_MAX_BOUNDS: [LatLng, LatLng] = [
  [5.0, 115.0],
  [15.0, 123.0],
]

/**
 * Smallest [south-west, north-east] box containing every zone polygon.
 * Pure function so it can be unit-tested without Leaflet.
 */
export function zonesBoundingBox(
  polygons: LatLng[][],
): [LatLng, LatLng] | null {
  if (polygons.length === 0) return null

  let minLat = Number.POSITIVE_INFINITY
  let minLng = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY

  for (const polygon of polygons) {
    for (const [lat, lng] of polygon) {
      if (lat < minLat) minLat = lat
      if (lng < minLng) minLng = lng
      if (lat > maxLat) maxLat = lat
      if (lng > maxLng) maxLng = lng
    }
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}
