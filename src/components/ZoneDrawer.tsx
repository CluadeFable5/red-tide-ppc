import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useReducedMotion, useTransform } from 'motion/react'
import { MorphChevronIcon } from './MorphChevron'
import { formatRelative } from '../lib/format'
import { ZONE_STATUS_ORDER } from '../lib/status'
import {
  dominantZoneStatus,
  sidePanelReadout,
  zoneSummaryLine,
  zoneTag,
} from '../motion/readouts'
import { isDragTail, SIDE_PANEL_STATE_ORDER } from '../motion/sidePanelAnchors'
import type { SidePanelController } from '../motion/useSidePanel'
import { useClipWindowWidth } from '../motion/useSidePanel'
import { zoneTheme } from '../styles/statusTheme'
import type { Zone, ZoneStatus } from '../types'
import { BlurText } from './BlurText'
import { DemoBanner } from './DemoBanner'
import { ZoneListSkeleton } from './LoadingState'
import { StatusPip } from './StatusPip'
import { ZoneStatusBadge } from './StatusBadge'

/**
 * The zone drawer: everything the bottom sheet held — advisory banner, zone
 * list, primer, OSM credit — as a two-state side drawer on the RIGHT edge.
 *
 * WHY THIS EXISTS
 * ---------------
 * The bottom sheet is gone (its files stay in the repo, unwired, per the
 * task's deletion hold). The screenshot markup pulled the bottom strip to
 * the top-right edge "behaving like the Advisory Signal drawer": swipe right
 * to tuck away leaving only a grab tab, swipe left or tap the tab to open.
 * This component is that drawer. It reuses the advisory drawer's proven
 * machinery rather than porting the sheet's anchor logic — same
 * `useSidePanel` hook, same clip-window technique (the window's width is
 * derived from the SAME motion value that positions the track, so content
 * can never render outside the visible bounds at any drag position), same
 * spring, same tap-after-drag guard, same reduced-motion jump. See
 * `AdvisoryDrawer.tsx` for the full architecture notes — mirrored here for
 * the right edge.
 *
 * GEOMETRY (the right-edge mirror)
 * --------------------------------
 * The drawer's row lives in the top-right control column
 * (`MapControlColumn`), under the zoom buttons and the advisory tab:
 * [tab][window], right-aligned, so the window's right edge is pinned and its
 * LEFT edge is the moving cut. The track is `justify-end`-aligned to the
 * pinned edge; `offsets.collapsed` is `+panelWidth` (the track slides right
 * to tuck). The controller is lifted into `MapPage` (like the sheet's was)
 * so zone focus can tuck the drawer on phones.
 *
 *   open:      the panel fills the rest of the column below its tab.
 *   collapsed: window at width 0; only the 44px grab tab stays on screen.
 *     The panel itself stays MOUNTED (screen readers and the report flow
 *     keep their DOM), and captures no pointer events outside the window.
 *
 * The panel is solid `bg-ink-2` — no `backdrop-blur` anywhere inside the
 * translated track, for the same mobile-GPU reason as the gauge card. The
 * tab keeps its blur: it is a static sibling, never inside a transformed
 * ancestor. Blur lives on static layers only.
 *
 * Non-drag paths (every state reachable without a swipe):
 *   - the grab tab: tap / Enter / Space toggles; ArrowRight collapses,
 *     ArrowLeft expands (directional pair for a right-edge drawer);
 *   - the summary line is a button that toggles;
 *   - two state dots jump directly to collapsed/open;
 *   - a chevron button toggles.
 *
 * Attribution: the always-visible licence credit is NOT in this drawer — it
 * is the persistent pill pinned bottom-left outside every clip window
 * (`map-attribution` in MapPage), so it survives the collapsed state. The
 * compact `© OSM` link in the header strip and the full credit in the footer
 * mirror what the sheet showed while open.
 *
 * Panel width: `min(100vw - 5rem, 23.75rem)` — the 5rem reserve keeps the
 * 44px tab + gap + page margin on screen at the narrowest audited width
 * (320px), so the tab is never pushed off the left edge.
 */

/** Fallback for the unmeasured panel (jsdom); matches the panel's max width. */
export const ZONE_PANEL_FALLBACK_WIDTH = 380

export interface ZoneDrawerProps {
  zones: Zone[]
  zonesReady: boolean
  pendingCounts: Record<string, number>
  counts: Record<ZoneStatus, number>
  selectedZoneId: string | null
  /** Lifted into MapPage so zone focus can tuck the drawer on phones. */
  panel: SidePanelController
  onFocusZone: (zoneId: string) => void
  onReport: (zoneId: string) => void
}

const ACTION_LABEL: Record<'open' | 'collapsed', string> = {
  open: 'Collapse the zone drawer',
  collapsed: 'Open the zone drawer',
}

/**
 * One scale on the header pip when the drawer opens from collapsed.
 *
 * Mount-open (desktop, ≥768) does not pulse — only a collapsed → open
 * transition. The pip's own `trigger` pulse (status change) is left alone;
 * this wrapper is the open cue. Reduced motion draws nothing. The wrapper
 * itself is never blurred: a transform plus backdrop-filter is the mobile
 * GPU trap this drawer already avoids.
 */
function HeaderPipPulse({
  state,
  children,
}: {
  state: 'open' | 'collapsed'
  children: React.ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(state)

  useEffect(() => {
    const opened = prev.current === 'collapsed' && state === 'open'
    prev.current = state
    if (!opened || reduceMotion) return
    const node = ref.current
    if (!node) return
    const controls = animate(
      node,
      { scale: [1, 1.4, 1] },
      { duration: 0.4, ease: 'easeOut' },
    )
    return () => controls.stop()
  }, [state, reduceMotion])

  return (
    <span ref={ref} className="inline-grid shrink-0 origin-center">
      {children}
    </span>
  )
}

function hasIntersectionObserver(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function'
}

/**
 * Zone card with scroll-triggered reveal inside the drawer's own scroll
 * container (NOT window). Uses IntersectionObserver with root = drawer
 * scroll container, so cards fade+slide as they enter the drawer's viewport
 * while scrolling down.
 *
 * - opacity 0 → 1, y: 8px → 0, 300ms ease-out
 * - once: true (hasSeen prevents re-animation)
 * - prefers-reduced-motion: show instantly
 * - initial open stagger preserved: cards that become visible within 600ms
 *   of the drawer opening get a delay of index * 0.065s, mimicking the
 *   existing open stagger (0.065s). Cards that appear later via scroll have
 *   no extra delay.
 * - Fallback for jsdom / no IO: visible immediately so tests pass.
 */
function ZoneCardItem({
  zone,
  index,
  scrollRootRef,
  open,
  pending,
  isSelected,
  onFocusZone,
  onReport,
  openTimestampRef,
}: {
  zone: Zone
  index: number
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  open: boolean
  pending: number
  isSelected: boolean
  onFocusZone: (zoneId: string) => void
  onReport: (zoneId: string) => void
  openTimestampRef: React.RefObject<number>
}) {
  const reduceMotion = useReducedMotion()
  const cardRef = useRef<HTMLLIElement>(null)
  const [inView, setInView] = useState(() => {
    if (reduceMotion) return true
    if (!hasIntersectionObserver()) return true
    return false
  })
  const [hasSeen, setHasSeen] = useState(() => {
    if (reduceMotion) return true
    if (!hasIntersectionObserver()) return true
    return false
  })
  const [isInitialBatch, setIsInitialBatch] = useState(false)

  useEffect(() => {
    if (reduceMotion) {
      setInView(true)
      setHasSeen(true)
      return
    }
    if (hasSeen) return
    if (!open) return
    const el = cardRef.current
    if (!el) return
    if (!hasIntersectionObserver()) {
      setInView(true)
      setHasSeen(true)
      setIsInitialBatch(true)
      return
    }
    const root = scrollRootRef.current
    // If root is not yet available (first frame), observe with null root
    // and re-observe when root becomes available via the effect deps.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          const elapsed = Date.now() - (openTimestampRef.current ?? Date.now())
          setIsInitialBatch(elapsed < 600)
          setInView(true)
          setHasSeen(true)
          observer.disconnect()
        }
      },
      {
        root: root ?? null,
        threshold: 0.15,
        rootMargin: '0px 0px -10% 0px',
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, scrollRootRef, reduceMotion, hasSeen, openTimestampRef, scrollRootRef.current])

  const theme = zoneTheme(zone.status)
  const delay = reduceMotion ? 0 : isInitialBatch ? index * 0.065 : 0

  return (
    <motion.li
      ref={cardRef}
      initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      animate={inView || hasSeen ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.3, ease: 'easeOut', delay }
      }
      className={`group relative overflow-hidden rounded-lg border bg-ink transition-colors duration-200 ${
        isSelected
          ? 'border-accent/50 ring-1 ring-accent/20'
          : 'border-line hover:border-line-soft hover:bg-ink-3'
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-1 opacity-80"
        style={{ backgroundColor: theme.hex }}
        aria-hidden="true"
      />
      <div className="pl-3">
        <button
          type="button"
          onClick={() => onFocusZone(zone.id)}
          className="block w-full p-3 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg leading-none text-paper">
              {zone.name}
            </h3>
            <ZoneStatusBadge status={zone.status} size="sm" />
          </div>

          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
            {zoneTag(zone.id)} · {formatRelative(zone.lastUpdated)}
          </p>

          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
            {zone.description}
          </p>
          {pending > 0 && (
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
              <span
                className="h-1.5 w-1.5 rounded-full bg-accent"
                aria-hidden="true"
              />
              {pending} pending {pending === 1 ? 'report' : 'reports'}
            </p>
          )}
        </button>
        <div className="flex items-center justify-between gap-2 border-t border-line/70 px-3 py-1.5">
          <button
            type="button"
            onClick={() => onReport(zone.id)}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-accent"
          >
            Report here →
          </button>
          <span className="font-mono text-[9px] tracking-[0.14em] text-faint opacity-0 transition-opacity group-hover:opacity-100">
            {zone.polygon.length} PT
          </span>
        </div>
      </div>
    </motion.li>
  )
}

/**
 * Primer section with:
 * - Heading using BlurText word-by-word blur reveal, triggered by the
 *   drawer's scroll container (root = drawer scroll), delay 0, word delay 60ms
 * - Paragraphs fading in staggered as user scrolls to them, via
 *   IntersectionObserver on drawer container, once true, 280ms ease-out,
 *   stagger 80ms, y 6→0
 * - Respects prefers-reduced-motion
 */
function Primer({
  scrollRoot,
  scrollRootRef,
  open,
}: {
  scrollRoot: Element | null
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  open: boolean
}) {
  const reduceMotion = useReducedMotion()
  const sectionRef = useRef<HTMLElement>(null)
  const [sectionInView, setSectionInView] = useState(() => {
    if (reduceMotion) return true
    if (!hasIntersectionObserver()) return true
    return false
  })
  const [hasSeen, setHasSeen] = useState(() => {
    if (reduceMotion) return true
    if (!hasIntersectionObserver()) return true
    return false
  })

  useEffect(() => {
    if (reduceMotion) {
      setSectionInView(true)
      setHasSeen(true)
      return
    }
    if (hasSeen) return
    if (!open) return
    const el = sectionRef.current
    if (!el) return
    if (!hasIntersectionObserver()) {
      setSectionInView(true)
      setHasSeen(true)
      return
    }
    const root = scrollRootRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSectionInView(true)
          setHasSeen(true)
          observer.disconnect()
        }
      },
      {
        root: root ?? null,
        threshold: 0.2,
        rootMargin: '0px 0px -10% 0px',
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, scrollRootRef, reduceMotion, hasSeen, scrollRootRef.current])

  const paragraphs = useMemo(
    () => [
      'An algae bloom that can colour the water reddish-brown. Shellfish — tahong, talaba, halaan, alamang — concentrate its toxin as they feed.',
      'Eating affected shellfish causes Paralytic Shellfish Poisoning (PSP). Cooking does not destroy the toxin — no antidote. Numbness starts within 30 min–2 hrs, then breathing trouble. Get to a hospital immediately.',
      'Fish, squid, shrimp and crab are usually safe if fresh and cleaned well.',
      'Community warning only — not an official BFAR advisory. Reports are admin-reviewed to warn faster, not to replace the BFAR bulletin.',
    ],
    [],
  )

  const footnote =
    'Zone outlines are approximate, for demonstration — not official boundaries.'

  return (
    <section
      ref={sectionRef}
      className="mt-6 rounded-lg border border-line bg-ink p-4"
    >
      <h2 className="font-display text-xl leading-none text-paper">
        {reduceMotion || !hasIntersectionObserver() ? (
          <>What is red tide? </>
        ) : (
          <BlurText
            text="What is red tide?"
            animateBy="words"
            direction="top"
            delay={60}
            threshold={0.2}
            rootMargin="0px 0px -10% 0px"
            root={scrollRoot}
            className="font-display text-xl leading-none text-paper"
            as="span"
          />
        )}{' '}
        <span className="font-sans text-sm font-normal text-faint">
          / “pula ang dagat”
        </span>
      </h2>

      {paragraphs.map((text, idx) => (
        <motion.p
          key={idx}
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          animate={
            sectionInView || hasSeen ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: 0.28,
                  ease: 'easeOut',
                  delay: idx * 0.08,
                }
          }
          className={`text-sm leading-relaxed text-muted ${idx === 0 ? 'mt-3' : 'mt-2'}`}
        >
          {text}
        </motion.p>
      ))}

      <motion.p
        initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
        animate={
          sectionInView || hasSeen ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                duration: 0.28,
                ease: 'easeOut',
                delay: paragraphs.length * 0.08,
              }
        }
        className="mt-4 font-mono text-[10px] leading-relaxed text-faint"
      >
        {footnote}
      </motion.p>
    </section>
  )
}

export function ZoneDrawer({
  zones,
  zonesReady,
  pendingCounts,
  counts,
  selectedZoneId,
  panel,
  onFocusZone,
  onReport,
}: ZoneDrawerProps) {
  const reduceMotion = useReducedMotion()
  const open = panel.state === 'open'
  const advisoryCount = counts.advisory ?? 0
  const summary = zoneSummaryLine(zones.length, advisoryCount)
  const dominant = dominantZoneStatus(counts)
  const dominantTheme = zoneTheme(dominant)
  const action = ACTION_LABEL[panel.state]

  const windowWidth = useClipWindowWidth(panel.offsetX, panel.panelWidth, panel.edge)

  const tabGap = useTransform(windowWidth, [0, 8], [0, 6], { clamp: true })

  // Scroll container ref — the drawer has its own scroll area, NOT window.
  // All scroll-triggered animations inside the drawer must use this as
  // IntersectionObserver root.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null)
  const openTimestampRef = useRef<number>(0)

  // Keep scrollRoot element in sync with the actual scroll container.
  // useLayoutEffect ensures the root is available before the browser paints,
  // so observers that depend on it don't miss the first frame.
  useLayoutEffect(() => {
    setScrollRoot(scrollRef.current)
  }, [open, zonesReady])

  useEffect(() => {
    if (open) {
      openTimestampRef.current = Date.now()
      // Re-sync root when drawer opens — the container may have been
      // 0-width while collapsed and now has layout.
      setScrollRoot(scrollRef.current)
    }
  }, [open])

  // Staggered entrance: the cards ride the drawer's own open/collapsed state,
  // driven by the same spring physics as the drag. This is kept for the
  // initial open animation (65ms per card). The scroll-triggered reveal
  // inside ZoneCardItem is separate — it handles cards coming into view as
  // the user scrolls DOWN through the list.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    setRevealed(true)
  }, [])

  const listVariants = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: {
          staggerChildren: reduceMotion ? 0 : 0.065,
          delayChildren: reduceMotion ? 0 : 0.065,
        },
      },
    }),
    [reduceMotion],
  )

  // The list itself still uses the open stagger for its first commit.
  // Individual cards now also have their own scroll-triggered reveal
  // (ZoneCardItem) which uses the drawer's scroll container as root.
  // Keeping the list variants preserves the existing open feel while the
  // new per-card IntersectionObserver handles the down-scroll case.

  const handleTabClick = useCallback(
    (event: React.MouseEvent) => {
      if (isDragTail(panel.didDrag(), event.detail)) return
      panel.toggle()
    },
    [panel],
  )

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        panel.goTo('collapsed')
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        panel.goTo('open')
      }
    },
    [panel],
  )

  const handleSummaryClick = useCallback(
    (event: React.MouseEvent) => {
      if (isDragTail(panel.didDrag(), event.detail)) return
      panel.toggle()
    },
    [panel],
  )

  return (
    <div
      className="pointer-events-none flex min-h-0 flex-1 flex-row items-start justify-end"
      role="region"
      aria-label="Advisory and zone list"
      data-testid="zone-drawer"
      data-state={panel.state}
      data-dragging={panel.dragging || undefined}
    >
      <motion.button
        type="button"
        onPointerDown={panel.startDrag}
        onClick={handleTabClick}
        onKeyDown={handleTabKeyDown}
        aria-expanded={open}
        aria-controls="zone-drawer-body"
        aria-label={action}
        title={action}
        data-testid="zone-drawer-tab"
        style={{ marginRight: tabGap }}
        className="pointer-events-auto flex w-11 shrink-0 select-none flex-col items-center gap-2 self-start rounded-lg border border-line bg-ink-2/88 py-3 backdrop-blur-md transition-colors [touch-action:none] hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StatusPip
          size="sm"
          hex={dominantTheme.hex}
          pulses={dominantTheme.pulses}
          trigger={dominant}
        />
        <MorphChevronIcon open={open} className="h-3.5 w-3.5 text-paper/70" />
        <span
          aria-hidden="true"
          className="block h-8 w-1 rounded-full bg-line-soft"
        />
      </motion.button>

      <motion.div
        style={{ width: windowWidth }}
        className="flex h-full min-h-0 shrink-0 justify-end overflow-hidden"
        data-testid="zone-drawer-window"
      >
        <motion.div
          ref={panel.panelRef}
          id="zone-drawer-body"
          style={{ x: panel.offsetX }}
          drag="x"
          dragListener={false}
          dragControls={panel.dragControls}
          dragConstraints={panel.constraints}
          dragElastic={{ left: 0.02, right: 0.05 }}
          dragMomentum={false}
          onDragStart={panel.onDragStart}
          onDragEnd={(_event, info) => panel.onDragEnd(info)}
          className="h-full w-max"
        >
          <div
            className="pointer-events-auto relative isolate flex h-full w-[min(100vw_-_5rem,23.75rem)] flex-col overflow-hidden rounded-l-xl border-l border-line bg-ink-2 shadow-[-24px_0_48px_-24px_rgba(0,0,0,0.9)]"
            data-testid="zone-drawer-panel"
          >
            <span aria-hidden="true" className="orb orb--panel -z-10" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-2"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(180deg, var(--color-line) 0 1px, transparent 1px 13px)',
              }}
            />

            <div
              onPointerDown={panel.startDrag}
              className="shrink-0 select-none [touch-action:none]"
            >
              <div className="flex justify-center pt-1.5">
                <span
                  aria-hidden="true"
                  className="block h-1 w-10 rounded-full bg-line-soft"
                />
              </div>

              <div className="px-3.5 pb-2 pt-2">
                <div className="flex items-center gap-2.5">
                  <HeaderPipPulse state={panel.state}>
                    <StatusPip
                      size="sm"
                      hex={dominantTheme.hex}
                      pulses={dominantTheme.pulses}
                      trigger={dominant}
                    />
                  </HeaderPipPulse>
                  <button
                    type="button"
                    onClick={handleSummaryClick}
                    aria-label={`${summary} — ${action}`}
                    title={action}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[11px] uppercase leading-none tracking-[0.1em] text-paper/85 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0"
                  >
                    {summary}
                  </button>
                </div>

                <div className="mt-1.5 flex items-center gap-2.5">
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-[9px] uppercase leading-none tracking-[0.12em] text-faint transition-colors hover:text-accent"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    © OSM
                  </a>

                  <span className="ml-auto shrink-0 font-mono text-[9px] leading-none tabular-nums text-faint">
                    {sidePanelReadout(panel.state)}
                  </span>

                  <div className="flex items-center gap-1" aria-label="Drawer position">
                    {SIDE_PANEL_STATE_ORDER.map((state) => (
                      <button
                        key={state}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isDragTail(panel.didDrag(), e.detail)) return
                          panel.goTo(state)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={
                          state === 'open'
                            ? 'Open the zone drawer'
                            : 'Collapse the zone drawer'
                        }
                        aria-pressed={panel.state === state}
                        title={state}
                        className={`h-2 w-2 rounded-full transition-all ${
                          panel.state === state
                            ? 'w-4 bg-accent'
                            : 'bg-line-soft hover:bg-line'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      if (isDragTail(panel.didDrag(), event.detail)) return
                      panel.toggle()
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={action}
                    title={action}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-paper/70 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <MorphChevronIcon open={open} className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <span
                aria-hidden="true"
                className="block h-px w-full opacity-60"
                style={{ backgroundColor: dominantTheme.hex }}
              />
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-4"
              data-testid="zone-drawer-scroll"
            >
              <AdvisoryBanner advisoryCount={advisoryCount} />

              <div className="mt-4 flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                  Zones <span className="text-paper/70">[{zones.length}]</span>
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                  {zones.length > 0 ? 'Tap to locate' : 'No zones loaded'}
                </span>
              </div>

              {!zonesReady && <ZoneListSkeleton />}

              {zonesReady && (
                <motion.ul
                  variants={listVariants}
                  initial="hidden"
                  animate={open && revealed ? 'show' : 'hidden'}
                  className="mt-2.5 grid gap-2"
                >
                  {zones.map((zone, idx) => {
                    const pending = pendingCounts[zone.id] ?? 0
                    const isSelected = zone.id === selectedZoneId
                    return (
                      <ZoneCardItem
                        key={zone.id}
                        zone={zone}
                        index={idx}
                        scrollRootRef={scrollRef}
                        open={open}
                        pending={pending}
                        isSelected={isSelected}
                        onFocusZone={onFocusZone}
                        onReport={onReport}
                        openTimestampRef={openTimestampRef}
                      />
                    )
                  })}
                </motion.ul>
              )}

              {zones.length === 0 && zonesReady && (
                <p className="mt-3 rounded-lg border border-dashed border-line bg-ink p-6 text-center text-sm text-muted">
                  No zones found. Run <code className="font-mono text-accent">npm run seed</code>{' '}
                  to load the Puerto Princesa zones.
                </p>
              )}

              <Primer
                scrollRoot={scrollRoot}
                scrollRootRef={scrollRef}
                open={open}
              />

              <div className="mt-3">
                <DemoBanner />
              </div>

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <p>
                  Key order: {ZONE_STATUS_ORDER.map((status) => status).join(' · ')}
                </p>
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-accent"
                >
                  © OpenStreetMap
                </a>
              </footer>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

/**
 * The advisory summary — same copy the sheet carried.
 */
function AdvisoryBanner({ advisoryCount }: { advisoryCount: number }) {
  if (advisoryCount > 0) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-advisory/30 bg-advisory/8 p-3 pl-4">
        <span className="absolute inset-y-0 left-0 w-1 bg-advisory" aria-hidden="true" />
        <h2 className="font-display text-lg leading-none text-advisory">
          {advisoryCount} {advisoryCount === 1 ? 'zone is' : 'zones are'} under advisory
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-paper/70">
          Do not gather, sell or eat shellfish or <em>alamang</em> from a zone marked{' '}
          <strong className="text-advisory">Advisory</strong>. Fish, squid, shrimp and
          crab are still safe if they are fresh, cleaned and washed before cooking.
        </p>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-safe/25 bg-safe/6 p-3 pl-4">
      <span className="absolute inset-y-0 left-0 w-1 bg-safe" aria-hidden="true" />
      <h2 className="font-display text-lg leading-none text-safe">No advisories</h2>
      <p className="mt-2 text-xs leading-relaxed text-paper/70">
        Nothing flagged. Tap a zone to report unusual water, dead shellfish, or numbness
        after eating.
      </p>
    </div>
  )
}
