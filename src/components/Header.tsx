import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/** App bar shared by the public map and the admin view. */
export function Header({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string
  title: string
  right?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-[900] border-b border-white/10 bg-ocean text-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeWidth="1.8"
                d="M2 14c2.5-2.4 4.2 2.4 6.7 0s4.2 2.4 6.7 0 4.2 2.4 6.6 0M2 19c2.5-2.4 4.2 2.4 6.7 0s4.2 2.4 6.7 0 4.2 2.4 6.6 0"
              />
              <circle cx="12" cy="6" r="3" strokeWidth="1.8" />
            </svg>
          </span>
          <span className="min-w-0">
            {eyebrow && (
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                {eyebrow}
              </span>
            )}
            <span className="block truncate text-sm font-bold leading-tight sm:text-base">
              {title}
            </span>
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
      </div>
    </header>
  )
}
