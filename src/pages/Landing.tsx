import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CountUp } from '../components/CountUp'
import { DecryptedText } from '../components/DecryptedText'
import { DemoBanner } from '../components/DemoBanner'
import { Header } from '../components/Header'
import { StatusPip } from '../components/StatusPip'
import { Waves } from '../components/Waves'
import { dominantZoneStatus, zoneTag } from '../motion/readouts'
import { zoneStatusMeta } from '../lib/status'
import { zoneTheme } from '../styles/statusTheme'
import { selectPendingCountByZone, useAppStore } from '../store'
import type { ZoneStatus } from '../types'

/**
 * The pre-map landing page at `/`.
 *
 * THE MAP IS DELIBERATELY NOT HERE
 * --------------------------------
 * A map as a hero is a map as a *background* — the coastline shows through and
 * the advisory data competes with it for the same pixels. The landing earns
 * the click to /map: it states what this is, in the water's own register, and
 * shows the live numbers so the page is a readout, not a brochure.
 *
 * Every figure on this page is live from the same feeds the map uses (the
 * store is initialised once in `App`), which is also why the Firebase chunk
 * ships with the landing bundle instead of being deferred — see
 * `docs/design-references.md` §14.3.
 *
 * The three motion pieces are reactbits-inspired (DecryptedText hero, Waves
 * canvas, CountUp figures): hand-rolled to the tokens in `index.css`, no new
 * runtime dependency.
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

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 sm:px-6">
          {/* ---------------------------------------------------------- hero */}
          <section className="pt-12 sm:pt-20">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              Community early warning · PSP
            </p>

            {/* The headline decrypts once on load; Bebas is all-caps by
                design, so the scrambled glyphs never shift the width. The
                label lives on the heading itself: the scrambling text is
                aria-hidden, so a screen reader never reads the glyphs. */}
            <h1
              aria-label="Red Tide"
              className="font-display mt-4 text-[19vw] leading-[0.88] text-paper sm:text-[7.5rem]"
            >
              <DecryptedText text="RED TIDE" />
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              The water around Puerto Princesa changes before it hurts anyone.
              This map lets the community see the change, report it, and get a
              warning out before the shellfish reaches the table.
            </p>

            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Tahong · Talaba · Halaan · Alamang
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/map"
                className="rounded-md bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink transition-transform hover:brightness-110 active:scale-95"
              >
                Open the live map →
              </Link>
              <Link
                to="/map"
                className="rounded-md border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/80 transition-colors hover:border-accent/40 hover:text-accent"
              >
                Report a sighting
              </Link>
            </div>
          </section>

          {/* ------------------------------------------------- live readout */}
          <section aria-label="Live status" className="mt-14 sm:mt-20">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              Right now on the water
            </h2>

            <div className="mt-3 rounded-xl border border-line bg-ink-2/70 p-4 backdrop-blur-sm">
              {zonesReady ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/90">
                      <StatusPip
                        hex={dominantTheme.hex}
                        pulses={dominantTheme.pulses}
                        trigger={dominant}
                      />
                      {zones.length} zones watched
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                      {counts.advisory} advisory · {counts.unconfirmed} unconfirmed ·{' '}
                      {counts.safe} safe
                    </span>
                    <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                      {pendingTotal} pending report{pendingTotal === 1 ? '' : 's'}
                    </span>
                  </div>

                  <ul className="mt-3 grid grid-cols-1 gap-1.5 border-t border-line/70 pt-3 sm:grid-cols-2">
                    {zones.map((zone) => {
                      const theme = zoneTheme(zone.status)
                      return (
                        <li
                          key={zone.id}
                          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
                        >
                          <StatusPip
                            size="xs"
                            hex={theme.hex}
                            pulses={theme.pulses}
                            trigger={zone.status}
                          />
                          <span className="min-w-0 truncate">{zoneTag(zone.id)}</span>
                          <span className="ml-auto shrink-0 text-faint">
                            {zoneStatusMeta(zone.status).label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <p role="status" className="animate-pulse font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                  Reading the water…
                </p>
              )}
            </div>
          </section>

          {/* ---------------------------------------------------- figures */}
          <section aria-label="Figures" className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure
              label="Zones watched"
              value={zones.length}
              ready={zonesReady}
            />
            <Figure label="Pending reports" value={pendingTotal} />
            <Figure
              label="Under advisory"
              value={counts.advisory}
              valueClass={counts.advisory > 0 ? 'text-advisory' : undefined}
            />
            <Figure
              label="Min to first symptoms"
              value={30}
              suffix=" min"
              note="Typical onset, PSP"
            />
          </section>

          {/* ------------------------------------------------ how it works */}
          <section className="mt-14 sm:mt-20" aria-label="How it works">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              How it works
            </h2>
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              <Step index="01" title="Tap your zone" body="Pick your shore on the map — six zones cover the coast from the city bay to St. Paul Bay." />
              <Step index="02" title="Report what you see" body="Water colour, dead shellfish, or numbness after eating seafood. Ten words is enough." />
              <Step index="03" title="Admins verify" body="A local admin reviews the report. If it checks out, the zone goes under advisory." />
            </ol>
          </section>

          {/* ----------------------------------------------------- primer */}
          <section className="mt-14 sm:mt-20" aria-label="What is red tide">
            <h2 className="font-display text-3xl leading-none text-paper sm:text-4xl">
              What is red tide?
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              A red tide is a bloom of microscopic algae that can turn seawater
              reddish-brown. Some of these organisms produce{' '}
              <strong className="text-paper/90">saxitoxin</strong>, which
              shellfish — <em>tahong</em>, <em>talaba</em>, <em>halaan</em>,{' '}
              <em>alamang</em> — concentrate as they filter the water. Eating
              them causes Paralytic Shellfish Poisoning: numbness around the
              mouth within 30 minutes to 2 hours, then difficulty breathing.
              Cooking does not destroy the toxin, and there is no antidote.
            </p>
            <div className="mt-5 max-w-2xl rounded-md border-l-2 border-accent/60 bg-ink-3 p-4">
              <p className="text-xs font-semibold text-paper/90">
                This app is a community early-warning tool, not an official
                advisory.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Only the Bureau of Fisheries and Aquatic Resources (BFAR) can
                confirm a red tide through laboratory testing.
              </p>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Fish, squid, shrimp and crab from the same water are generally
              safe if they are fresh, gutted and washed before cooking. The full
              primer — and how to report — lives on the live map.
            </p>
          </section>

          <div className="mt-14">
            <DemoBanner />
          </div>

          <footer className="mt-8 flex flex-col gap-2 border-t border-line py-8 font-mono text-[10px] uppercase tracking-[0.14em] text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>Not an official BFAR advisory</p>
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
  suffix = '',
  note,
  valueClass,
  ready = true,
}: {
  label: string
  value: number
  suffix?: string
  note?: string
  valueClass?: string
  /** The figure is fed by the live zone list — show a placeholder until it lands. */
  ready?: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-ink-2/70 p-4 backdrop-blur-sm">
      <p className={`font-display text-4xl leading-none sm:text-5xl ${valueClass ?? 'text-paper'}`}>
        {ready ? (
          <CountUp to={value} suffix={suffix} />
        ) : (
          <span aria-hidden="true">·</span>
        )}
      </p>
      <p className="mt-2 font-mono text-[9px] uppercase leading-relaxed tracking-[0.16em] text-faint">
        {label}
        {note && <span className="mt-0.5 block normal-case tracking-normal text-faint/70">{note}</span>}
      </p>
    </div>
  )
}

function Step({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-line bg-ink-2/70 p-4 backdrop-blur-sm">
      <p className="font-mono text-[10px] tracking-[0.2em] text-accent">{index}</p>
      <h3 className="font-display mt-2 text-xl leading-none text-paper">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted">{body}</p>
    </li>
  )
}
