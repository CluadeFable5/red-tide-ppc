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
}: {
  eyebrow?: string
  title: string
  right?: ReactNode
  overlay?: boolean
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
          <span
            className={`block truncate font-mono text-[9px] uppercase tracking-[0.18em] ${
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
          <div className="flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <Link
              to="/"
              className="pointer-events-auto flex min-w-0 items-center gap-2.5"
            >
              {brand}
            </Link>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {right}
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-[900] border-b border-line bg-ink/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          {brand}
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
      </div>
    </header>
  )
}
