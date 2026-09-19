import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import type { ShippingFeature } from '../data/shipping'
import {
  SHIPPING_DISCLAIMER,
  SHIPPING_FEATURES,
  SHIPPING_LAYER_LABEL,
  SHIPPING_LAYER_NOTE,
  SHIPPING_SOURCE,
} from '../data/shipping'

/**
 * Navigation-hazard overlay: the Puerto Princesa Traffic Separation Scheme
 * (PCG circular, 06 Jun 2017 — see src/data/shipping.ts for sourcing).
 *
 * Deliberately reads as CHART FURNITURE, not as advisory status:
 *   - LINES, never filled areas — a dashed blue boundary with a white casing
 *     (blue/white clashes with nothing in the green/yellow/red advisory
 *     palette and is legible on both light and dark basemap tiles);
 *   - tap/hover shows what it is and what a small boat should do, with the
 *     source and the unofficial-transcription disclaimer attached;
 *   - mounted only when toggled on (MapPage), and rendered *before* the zone
 *     polygons so the advisory zones always sit on top.
 */

const BLUE = '#2e7cd6'
const CASING = '#f4f8ff'

function lineDash(kind: ShippingFeature['kind']): string {
  switch (kind) {
    case 'separation-zone':
      return '3 7' // tight dash — the strongest "keep out" line
    case 'precautionary-area':
      return '2 9' // dotted
    default:
      return '11 8' // lane boundaries: plain dash
  }
}

function FeatureTip({ feature }: { feature: ShippingFeature }) {
  return (
    <div className="max-w-[260px]">
      <div className="font-display text-[12px] font-bold tracking-[0.02em] text-[#9cc4f7]">
        {SHIPPING_LAYER_LABEL}
      </div>
      <div className="mt-1 font-display text-[13px] leading-tight font-semibold text-paper">
        {feature.label}
      </div>
      <div className="mt-1 text-[12px] leading-snug text-paper/85">{feature.note}</div>
      <div className="mt-1.5 text-[10.5px] leading-snug text-paper/60">
        {SHIPPING_SOURCE.authority} · {SHIPPING_SOURCE.chart} · unofficial
        transcription — not for navigation
      </div>
    </div>
  )
}

function ShippingLine({ feature }: { feature: ShippingFeature }) {
  const isArea = feature.kind !== 'lane-boundary'
  const positions = isArea ? [...feature.points, feature.points[0]] : feature.points
  return (
    <>
      {/* white casing so the blue stays legible over any basemap colour */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: CASING,
          weight: 6.5,
          opacity: 0.85,
          lineCap: 'butt',
          fill: false,
          interactive: false,
        }}
      />
      <Polyline
        positions={positions}
        pathOptions={{
          color: BLUE,
          weight: 3,
          opacity: 0.95,
          dashArray: lineDash(feature.kind),
          lineCap: 'butt',
          fill: false,
        }}
      >
        <Tooltip direction="top" offset={[0, -6]} sticky>
          <FeatureTip feature={feature} />
        </Tooltip>
      </Polyline>
    </>
  )
}

function ShippingHazard({ feature }: { feature: ShippingFeature }) {
  return (
    <CircleMarker
      center={feature.points[0]}
      radius={5}
      pathOptions={{
        color: CASING,
        weight: 1.5,
        fillColor: BLUE,
        fillOpacity: 0.9,
      }}
    >
      <Tooltip direction="top" offset={[0, -6]}>
        <FeatureTip feature={feature} />
      </Tooltip>
    </CircleMarker>
  )
}

/**
 * The whole PPTSS overlay. Mounted inside `<MapContainer>` only while the
 * user's shipping toggle is on (default off — this is a secondary safety
 * reference next to the red-tide advisory zones, not a co-equal layer).
 */
export function ShippingLayer() {
  return (
    <>
      {SHIPPING_FEATURES.map((feature) =>
        feature.kind === 'hazard' ? (
          <ShippingHazard key={feature.id} feature={feature} />
        ) : (
          <ShippingLine key={feature.id} feature={feature} />
        ),
      )}
      {/* Screen-reader summary: the map geometry itself is not announced. */}
      <span className="sr-only" role="note">
        Shipping channel overlay: {SHIPPING_LAYER_LABEL} {SHIPPING_LAYER_NOTE}{' '}
        {SHIPPING_DISCLAIMER}
      </span>
    </>
  )
}
