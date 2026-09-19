/**
 * Ambient instruments for the map surface.
 *
 * WHY THESE EXIST
 * ---------------
 * The category default for a civic map is a pastel card grid with a friendly
 * illustration. The subject here is a tide that poisons shellfish — it deserves
 * the instrument register: a schematic trace, a scan, monospaced readouts.
 * `Scanline` is the ambient half of the motif — a slow sonar sweep across the
 * map. One compositor-only `translateY` loop, no JS, and it stops entirely
 * under `prefers-reduced-motion`.
 *
 * (The advisory-signal gauge used to live here as `TideGauge`; it now lives
 * in the collapsible `AdvisoryDrawer`, under the fixed `StatusKey` pills row.
 * No restore needed — the split reuses the same gauge markup and chip markup
 * in their new homes, and nothing else was deleted with them.)
 *
 * Both are pointer-events-none and sit under the sheet, so neither can intercept
 * a map gesture or outlive its usefulness at the full anchor.
 */

/** Slow sweep across the map surface. Pure CSS; see `.animate-tide-scan`. */
export function Scanline() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <span className="animate-tide-scan tide-scanline absolute inset-x-0 block h-24" />
    </div>
  )
}

/**
 * Corner registration marks.
 *
 * A schematic drawing registers its corners; this is the same idea applied to a
 * map surface, and it gives the dark map an intentional frame instead of the
 * crop you get from a full-bleed tile layer.
 */
export function RegistrationMarks() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-2 z-[1005]">
      {(
        [
          'left-0 top-0 border-l border-t',
          'right-0 top-0 border-r border-t',
          'left-0 bottom-0 border-b border-l',
          'right-0 bottom-0 border-b border-r',
        ] as const
      ).map((position) => (
        <span
          key={position}
          className={`absolute h-3 w-3 border-paper/25 ${position}`}
        />
      ))}
    </div>
  )
}
