import { LiveDataStatus } from '../components/LiveDataStatus'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { animate, motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import type { Variants } from 'motion/react'
import { BlurText } from '../components/BlurText'
import { CountUp } from '../components/CountUp'
import { DecryptedText } from '../components/DecryptedText'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { HeroBackdrop } from '../components/HeroBackdrop'
import { StatusPip } from '../components/StatusPip'
import { Waves } from '../components/Waves'
import { prefetchMapPage } from '../App'
import '../styles/landing-motion.css'
import { dominantZoneStatus } from '../motion/readouts'
import { zoneTheme } from '../styles/statusTheme'
import { selectPendingCountByZone, useAppStore } from '../store'
import type { ZoneStatus } from '../types'

/**
 * The pre-map landing page at `/`.
 *
 * THE MAP IS DELIBERATELY NOT HERE
 * --------------------------------
 * The landing earns the click to /map: one headline, one sentence, one big
 * CTA, and the live figures. It reads as a public tool — plain sans labels,
 * no dossier chrome — not as a showcase page.
 *
 * Every figure on this page is live from the same feeds the map uses (the
 * store is initialised once in `App`), which is also why the Firebase chunk
 * ships with the landing bundle instead of being deferred — see
 * `docs/design-references.md` §14.3.
 *
 * THE MOTION PASS (§15)
 * ---------------------
 * Two layers, each scoped so they never overlap:
 *
 *  - `HeroBackdrop` — the Ferrofluid WebGL panel, the hero only. It is sized
 *    by the full-bleed hero band (THE HERO BAND below), not by the content
 *    column, and it owns all the reduced-motion / off-screen / lazy-load
 *    policy; see that file.
 *  - `Waves` — the existing 2D canvas, now masked out behind the hero so only
 *    one animated layer ever repaints a given band of the page.
 *
 * Text reveals use `BlurText`, each block triggered by its own scroll
 * intersection so the page resolves as you read down it rather than firing
 * everything at load.
 *
 * WHAT IS DELIBERATELY NOT ANIMATED
 * ---------------------------------
 * The secondary CTA, the "what is red tide" primer, the `DemoBanner` and the
 * "not an official BFAR advisory" disclaimer are plain DOM. The primary
 * "Open the map" link has a CSS hover only (`landing-motion.css`) — present
 * and clickable on the first frame; reduced motion keeps brightness without
 * the lift or glow. Safety copy and the route to the map must never depend
 * on an animation, an observer or a WebGL context succeeding.
 */
/**
 * The "How it works" steps. Extracted only so each can carry its own scroll
 * trigger — the strings are unchanged from what shipped.
 */
/**
 * Every route into /map starts the map chunk downloading on hover/focus, so the
 * route transition is not paying for a network round trip mid-animation.
 * See `prefetchMapPage` in App.tsx for why this is not done on page load.
 */
const MAP_CTA_PREFETCH = {
  onPointerEnter: prefetchMapPage,
  onFocus: prefetchMapPage,
} as const

// Shared only by this page and its header. Keep readable prose measures inside
// a genuinely growing shell, rather than capping the entire page at 42rem.
const LANDING_CONTAINER =
  'w-full max-w-2xl px-5 min-[400px]:px-6 md:max-w-4xl md:px-8 lg:max-w-6xl xl:max-w-7xl xl:px-10 2xl:max-w-[100rem] 2xl:px-12'

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const

const HOW_IT_WORKS = [
  'Find your shore — seven zones cover the coast, from the city bay to St. Paul Bay.',
  'Report what you see — water colour, dead shellfish; ten words is enough.',
  'A local admin verifies it — if it checks out, the zone goes under advisory.',
] as const

export function Landing() {
  const zones = useAppStore((state) => state.zones)
  const reports = useAppStore((state) => state.reports)
  const zonesReady = useAppStore((state) => state.zonesReady)
  const reportsReady = useAppStore((state) => state.reportsReady)
  const reduceMotion = useReducedMotion()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleGlowRef = useRef<{ stop: () => void } | null>(null)
  // Latest preference, so the decrypt callback (stored in a ref inside
  // DecryptedText) does not restart the scramble when this identity changes.
  const reduceMotionRef = useRef(reduceMotion)
  reduceMotionRef.current = reduceMotion

  useEffect(() => {
    if (!reduceMotion) return
    titleGlowRef.current?.stop()
    if (titleRef.current) titleRef.current.style.filter = ''
  }, [reduceMotion])

  useEffect(() => {
    return () => titleGlowRef.current?.stop()
  }, [])

  const counts = useMemo(() => {
    const result: Record<ZoneStatus, number> = { safe: 0, unconfirmed: 0, advisory: 0 }
    for (const zone of zones) result[zone.status] += 1
    return result
  }, [zones])

  const pendingTotal = useMemo(
    () => Object.values(selectPendingCountByZone(reports)).reduce((a, b) => a + b, 0),
    [reports],
  )

  const dominant = dominantZoneStatus(counts)
  const dominantTheme = zoneTheme(dominant)

  const overviewContainerVariants: Variants = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: {
          staggerChildren: reduceMotion ? 0 : 0.07,
          delayChildren: reduceMotion ? 0 : 0.15,
        },
      },
    }),
    [reduceMotion],
  )

  const overviewChildVariants: Variants = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
      show: {
        opacity: 1,
        y: 0,
        transition: {
          duration: reduceMotion ? 0 : 0.4,
          ease: EASE_OUT_QUINT,
        },
      },
    }),
    [reduceMotion],
  )

  const primerContainerVariants: Variants = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
      show: {
        opacity: 1,
        y: 0,
        transition: {
          duration: reduceMotion ? 0 : 0.45,
          ease: EASE_OUT_QUINT,
          staggerChildren: reduceMotion ? 0 : 0.08,
        },
      },
    }),
    [reduceMotion],
  )

  const primerItemVariants: Variants = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduceMotion ? 0 : 8 },
      show: {
        opacity: 1,
        y: 0,
        transition: {
          duration: reduceMotion ? 0 : 0.35,
          ease: EASE_OUT_QUINT,
        },
      },
    }),
    [reduceMotion],
  )

  const hasIntersectionObserver =
    typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function'

  return (
    <>
      {/* Outside the overflow-x-clip root: that clip can make `fixed`
          relative to the page instead of the viewport. */}
      <LandingScrollProgress />
    <div className="relative min-h-dvh overflow-x-clip bg-ink text-paper">
      <LiveDataStatus />
      {/*
        The ambient sine canvas stays, but it is masked out across the top of
        the page so it does not repaint the same pixels the hero's Ferrofluid
        panel already owns. One animated layer per band of the page.
      */}
      <Waves
        advisoryActive={zonesReady && counts.advisory > 0}
        className="absolute inset-0 h-full w-full [mask-image:linear-gradient(to_bottom,transparent_0,transparent_380px,black_620px)]"
      />

      <div className="relative flex min-h-dvh flex-col">
        <Header
          containerClassName={LANDING_CONTAINER}
          eyebrow="Puerto Princesa, Palawan"
          title="Red Tide"
          right={
            <>
              <DemoBanner variant="chip" />
              <Link
                to="/admin"
                className="rounded-md border border-line bg-ink-2/85 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-paper/75 transition-colors hover:border-accent/40 hover:text-accent min-[400px]:px-3 min-[400px]:tracking-[0.12em] sm:px-2.5 sm:py-1.5"
              >
                Admin
              </Link>
              <Link
                to="/map"
                {...MAP_CTA_PREFETCH}
                className="rounded-md border border-line bg-ink-2/85 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-paper/75 transition-colors hover:border-accent/40 hover:text-accent min-[400px]:px-3 min-[400px]:tracking-[0.12em] sm:px-2.5 sm:py-1.5"
              >
                Map
              </Link>
            </>
          }
        />

        {/*
          THE HERO BAND — full-bleed, and deliberately outside <main>.

          `HeroBackdrop` used to be mounted inside the Introduction section,
          which made its `absolute inset-0` the size of that section: the left
          grid column, inside the centered max-w-* container. The texture
          stopped in a rectangle around the headline block while the rest of
          the band — the live-overview column, the page margins — stayed flat
          black. The backdrop is therefore sized by THIS wrapper, a full-bleed
          sibling of <main> (a child cannot outgrow <main>'s max-width without
          negative-margin hacks), and the content column below layers on top
          of it. Nothing below the hero moves: the band starts exactly where
          <main> used to start, so every rect the spacing/responsive passes
          measured is unchanged — only the backdrop's bounds grew.
        */}
        <div className="relative">
          {/* Keep one lazy, reduced-motion-safe animation scoped to the hero.
              No map bundle or second canvas is needed for the wider layout.
              Being the band's first child is what sizes it: the hero's full
              width and height, both columns included — not the content
              column, which is what clipped it before. */}
          <HeroBackdrop />

          {/* `relative` is the layering contract: a positioned element paints
              after the absolutely-positioned backdrop above it, so the whole
              content column — headline, CTAs, live overview — sits on top of
              the texture rather than under it. */}
          <div className={`relative mx-auto ${LANDING_CONTAINER}`}>
            {/* Stack on phones/tablets; use the right half for live information
                on laptops instead of stretching the hero paragraph across it. */}
            <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12 lg:pt-20 xl:gap-20 2xl:gap-24">
              <section aria-label="Introduction" className="min-w-0 pt-20 sm:pt-24 lg:pt-0">
                <div>
                  {/* Short label — letters read better than words at this size,
                      and it is the first thing to resolve. */}
                  <BlurText
                    as="p"
                    text="Community early warning"
                    animateBy="letters"
                    direction="top"
                    delay={14}
                    stepDuration={0.22}
                    className="text-xs font-medium tracking-[0.08em] text-accent"
                  />

                  {/* The headline still decrypts once on load (skipped on small
                      viewports and under reduced motion — see DecryptedText). The
                      label lives on the heading itself: the scrambling text is
                      aria-hidden, so a screen reader never reads the glyphs. */}
                  <h1
                    ref={titleRef}
                    aria-label="Red Tide"
                    className="font-display mt-4 text-7xl leading-[0.9] text-paper sm:mt-3 sm:text-8xl xl:text-9xl"
                  >
                    <DecryptedText
                      text="RED TIDE"
                      onComplete={() => {
                        // Reduced motion keeps the resolved title and skips the
                        // glow. The 100ms delay is the breath after the last
                        // character locks, not a gate on the heading.
                        if (reduceMotionRef.current) return
                        const node = titleRef.current
                        if (!node) return
                        titleGlowRef.current?.stop()
                        titleGlowRef.current = animate(
                          node,
                          {
                            filter: [
                              'drop-shadow(0 0 12px rgba(255, 82, 82, 0.6))',
                              'drop-shadow(0 0 0px rgba(255, 82, 82, 0))',
                            ],
                          },
                          { duration: 1.2, ease: 'easeOut', delay: 0.1 },
                        )
                      }}
                    />
                  </h1>

                  {/* The subheading blurs in by words, after the scramble has had
                      time to resolve above it. */}
                  <BlurText
                    as="p"
                    text="Watch the water, report what you see, and warn Puerto Princesa before bad shellfish reaches the table."
                    animateBy="words"
                    direction="top"
                    delay={55}
                    className="mt-5 block max-w-md text-base leading-relaxed text-muted sm:mt-4 sm:text-lg xl:max-w-lg xl:text-xl"
                  />

                  {/* Clickable on the first frame. Hover lift/glow is CSS only
                      (landing-motion.css); it never gates the route. */}
                  <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 sm:mt-8 sm:gap-y-3">
                    <Link
                      to="/map"
                      {...MAP_CTA_PREFETCH}
                      className="landing-map-cta rounded-lg bg-accent px-6 py-3 text-base font-semibold text-ink"
                    >
                      Open the map
                    </Link>
                    <Link
                      to="/map"
                      {...MAP_CTA_PREFETCH}
                      className="text-sm font-medium text-paper/80 underline-offset-4 transition-colors hover:text-accent hover:underline"
                    >
                      Report a sighting
                    </Link>
                  </div>
                </div>
              </section>

              <motion.div
                variants={overviewContainerVariants}
                initial="hidden"
                animate="show"
                className="mt-14 min-w-0 sm:mt-16 lg:mt-0 lg:rounded-xl lg:border lg:border-line lg:bg-ink-2/60 lg:p-6 xl:p-8"
              >
                <h2 className="mb-5 hidden text-base font-semibold text-paper lg:block">Coastal overview</h2>
                {/* -------------------------------------------------- live status */}
                <motion.section variants={overviewChildVariants} aria-label="Live status">
                  {zonesReady ? (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-line bg-ink-2/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                      <StatusPip
                        hex={dominantTheme.hex}
                        pulses={dominantTheme.pulses}
                        trigger={dominant}
                      />
                      <span className="font-medium text-paper/90">
                        {zones.length} zones watched
                      </span>
                      <span className="text-faint">
                        · {counts.advisory} advisory · {counts.unconfirmed} unconfirmed
                      </span>
                      <span className="ml-auto text-paper/80">
                        {pendingTotal} pending report{pendingTotal === 1 ? '' : 's'}
                      </span>
                    </div>
                  ) : (
                    <p
                      role="status"
                      className="animate-pulse rounded-lg border border-line bg-ink-2/60 px-3.5 py-2.5 text-[13px] text-faint"
                    >
                      Reading the water…
                    </p>
                  )}
                </motion.section>

                {/* ------------------------------------------------------ figures */}
                <motion.section
                  variants={overviewChildVariants}
                  aria-label="Figures"
                  className="mt-3.5 grid grid-cols-3 gap-2.5 sm:mt-4 sm:gap-3"
                >
                  <Figure label="Zones watched" value={zones.length} ready={zonesReady} />
                  <Figure label="Pending reports" value={pendingTotal} ready={reportsReady} />
                  <Figure
                    label="Under advisory"
                    value={counts.advisory}
                    ready={zonesReady}
                    valueClass={counts.advisory > 0 ? 'text-advisory' : undefined}
                  />
                </motion.section>
              </motion.div>
            </div>
          </div>
        </div>

        <main className={`mx-auto flex-1 ${LANDING_CONTAINER}`}>
          <div className="mt-14 grid gap-14 sm:mt-16 sm:gap-16 md:grid-cols-2 md:gap-10 lg:mt-20 xl:gap-20 2xl:gap-24">
            {/* ------------------------------------------------ how it works */}
            {/*
              Its own scroll trigger, well below the hero: by the time this is on
              screen the hero's reveal is long finished, so the page resolves
              section by section instead of all at once.

              Same copy as before, verbatim — only the delivery changed.
            */}
            <section className="min-w-0" aria-label="How it works">
              <h2 className="text-base font-semibold text-paper lg:text-lg">
                <BlurText text="How it works" animateBy="words" direction="top" delay={70} />
              </h2>
              <ul className="mt-4 space-y-3.5 text-sm leading-relaxed text-muted sm:mt-3 sm:space-y-2.5 lg:text-base">
                {HOW_IT_WORKS.map((item, index) => (
                  <Bullet key={item}>
                    <BlurText
                      text={item}
                      animateBy="words"
                      direction="top"
                      delay={18}
                      // Each item waits for the one above it, so the list reads
                      // top-to-bottom rather than as three simultaneous blocks.
                      rootMargin={`0px 0px ${-8 - index * 4}% 0px`}
                    />
                  </Bullet>
                ))}
              </ul>
            </section>

            {/* ----------------------------------------------------- primer */}
            {hasIntersectionObserver ? (
              <motion.section
                className="min-w-0"
                aria-label="What is red tide"
                variants={primerContainerVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
              >
                <h2 className="text-base font-semibold text-paper lg:text-lg">What is red tide?</h2>
                <ul className="mt-4 space-y-3.5 text-sm leading-relaxed text-muted sm:mt-3 sm:space-y-2.5 lg:text-base">
                  <Bullet variants={primerItemVariants}>
                    A bloom of microscopic algae colours the water. Shellfish —{' '}
                    <em>tahong</em>, <em>talaba</em>, <em>halaan</em>,{' '}
                    <em>alamang</em> — concentrate its toxin as they feed.
                  </Bullet>
                  <Bullet variants={primerItemVariants}>
                    Eating affected shellfish causes numbness within 30 minutes to
                    2 hours, then trouble breathing. Cooking does not destroy the
                    toxin, and there is no antidote.
                  </Bullet>
                  <Bullet variants={primerItemVariants}>
                    Only BFAR can confirm red tide by lab test. This app warns
                    early — it does not replace official advisories.
                  </Bullet>
                </ul>
              </motion.section>
            ) : (
              <section className="min-w-0" aria-label="What is red tide">
                <h2 className="text-base font-semibold text-paper lg:text-lg">What is red tide?</h2>
                <ul className="mt-4 space-y-3.5 text-sm leading-relaxed text-muted sm:mt-3 sm:space-y-2.5 lg:text-base">
                  <Bullet>
                    A bloom of microscopic algae colours the water. Shellfish —{' '}
                    <em>tahong</em>, <em>talaba</em>, <em>halaan</em>,{' '}
                    <em>alamang</em> — concentrate its toxin as they feed.
                  </Bullet>
                  <Bullet>
                    Eating affected shellfish causes numbness within 30 minutes to
                    2 hours, then trouble breathing. Cooking does not destroy the
                    toxin, and there is no antidote.
                  </Bullet>
                  <Bullet>
                    Only BFAR can confirm red tide by lab test. This app warns
                    early — it does not replace official advisories.
                  </Bullet>
                </ul>
              </section>
            )}
          </div>

          <div className="mt-14 sm:mt-12">
            <DemoBanner />
          </div>

          <footer className="mt-10 flex flex-col gap-2 border-t border-line py-7 text-xs text-faint sm:mt-8 sm:gap-1.5 sm:py-6 sm:flex-row sm:items-center sm:justify-between">
            <p>Community early warning — not an official BFAR advisory</p>
            <p>
              Map data ©{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="text-muted transition-colors hover:text-accent"
              >
                OpenStreetMap
              </a>{' '}
              contributors
            </p>
          </footer>
        </main>
      </div>
    </div>
    </>
  )
}

/**
 * 2px reading progress on the right edge. `useScroll` + a heavily damped
 * spring drive `scaleY` from the top. Hooks always run; reduced motion and
 * viewports below `sm` hide the bar in CSS so it cannot gate a CTA.
 * z-800 sits above page content and under the landing header (z-900).
 */
function LandingScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 32,
    mass: 0.4,
    restDelta: 0.001,
  })

  return (
    <div
      aria-hidden="true"
      className="landing-scroll-progress pointer-events-none fixed inset-y-0 right-0 z-[800] hidden w-0.5 sm:block"
    >
      <motion.div className="landing-scroll-progress__fill absolute inset-0" style={{ scaleY }} />
    </div>
  )
}

function Figure({
  label,
  value,
  valueClass,
  ready = true,
}: {
  label: string
  value: number
  valueClass?: string
  /** The figure is fed by the live zone list — show a placeholder until it lands. */
  ready?: boolean
}) {
  return (
    <div className="rounded-lg border border-line bg-ink-2/50 px-3 py-3 sm:py-2.5 lg:px-4 lg:py-5">
      <p
        className={`font-display text-3xl leading-none tabular-nums sm:text-4xl xl:text-5xl ${valueClass ?? 'text-paper'}`}
      >
        {ready ? <CountUp to={value} from={0} duration={1.2} /> : <span aria-hidden="true">·</span>}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-faint lg:mt-2 lg:text-xs">{label}</p>
    </div>
  )
}

function Bullet({ children, variants }: { children: ReactNode; variants?: import('motion/react').Variants }) {
  if (variants) {
    return (
      <motion.li variants={variants} className="flex gap-3 sm:gap-2.5">
        <span
          className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70"
          aria-hidden="true"
        />
        <span>{children}</span>
      </motion.li>
    )
  }

  return (
    <li className="flex gap-3 sm:gap-2.5">
      <span
        className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  )
}
