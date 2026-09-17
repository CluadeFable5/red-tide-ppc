import type { LatLng, ZoneStatus } from '../types'

/**
 * Pre-seeded zones for the Puerto Princesa coastline.
 *
 * These are hand-drawn, APPROXIMATE coastal areas — good enough to tell a
 * fisherman "this is your bay", not a survey boundary.
 *
 * The polygons were re-plotted (2026-09-17) against real OpenStreetMap
 * coastlines (Overpass API / Nominatim) so each zone HUGS the shore instead
 * of floating offshore: every landward vertex snaps to a mapped shoreline
 * node (ways 4247188, 1044151902/1044151904, 1201581683/1201581684/
 * 1201582689, 62049956, 1530225665/1530225667/1530236375/1530236381/
 * 1530236382/62050018, 1530271755/1530271757, 1530291468/1530291469/
 * 1530291480/1530291482, 62049964/62049965, 61557844, 700043259,
 * 1314598379, 62049996 and neighbours), and
 * the seaward limit is a plain straight cut 1–2.5 km of open water offshore.
 * Adjacent zones share boundary vertices so they tile without overlapping.
 * Reference anchors (islands included in exactly one zone each):
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
 *   Cowrie Island                        9.8383 N, 118.7721 E   (honda-inner)
 *   Cañon Island                         9.8522 N, 118.7617 E   (honda-inner)
 *   Luli Island                          9.8726 N, 118.7685 E   (honda-inner)
 *   Bonita Island                        9.8759 N, 118.7637 E   (honda-inner)
 *   Makesi Island (loc. Isla Pandan)     9.8756 N, 118.8154 E   (honda-outer)
 *   Meara Island                         9.8839 N, 118.7855 E   (honda-outer)
 *   Starfish Island                      9.9021 N, 118.7971 E   (honda-outer)
 *   Kalungpang Island                    9.9057 N, 118.8308 E   (honda-outer)
 *   Parunponon Island                    9.9214 N, 118.8418 E   (honda-outer)
 *   Fondeado Island                      9.9337 N, 118.9238 E   (outside all)
 *   Saint Paul Rock (St. Paul Bay)      10.2500 N, 118.9167 E   (sabang)
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
      // Traces the mapped city shoreline: the bayfront N from the north
      // end (9.7864, 118.7200) past the cruise port (9.7361, 118.7294),
      // along the estuary's south shore east to Bancao-Bancao
      // (9.7285, 118.7493) and the lighthouse (9.7244, 118.7698), then a
      // straight seaward limit ~2.5 km offshore. River Island
      // (9.737, 118.699) sits outside the western edge.
      [9.7864, 118.71996],
      [9.77603, 118.72509],
      [9.77256, 118.72216],
      [9.77119, 118.72478],
      [9.76826, 118.72532],
      [9.76848, 118.72733],
      [9.77763, 118.73114],
      [9.77431, 118.73307],
      [9.77621, 118.73531],
      [9.76112, 118.73383],
      [9.75477, 118.73862],
      [9.7521, 118.73876],
      [9.74437, 118.73602],
      [9.74415, 118.72989],
      [9.73128, 118.73157],
      [9.72774, 118.74371],
      [9.72955, 118.74762],
      [9.72746, 118.74985],
      [9.7276, 118.75479],
      [9.72408, 118.7583],
      [9.72337, 118.76314],
      [9.72184, 118.7622],
      [9.72445, 118.76978],
      [9.717, 118.762],
      [9.712, 118.742],
      [9.716, 118.725],
      [9.727, 118.713],
      [9.742, 118.708],
      [9.76, 118.7075],
      [9.776, 118.712],
      [9.787, 118.7175],
    ],
    status: 'safe',
  },
  {
    id: 'sta-lourdes',
    name: 'Sta. Lourdes Coastal Waters',
    description:
      'The shallow waters between the city and Honda Bay, off Sta. Lourdes and Manggahan — the route the bancas take out to the islands.',
    polygon: [
      // Landward edge follows the Sta. Lourdes/Tagburos mainland shore
      // from the fishing pier at (9.8431, 118.7438) south to
      // (9.7928, 118.7746); seaward side ~1 km of shallow corridor
      // between that shore and the banca route to the Honda Bay islands.
      [9.84306, 118.74375],
      [9.84183, 118.74194],
      [9.83825, 118.74369],
      [9.83788, 118.74665],
      [9.8267, 118.75709],
      [9.82111, 118.75474],
      [9.81593, 118.75589],
      [9.81533, 118.76458],
      [9.80632, 118.77174],
      [9.79739, 118.77534],
      [9.79276, 118.77461],
      [9.795, 118.779],
      [9.806, 118.786],
      [9.819, 118.788],
      [9.828, 118.78],
      [9.8335, 118.759],
      [9.8375, 118.748],
    ],
    status: 'safe',
  },
  {
    id: 'honda-inner',
    name: 'Honda Bay — Inner Islands',
    description:
      'The inner island cluster: Cowrie, Luli, Snake and Pambato Reef. Heaviest island-hopping and gleaning traffic in the city.',
    polygon: [
      // Starts at the Sta. Lourdes pier (9.8431, 118.7438), follows the
      // mainland shore N to (9.8633, 118.7446), then wraps the inner
      // island cluster in shallows: Cañon (9.8522, 118.7617), Cowrie
      // (9.8383, 118.7721), Bonita (9.8759, 118.7637), Luli
      // (9.8726, 118.7685), Snake (9.8746, 118.7745). Meara Island stays
      // out to the NE; the NE notch is shared with honda-outer.
      [9.84306, 118.74375],
      [9.84379, 118.74609],
      [9.84403, 118.74191],
      [9.84897, 118.74456],
      [9.85917, 118.7458],
      [9.86333, 118.74459],
      [9.87, 118.7545],
      [9.884, 118.7585],
      [9.884, 118.7748],
      [9.877, 118.7728],
      [9.87, 118.7755],
      [9.865, 118.79],
      [9.852, 118.794],
      [9.843, 118.787],
      [9.8345, 118.775],
      [9.8335, 118.759],
      [9.8375, 118.748],
    ],
    status: 'safe',
  },
  {
    id: 'honda-outer',
    name: 'Honda Bay — Outer Islands',
    description:
      'The outer reaches toward Pandan, Batasa and Starfish Island, where the bay opens onto the Sulu Sea.',
    polygon: [
      // Covers the main body of Honda Bay: mainland shore from the
      // peninsula NE corner (9.8966, 118.7423) around the mouth — the
      // edge follows the mapped shoreline of the north peninsula
      // (out to 9.9449 N at the Tapul point, lagoon excluded) east to
      // (9.9400, 118.8206). Includes Meara, Starfish, Makesi/Pandan,
      // Kalungpang, Parunponon and the Bush/Tapul shallows; the SW edge
      // is shared with honda-inner so Fondeado Island stays out.
      [9.89664, 118.74229],
      [9.91104, 118.74567],
      [9.92111, 118.75133],
      [9.92862, 118.75015],
      [9.93034, 118.7543],
      [9.93217, 118.75765],
      [9.92402, 118.75889],
      [9.91321, 118.76453],
      [9.91404, 118.76597],
      [9.92929, 118.76435],
      [9.93123, 118.76615],
      [9.92926, 118.76986],
      [9.93074, 118.77288],
      [9.93926, 118.77479],
      [9.94486, 118.79137],
      [9.94304, 118.79548],
      [9.93494, 118.80256],
      [9.94004, 118.82065],
      [9.9336, 118.8284],
      [9.93, 118.84],
      [9.934, 118.85],
      [9.9365, 118.861],
      [9.934, 118.872],
      [9.925, 118.879],
      [9.908, 118.882],
      [9.899, 118.88],
      [9.888, 118.874],
      [9.877, 118.86],
      [9.866, 118.835],
      [9.864, 118.81],
      [9.865, 118.79],
      [9.87, 118.7755],
      [9.877, 118.7728],
      [9.884, 118.7748],
      [9.884, 118.7585],
      [9.87, 118.7545],
    ],
    status: 'safe',
  },
  {
    id: 'binuatan',
    name: 'Binuatan (Northeast Coast)',
    description:
      'Northeast coast past Honda Bay toward Binuatan — mangrove-lined shore and small-scale gleaning grounds.',
    polygon: [
      // A ~1 km strip hugging the mapped mangrove coastline NE of Honda
      // Bay: from (9.9400, 118.8206) past Marayugon to (9.9748,
      // 118.8999). Follows OSM way 62049965 exactly on its landward
      // side; Fondeado Island (9.93 N) is deliberately outside.
      [9.94004, 118.82065],
      [9.96374, 118.84313],
      [9.97417, 118.85745],
      [9.98117, 118.88237],
      [9.97894, 118.89463],
      [9.97476, 118.89987],
      [9.9684, 118.9074],
      [9.9739, 118.8969],
      [9.9732, 118.8821],
      [9.9704, 118.872],
      [9.9654, 118.8607],
      [9.9587, 118.8523],
      [9.9514, 118.8459],
      [9.9451, 118.8398],
      [9.9336, 118.8284],
    ],
    status: 'safe',
  },
  {
    id: 'sabang',
    name: 'Sabang — St. Paul Bay (North Coast)',
    description:
      'The north coast at Sabang, by the Underground River. Tourist boats and local gleaning share these waters.',
    polygon: [
      // St. Paul Bay water off Sabang: the southern boundary traces the
      // actual shoreline — Sabang beach past the Underground River boat
      // terminal (10.1974, 118.8931), around the estuary mouth
      // (10.1963, 118.8963) and up the bayhead to (10.2076, 118.9381).
      // Open bay to ~10.25 N includes Saint Paul Rock (10.2500,
      // 118.9167).
      [10.20989, 118.86769],
      [10.20895, 118.88045],
      [10.20261, 118.88893],
      [10.19665, 118.89351],
      [10.1963, 118.89631],
      [10.19834, 118.90196],
      [10.1982, 118.90771],
      [10.20218, 118.90979],
      [10.2002, 118.91908],
      [10.2044, 118.9242],
      [10.2012, 118.9241],
      [10.20759, 118.93813],
      [10.222, 118.943],
      [10.243, 118.938],
      [10.253, 118.923],
      [10.247, 118.903],
      [10.24, 118.883],
      [10.228, 118.864],
      [10.216, 118.86],
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
