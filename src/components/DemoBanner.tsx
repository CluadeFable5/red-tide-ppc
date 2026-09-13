import { isDemoBackend } from '../lib/backend'

/**
 * Shows only when the app is running against the offline demo backend, so
 * nobody mistakes demo data for a live Firebase project during a panel demo.
 */
export function DemoBanner() {
  if (!isDemoBackend()) return null

  return (
    <div className="bg-amber-100 text-amber-900">
      <div className="mx-auto flex max-w-5xl items-start gap-2 px-4 py-2 text-[11px] leading-relaxed sm:text-xs">
        <span aria-hidden="true">⚠️</span>
        <p>
          <span className="font-bold">Demo mode.</span> No Firebase keys were
          found, so data is kept in this browser only (nothing is shared or
          saved server-side). Copy <code className="font-mono">.env.example</code>{' '}
          to <code className="font-mono">.env</code> and add your Firebase config
          to use Firestore + Storage.
        </p>
      </div>
    </div>
  )
}
