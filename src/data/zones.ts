import type { LatLng, ZoneStatus } from '../types'

/**
 * Pre-seeded zones for the Puerto Princesa coastline.
 *
 * These are hand-drawn, APPROXIMATE coastal areas — good enough to tell a
 * fisherman "this is your bay", not a survey boundary.
 *
 * HOW THE SHAPES ARE BUILT (re-plotted 2026-09-18)
 * ------------------------------------------------
 * Every zone is a closed coastal ribbon polygon (14–18 vertices) representing
 * a nearshore band of shallow water roughly 300–400 m wide:
 *
 *   - the LANDWARD edge is a smooth run of real OpenStreetMap coastline points
 *     following the natural shore contour (touching land, never floating in
 *     open water);
 *   - the SEAWARD edge is that same coastline path offset 300–400 m
 *     perpendicularly into coastal water, so both edges follow the smooth
 *     curve of the coast with real width and area.
 *
 * Adjacent zones share their end-cap boundary vertices exactly, so they tile
 * edge to edge without overlapping:
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
 *   honda-outer   62050018 (mangrove shore to the creek mouth)
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
     * 18 vertices, ~350 m coastal band. Landward edge hugs the bay shore from
     * Bancao-Bancao lighthouse northwest past Pristine Beach, city port basin,
     * and city quay to the San Jose waterfront. Seaward edge is a smooth
     * parallel contour 350 m out in Puerto Princesa Bay.
     */
    polygon: [
      [9.7229, 118.7684],
      [9.7245, 118.7615],
      [9.727, 118.7553],
      [9.7315, 118.746],
      [9.7375, 118.739],
      [9.7444, 118.736],
      [9.75, 118.737],
      [9.7553, 118.738],
      [9.7611, 118.7338],
      [9.75927, 118.7312],
      [9.75456, 118.73461],
      [9.75056, 118.73385],
      [9.74402, 118.73268],
      [9.73559, 118.73635],
      [9.72885, 118.74422],
      [9.72412, 118.75399],
      [9.72149, 118.76052],
      [9.71983, 118.76767],
    ],
    status: 'safe',
  },
  {
    id: 'sta-lourdes',
    name: 'Sta. Lourdes Coastal Waters',
    description:
      'The shallow waters between the city and Honda Bay, off Sta. Lourdes and Manggahan — the route the bancas take out to the islands.',
    /**
     * 18 vertices, ~350 m coastal band. Landward edge hugs the peninsula east
     * coast north from Blue Palawan shore through Tagburos mangrove inlet to the
     * Sta. Lourdes wharf. Seaward edge is a smooth parallel contour 350 m out
     * in Honda Bay. Shares wharf end cap with honda-inner.
     */
    polygon: [
      [9.7689, 118.7731],
      [9.782, 118.7745],
      [9.7946, 118.7753],
      [9.805, 118.771],
      [9.8139, 118.7659],
      [9.8199, 118.7547],
      [9.8255, 118.7574],
      [9.8345, 118.749],
      [9.8431, 118.7438],
      [9.84224, 118.74802],
      [9.83639, 118.75158],
      [9.82607, 118.76122],
      [9.82122, 118.75881],
      [9.81624, 118.76824],
      [9.80638, 118.77389],
      [9.79512, 118.77854],
      [9.78174, 118.77769],
      [9.76857, 118.77628],
    ],
    status: 'safe',
  },
  {
    id: 'honda-inner',
    name: 'Honda Bay — Inner Islands',
    description:
      'Inner Honda Bay along the mainland shore north of the Sta. Lourdes wharf — the shallow reef flat the bancas cross to Cowrie, Luli and Snake Island, and the closest gleaning water to the city.',
    /**
     * 14 vertices, ~350 m coastal band. Landward edge hugs the west shore of
     * Honda Bay from Sta. Lourdes wharf north to 9.894. Seaward edge is a smooth
     * parallel contour 350 m out in the bay. Shares both end caps with its
     * neighbours.
     */
    polygon: [
      [9.8431, 118.7438],
      [9.851, 118.7447],
      [9.8584, 118.7459],
      [9.866, 118.7455],
      [9.8743, 118.7457],
      [9.8833, 118.7486],
      [9.894, 118.7457],
      [9.89526, 118.74901],
      [9.88322, 118.75193],
      [9.87378, 118.74889],
      [9.86604, 118.7487],
      [9.85823, 118.74911],
      [9.85058, 118.74787],
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
     * 14 vertices, ~350 m coastal band. Landward edge hugs the mainland mangrove
     * shore from 9.894 north to the creek mouth at 9.9303. Seaward edge is a
     * smooth parallel contour 350 m out in the channel. Shares south end cap
     * with honda-inner.
     */
    polygon: [
      [9.894, 118.7457],
      [9.903, 118.7455],
      [9.911, 118.7457],
      [9.9172, 118.7495],
      [9.9236, 118.7517],
      [9.9286, 118.7501],
      [9.9303358, 118.7543035],
      [9.92743, 118.75554],
      [9.92681, 118.75402],
      [9.92356, 118.75507],
      [9.91586, 118.75242],
      [9.91009, 118.74888],
      [9.903, 118.7487],
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
     * 16 vertices, ~400 m coastal band along the northeast coast (~10 km of coast).
     * Landward edge hugs the shore from Honda Bay mouth (Marayugon) northeast past
     * the headland toward Babuyan. Seaward edge is a smooth parallel contour 400 m
     * out in the Sulu Sea.
     */
    polygon: [
      [9.9400388, 118.820647],
      [9.9505, 118.8316],
      [9.96, 118.841],
      [9.9694, 118.8502],
      [9.975, 118.865],
      [9.9812, 118.8824],
      [9.9748, 118.9001],
      [9.9756, 118.9148],
      [9.972, 118.915],
      [9.97116, 118.89955],
      [9.97736, 118.88239],
      [9.97162, 118.86628],
      [9.96632, 118.85227],
      [9.95749, 118.84363],
      [9.94795, 118.83418],
      [9.93745, 118.82319],
    ],
    status: 'safe',
  },
  {
    id: 'sabang',
    name: 'Sabang — St. Paul Bay (North Coast)',
    description:
      'The north coast at Sabang, by the Underground River. Tourist boats and local gleaning share these waters.',
    /**
     * 14 vertices, ~350 m coastal band along St. Paul Bay. Landward edge hugs
     * the shore from west of Sabang village around the bay past the boat terminal
     * to the headland east. Seaward edge is a smooth parallel contour 350 m out
     * in St. Paul Bay.
     */
    polygon: [
      [10.2098884, 118.8676876],
      [10.2083, 118.8814],
      [10.201, 118.888],
      [10.1966, 118.8935],
      [10.1979, 118.9061],
      [10.2034, 118.9229],
      [10.2076, 118.9381],
      [10.21064, 118.93723],
      [10.20642, 118.92196],
      [10.201, 118.90542],
      [10.19987, 118.89449],
      [10.20329, 118.89022],
      [10.21129, 118.88298],
      [10.21302, 118.86806],
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
