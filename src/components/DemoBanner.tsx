import { isDemoBackend } from '../lib/backend'

/**
 * Demo-mode indicator.
 *
 * Two variants, because the message has two different jobs:
 *  - `chip`   — a compact marker for the map overlay, so anyone looking at the
 *               screen knows the data is local and not a live BFAR feed
 *  - `banner` — the full explanation, placed with the other caveats at the
 *               bottom of the page where it does not eat hero space
 *
 * Renders nothing at all when a real Firebase project is configured.
 */
export function DemoBanner({ variant = 'banner' }: { variant?: 'chip' | 'banner' }) {
  if (!isDemoBackend()) return null

  if (variant === 'chip') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/12 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-accent backdrop-blur-md"
        title="No Firebase config found — data is stored in this browser only."
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
          aria-hidden="true"
        />
        Demo
      </span>
    )
  }

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/8 p-4">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        Demo mode
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        No Firebase keys were found, so data is kept in this browser only —
        nothing is shared or saved server-side. Copy{' '}
        <code className="font-mono text-paper/80">.env.example</code> to{' '}
        <code className="font-mono text-paper/80">.env</code> and add your
        Firebase config to use Firestore + Storage.
      </p>
    </div>
  )
}
