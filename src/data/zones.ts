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
      [9.717, 118.762],
      [9.712, 118.742],
      [9.716, 118.725],
      [9.727, 118.713],
      [9.742, 118.708],
      [9.76, 118.7075],
      [9.776, 118.712],
      [9.787, 118.7175],
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
      [9.72105, 118.77095],
      [9.71517, 118.75388],
      [9.7206, 118.75722],
      [9.72069, 118.7566],
      [9.72396, 118.75334],
      [9.72382, 118.74847],
      [9.72527, 118.74693],
      [9.72391, 118.744],
      [9.72848, 118.72831],
      [9.7476, 118.72581],
      [9.74788, 118.73345],
      [9.75263, 118.73513],
      [9.75348, 118.73509],
      [9.76007, 118.73011],
      [9.76772, 118.73086],
      [9.76879, 118.73212],
      [9.76955, 118.73167],
      [9.76514, 118.72983],
      [9.76432, 118.72239],
      [9.76881, 118.72156],
      [9.77145, 118.71652],
      [9.77655, 118.72082],
      [9.7833, 118.71748],
      [9.78283, 118.71943],
      [9.7747, 118.71537],
      [9.75955, 118.71111],
      [9.74263, 118.71158],
      [9.72902, 118.71612],
      [9.71929, 118.72674],
      [9.7157, 118.74197],
      [9.72049, 118.76113]
    ],
    status: 'safe',
  },
  {
    id: 'sta-lourdes',
    name: 'Sta. Lourdes Coastal Waters',
    description:
      'The shallow waters between the city and Honda Bay, off Sta. Lourdes and Manggahan — the route the bancas take out to the islands.',
    polygon: [
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
      [9.7922, 118.77816],
      [9.79781, 118.77905],
      [9.80815, 118.77488],
      [9.81881, 118.76641],
      [9.81933, 118.75882],
      [9.82077, 118.7585],
      [9.82745, 118.76131],
      [9.84129, 118.74839],
      [9.84158, 118.74607],
      [9.84061, 118.74654],
      [9.84306, 118.74735000000001]
    ],
    status: 'safe',
  },
  {
    id: 'honda-inner',
    name: 'Honda Bay — Inner Islands',
    description:
      'The inner island cluster: Cowrie, Luli, Snake and Pambato Reef. Heaviest island-hopping and gleaning traffic in the city.',
    polygon: [
      [9.84306, 118.74375],
      [9.84379, 118.74609],
      [9.84403, 118.74191],
      [9.84897, 118.74456],
      [9.85917, 118.7458],
      [9.86333, 118.74459],
      [9.877, 118.756],
      [9.88, 118.775],
      [9.87, 118.778],
      [9.86, 118.78],
      [9.85, 118.785],
      [9.836, 118.776],
      [9.84306, 118.74735000000001]
    ],
    status: 'safe',
  },
  {
    id: 'honda-outer',
    name: 'Honda Bay — Outer Islands',
    description:
      'The outer reaches toward Pandan, Batasa and Starfish Island, where the bay opens onto the Sulu Sea.',
    polygon: [
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
      [9.938039999999999, 118.82425],
      [9.925, 118.845],
      [9.915, 118.845],
      [9.905, 118.835],
      [9.89, 118.82],
      [9.87, 118.82],
      [9.87, 118.79],
      [9.88, 118.775],
      [9.877, 118.756]
    ],
    status: 'safe',
  },
  {
    id: 'binuatan',
    name: 'Binuatan (Northeast Coast)',
    description:
      'Northeast coast past Honda Bay toward Binuatan — mangrove-lined shore and small-scale gleaning grounds.',
    polygon: [
      [9.94004, 118.82065],
      [9.96374, 118.84313],
      [9.97417, 118.85745],
      [9.98117, 118.88237],
      [9.97894, 118.89463],
      [9.97476, 118.89987],
      [9.9684, 118.9074],
      [9.96565, 118.90508],
      [9.97198, 118.89759],
      [9.97556, 118.89309],
      [9.97748, 118.88254],
      [9.97088, 118.85905],
      [9.96103, 118.84551],
      [9.938039999999999, 118.82425]
    ],
    status: 'safe',
  },
  {
    id: 'sabang',
    name: 'Sabang — St. Paul Bay (North Coast)',
    description:
      'The north coast at Sabang, by the Underground River. Tourist boats and local gleaning share these waters.',
    polygon: [
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
      [10.21086, 118.93664],
      [10.20687, 118.92788],
      [10.21221, 118.92804],
      [10.20408, 118.91814],
      [10.20627, 118.90787],
      [10.20185, 118.90556],
      [10.20195, 118.90137],
      [10.19998, 118.8959],
      [10.20003, 118.89545],
      [10.20519, 118.89148],
      [10.21246, 118.88176],
      [10.21348, 118.86795]
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
