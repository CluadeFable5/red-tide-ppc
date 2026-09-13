import type { LatLng, ZoneStatus } from '../types'

/**
 * Pre-seeded zones for the Puerto Princesa coastline.
 *
 * These are hand-drawn, APPROXIMATE coastal areas — good enough to tell a
 * fisherman "this is your bay", not a survey boundary. They are anchored on a
 * few verified reference points:
 *
 *   Puerto Princesa city centre   9.7407 N, 118.7301 E
 *   Puerto Princesa Port          9.7262 N, 118.7340 E
 *   Cowrie Island (Honda Bay)     9.8399 N, 118.7683 E
 *   Luli Island (Honda Bay)       9.8737 N, 118.7670 E
 *   Honda Bay (centre)            9.9000 N, 118.7833 E
 *   Bacungan (village)            9.9096 N, 118.7012 E
 *   Sabang (Underground River)   10.1944 N, 118.8975 E
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
      [9.748, 118.69],
      [9.742, 118.722],
      [9.72, 118.732],
      [9.694, 118.722],
      [9.682, 118.694],
      [9.698, 118.668],
      [9.726, 118.668],
    ],
    status: 'safe',
  },
  {
    id: 'sta-lourdes',
    name: 'Sta. Lourdes Coastal Waters',
    description:
      'The shallow waters between the city and Honda Bay, off Sta. Lourdes and Manggahan — the route the bancas take out to the islands.',
    polygon: [
      [9.828, 118.752],
      [9.818, 118.782],
      [9.792, 118.796],
      [9.77, 118.778],
      [9.772, 118.75],
      [9.796, 118.742],
    ],
    status: 'safe',
  },
  {
    id: 'honda-inner',
    name: 'Honda Bay — Inner Islands',
    description:
      'The inner island cluster: Cowrie, Luli, Snake and Pambato Reef. Heaviest island-hopping and gleaning traffic in the city.',
    polygon: [
      [9.888, 118.756],
      [9.89, 118.8],
      [9.868, 118.828],
      [9.842, 118.822],
      [9.828, 118.772],
      [9.846, 118.748],
    ],
    status: 'safe',
  },
  {
    id: 'honda-outer',
    name: 'Honda Bay — Outer Islands',
    description:
      'The outer reaches toward Pandan, Batasa and Starfish Island, where the bay opens onto the Sulu Sea.',
    polygon: [
      [9.948, 118.788],
      [9.95, 118.834],
      [9.926, 118.866],
      [9.9, 118.856],
      [9.894, 118.812],
      [9.916, 118.784],
    ],
    status: 'safe',
  },
  {
    id: 'binuatan',
    name: 'Binuatan (Northeast Coast)',
    description:
      'Northeast coast past Honda Bay toward Binuatan — mangrove-lined shore and small-scale gleaning grounds.',
    polygon: [
      [10.018, 118.818],
      [10.01, 118.858],
      [9.984, 118.872],
      [9.958, 118.852],
      [9.962, 118.816],
      [9.988, 118.804],
    ],
    status: 'safe',
  },
  {
    id: 'sabang',
    name: 'Sabang — St. Paul Bay (North Coast)',
    description:
      'The north coast at Sabang, by the Underground River. Tourist boats and local gleaning share these waters.',
    polygon: [
      [10.226, 118.858],
      [10.22, 118.892],
      [10.196, 118.906],
      [10.17, 118.89],
      [10.166, 118.862],
      [10.192, 118.846],
    ],
    status: 'safe',
  },
]

/** Rough centre of the covered area, used as the map's initial centre. */
export const MAP_CENTER: LatLng = [9.86, 118.78]

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
