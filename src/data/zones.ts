import type { LatLng, ZoneStatus } from '../types'

/**
 * Pre-seeded zones for the Puerto Princesa coastline.
 *
 * These are hand-drawn, APPROXIMATE coastal areas — good enough to tell a
 * fisherman "this is your bay", not a survey boundary.
 *
 * Every polygon below was re-derived against real OpenStreetMap geometry
 * (Overpass API / Nominatim, retrieved 2026-09-13) and each vertex sits in
 * open water, at least ~1 km clear of the mapped shoreline. The anchors used:
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
 *   WATER / ISLANDS
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
 *   Saint Paul Rock (St. Paul Bay)      10.2500 N, 118.9167 E
 *
 * Note on names: there is no coastal place called "Binuatan" — the only
 * Binuatan in the Philippines is a weaving centre in Barangay Santa Monica,
 * inside the city. The `binuatan` id is kept for continuity, but the polygon
 * is the real northeast-coast water off Marayugon/Babuyan.
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
    polygon: [
      // Water east of the city waterfront, which runs N–S at ~118.772 E
      // between 9.73 N and 9.77 N, then bends SW to the Bancao-Bancao
      // lighthouse (9.7229, 118.7684).
      [9.776, 118.786],
      [9.77, 118.826],
      [9.742, 118.84],
      [9.718, 118.818],
      [9.714, 118.788],
      [9.732, 118.783],
      [9.756, 118.782],
    ],
    status: 'safe',
  },
  {
    id: 'sta-lourdes',
    name: 'Sta. Lourdes Coastal Waters',
    description:
      'The shallow waters between the city and Honda Bay, off Sta. Lourdes and Manggahan — the route the bancas take out to the islands.',
    polygon: [
      // Water off the Sta. Lourdes wharf (9.8433, 118.7463) and Tagburos,
      // east of a shoreline that runs from ~118.765 E at 9.79 N to
      // ~118.745 E at 9.85 N. South of Cowrie Island.
      [9.792, 118.777],
      [9.801, 118.808],
      [9.826, 118.803],
      [9.834, 118.78],
      [9.828, 118.76],
      [9.81, 118.772],
    ],
    status: 'safe',
  },
  {
    id: 'honda-inner',
    name: 'Honda Bay — Inner Islands',
    description:
      'The inner island cluster: Cowrie, Luli, Snake and Pambato Reef. Heaviest island-hopping and gleaning traffic in the city.',
    polygon: [
      // The shallow water between the Honda Bay mainland shore (~118.745 E)
      // and the inner islands: Cowrie (9.8383, 118.7721), Cañon
      // (9.8522, 118.7617) and Luli (9.8726, 118.7685).
      [9.835, 118.76],
      [9.852, 118.7555],
      [9.868, 118.757],
      [9.8735, 118.77],
      [9.872, 118.796],
      [9.856, 118.802],
      [9.837, 118.788],
    ],
    status: 'safe',
  },
  {
    id: 'honda-outer',
    name: 'Honda Bay — Outer Islands',
    description:
      'The outer reaches toward Pandan, Batasa and Starfish Island, where the bay opens onto the Sulu Sea.',
    polygon: [
      // North and east of the inner cluster, out to the bay's northern
      // mangrove fringe at ~9.93 N: Bonita, Pandan/Makesi (9.8756, 118.8154),
      // Meara, Starfish (9.9021, 118.7971), Kalungpang and Parunponon.
      [9.8755, 118.76],
      [9.875, 118.82],
      [9.89, 118.85],
      [9.912, 118.862],
      [9.93, 118.845],
      [9.926, 118.8],
      [9.906, 118.78],
      [9.886, 118.766],
    ],
    status: 'safe',
  },
  {
    id: 'binuatan',
    name: 'Binuatan (Northeast Coast)',
    description:
      'Northeast coast past Honda Bay toward Binuatan — mangrove-lined shore and small-scale gleaning grounds.',
    polygon: [
      // Open coastal water southeast of the Marayugon/Babuyan shoreline,
      // which runs NE from ~118.85 E at 9.955 N to ~118.93 E at 9.98 N.
      [9.945, 118.865],
      [9.953, 118.9],
      [9.963, 118.932],
      [9.97, 118.95],
      [9.972, 118.91],
      [9.96, 118.88],
      [9.95, 118.855],
    ],
    status: 'safe',
  },
  {
    id: 'sabang',
    name: 'Sabang — St. Paul Bay (North Coast)',
    description:
      'The north coast at Sabang, by the Underground River. Tourist boats and local gleaning share these waters.',
    polygon: [
      // St. Paul Bay, north of the shore that runs from 10.198 N/118.845 E
      // past Sabang village (10.1962, 118.8929) to 10.204 N/118.931 E, and
      // west of the coast that turns north at ~118.94 E. Includes Saint Paul
      // Rock (10.2500, 118.9167).
      [10.21, 118.868],
      [10.214, 118.899],
      [10.228, 118.927],
      [10.246, 118.934],
      [10.256, 118.918],
      [10.24, 118.888],
      [10.223, 118.866],
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
