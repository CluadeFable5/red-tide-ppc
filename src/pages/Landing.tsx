import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CountUp } from '../components/CountUp'
import { DecryptedText } from '../components/DecryptedText'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { StatusPip } from '../components/StatusPip'
import { Waves } from '../components/Waves'
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
 */
export function Landing() {
  const zones = useAppStore((state) => state.zones)
  const reports = useAppStore((state) => state.reports)
  const zonesReady = useAppStore((state) => state.zonesReady)

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

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-ink text-paper">
      <Waves className="absolute inset-0 h-full w-full" />

      <div className="relative flex min-h-dvh flex-col">
        <Header
          eyebrow="Puerto Princesa, Palawan"
          title="Red Tide"
          right={
            <>
              <DemoBanner variant="chip" />
              <Link
                to="/admin"
                className="rounded-md border border-line bg-ink-2/85 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/75 transition-colors hover:border-accent/40 hover:text-accent"
              >
                Admin
              </Link>
              <Link
                to="/map"
                className="rounded-md border border-line bg-ink-2/85 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/75 transition-colors hover:border-accent/40 hover:text-accent"
              >
                Map
              </Link>
            </>
          }
        />

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6">
          {/* ---------------------------------------------------------- hero */}
          <section className="pt-14 sm:pt-24">
            <p className="text-xs font-medium tracking-[0.08em] text-accent">
              Community early warning
            </p>

            {/* The headline decrypts once on load (skipped on small viewports
                and under reduced motion — see DecryptedText). The label lives
                on the heading itself: the scrambling text is aria-hidden, so
                a screen reader never reads the glyphs. */}
            <h1
              aria-label="Red Tide"
              className="font-display mt-3 text-7xl leading-[0.9] text-paper sm:text-8xl"
            >
              <DecryptedText text="RED TIDE" />
            </h1>

            <p className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg">
              Watch the water, report what you see, and warn Puerto Princesa
              before bad shellfish reaches the table.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/map"
                className="rounded-lg bg-accent px-6 py-3 text-base font-semibold text-ink transition hover:brightness-110 active:scale-95"
              >
                Open the map
              </Link>
              <Link
                to="/map"
                className="text-sm font-medium text-paper/80 underline-offset-4 transition-colors hover:text-accent hover:underline"
              >
                Report a sighting
              </Link>
            </div>
          </section>

          {/* -------------------------------------------------- live status */}
          <section aria-label="Live status" className="mt-12 sm:mt-16">
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
          </section>

          {/* ------------------------------------------------------ figures */}
          <section aria-label="Figures" className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            <Figure label="Zones watched" value={zones.length} ready={zonesReady} />
            <Figure label="Pending reports" value={pendingTotal} />
            <Figure
              label="Under advisory"
              value={counts.advisory}
              valueClass={counts.advisory > 0 ? 'text-advisory' : undefined}
            />
          </section>

          {/* ------------------------------------------------ how it works */}
          <section className="mt-12 sm:mt-16" aria-label="How it works">
            <h2 className="text-base font-semibold text-paper">How it works</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
              <Bullet>
                Find your shore — six zones cover the coast, from the city bay
                to St. Paul Bay.
              </Bullet>
              <Bullet>
                Report what you see — water colour, dead shellfish; ten words
                is enough.
              </Bullet>
              <Bullet>
                A local admin verifies it — if it checks out, the zone goes
                under advisory.
              </Bullet>
            </ul>
          </section>

          {/* ----------------------------------------------------- primer */}
          <section className="mt-12 sm:mt-16" aria-label="What is red tide">
            <h2 className="text-base font-semibold text-paper">What is red tide?</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
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

          <div className="mt-12">
            <DemoBanner />
          </div>

          <footer className="mt-8 flex flex-col gap-1.5 border-t border-line py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
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
    <div className="rounded-lg border border-line bg-ink-2/50 px-3 py-2.5">
      <p
        className={`font-display text-3xl leading-none tabular-nums sm:text-4xl ${valueClass ?? 'text-paper'}`}
      >
        {ready ? <CountUp to={value} /> : <span aria-hidden="true">·</span>}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-faint">{label}</p>
    </div>
  )
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  )
}
