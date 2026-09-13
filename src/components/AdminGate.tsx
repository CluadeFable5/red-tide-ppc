import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { Header } from './Header'
import { Notice } from './Notice'

/**
 * Passcode gate for /admin.
 *
 * SECURITY: this is a plain string compare against `VITE_ADMIN_PASSCODE`, which
 * is compiled into the public JS bundle. It is a demo-grade lock, not
 * authentication — anyone can read the value in the page source. Replacing it
 * with Firebase Auth is the first thing to do before real use.
 */
export function AdminGate() {
  const tryUnlockAdmin = useAppStore((state) => state.tryUnlockAdmin)
  const formError = useAppStore((state) => state.formError)

  const [passcode, setPasscode] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (tryUnlockAdmin(passcode)) setPasscode('')
  }

  return (
    <div className="min-h-full">
      <Header
        eyebrow="Red Tide PPC"
        title="Admin review"
        right={
          <Link
            to="/"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Public map
          </Link>
        }
      />

      <main className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Enter admin passcode</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Approving a report puts a whole zone under advisory, so this view is
            locked. There are no user accounts in this MVP — just a shared
            passcode.
          </p>

          <form onSubmit={handleSubmit} className="mt-5">
            <label
              htmlFor="admin-passcode"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Passcode
            </label>
            <input
              id="admin-passcode"
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              autoComplete="current-password"
              autoFocus
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/25"
            />

            {formError && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200"
              >
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={passcode.length === 0}
              className="mt-4 w-full rounded-xl bg-ocean px-4 py-3 text-sm font-semibold text-white transition hover:bg-ocean-soft disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Unlock
            </button>
          </form>
        </div>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-slate-400">
          The passcode comes from <code className="font-mono">VITE_ADMIN_PASSCODE</code>{' '}
          in your <code className="font-mono">.env</code> file. If it is not set,
          the gate will tell you instead of guessing.
        </p>
      </main>

      <Notice />
    </div>
  )
}
