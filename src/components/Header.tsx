import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * App bar.
 *
 * Two variants:
 *  - default — sticky, opaque; used by /admin where content scrolls under it.
 *  - overlay — absolutely positioned over the map with a scrim gradient, so the
 *    map is the hero on a phone instead of a separate banner eating ~90px of
 *    the first viewport above it.
 */
export function Header({
  eyebrow,
  title,
  right,
  overlay = false,
  containerClassName = 'max-w-5xl px-5 min-[400px]:px-6 sm:px-6',
}: {
  eyebrow?: string
  title: string
  right?: ReactNode
  overlay?: boolean
  /** Opt-in page sizing; default and map overlay layouts stay unchanged. */
  containerClassName?: string
}) {
  const brand = (
    <>
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/12 text-accent ring-1 ring-inset ring-accent/25"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeWidth="2"
            d="M2 14c2.5-2.4 4.2 2.4 6.7 0s4.2 2.4 6.7 0 4.2 2.4 6.6 0M2 19c2.5-2.4 4.2 2.4 6.7 0s4.2 2.4 6.7 0 4.2 2.4 6.6 0"
          />
          <circle cx="12" cy="6" r="3" strokeWidth="2" />
        </svg>
      </span>
      <span className="min-w-0">
        {eyebrow && (
          /*
            The eyebrow is the first thing to go on a narrow screen. It is
            secondary ("Puerto Princesa, Palawan" / "Admin"), and letting it
            reserve width was squeezing the actual product name down to
            "Red …" at 360px. `hidden min-[380px]:block` drops it below 380px
            so the title always gets the full brand column.
          */
          <span
            className={`hidden truncate font-mono text-[9px] uppercase tracking-[0.18em] min-[380px]:block ${
              overlay ? 'text-paper/55' : 'text-faint'
            }`}
          >
            {eyebrow}
          </span>
        )}
        {/*
          Bebas Neue is all-caps by design — never apply `uppercase` on top of
          it, or the tracking blows out.
        */}
        <span
          className={`font-display block truncate leading-[0.95] ${
            overlay ? 'text-[19px] text-paper' : 'text-[21px] text-paper'
          }`}
        >
          {title}
        </span>
      </span>
    </>
  )

  if (overlay) {
    return (
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1010]">
        {/* Scrim: keeps the brand legible over bright map tiles without
            drawing a hard panel across the top of the photo. */}
        <div className="bg-gradient-to-b from-ink via-ink/85 to-transparent pb-8">
          {/* Phase-3 ambient orbs (orbs.jakubantalik.com, adapted): soft
              gradient drift behind the brand row ONLY — the layer is clipped
              to the header strip so it can never reach the pills row or the
              map body. Transform/opacity animation only; static under
              reduced motion; paused while the camera moves. */}
          <div
            aria-hidden="true"
            data-testid="header-orbs"
            className="absolute inset-x-0 top-0 h-14 overflow-hidden"
          >
            <span className="orb orb--header-a" />
            <span className="orb orb--header-b" />
          </div>
          <div className="relative flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <Link
              to="/"
              className="pointer-events-auto flex min-w-0 items-center gap-2.5"
            >
              {brand}
            </Link>
            <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5">
              {right}
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-[900] border-b border-line bg-ink/95 backdrop-blur-md">
      {/*
        Gutter matches the page container (20px under 400px, 24px above) so the
        brand lines up with the body copy instead of sitting closer to the edge.
        Row height is unchanged at 54px — the extra breathing room on mobile is
        bought with the page gutter and the hero spacing, not by a taller
        sticky bar eating the first viewport.
      */}
      <div className={`mx-auto flex items-center gap-3 py-2.5 ${containerClassName}`}>
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          {brand}
        </Link>
        {/*
          The action cluster. At 360px these sat 8px apart — ADMIN and MAP read
          as one blob — so the gap is now 10px.

          Deliberately NOT `flex-wrap`: letting it wrap was tried and measured
          worse. The cluster is wider than the space left over once the brand
          takes its share, so wrapping put MAP on its own line, pushed the
          header from 53px to 97px (three rows) and truncated the brand to
          "PUERTO PRINCESA,…". `shrink-0` keeps the cluster on one line and lets
          the brand — which already has `min-w-0` and `truncate` — absorb the
          pressure instead.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-2 min-[400px]:gap-2.5">{right}</div>
      </div>
    </header>
  )
}
