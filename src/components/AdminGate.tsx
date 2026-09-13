import { useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'
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
  const reduceMotion = useReducedMotion()

  const [passcode, setPasscode] = useState('')
  const shake = useAnimationControls()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (tryUnlockAdmin(passcode)) {
      setPasscode('')
      return
    }
    // Wrong passcode. A short horizontal shake says "no" faster than the error
    // text is read, and it does not move focus away from the field.
    if (!reduceMotion) {
      void shake.start({
        x: [0, -8, 8, -5, 5, 0],
        transition: { duration: 0.36, ease: 'easeInOut' },
      })
    }
  }

  return (
    <div className="min-h-full">
      <Header
        eyebrow="Red Tide PPC"
        title="Admin review"
        right={
          <Link
            to="/"
            className="rounded-md border border-line bg-ink-3 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/75 transition-colors hover:border-accent/40 hover:text-accent"
          >
            Public map
          </Link>
        }
      />

      <main className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 380, damping: 30 }
          }
          className="rounded-2xl border border-line bg-ink-2 p-6"
        >
          <span
            className="grid h-10 w-10 place-items-center rounded-lg bg-accent/12 text-accent ring-1 ring-inset ring-accent/25"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
              <path strokeLinecap="round" d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            </svg>
          </span>

          <h1 className="font-display mt-4 text-3xl leading-none text-paper">
            Enter admin passcode
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Approving a report puts a whole zone under advisory, so this view is
            locked. There are no user accounts in this MVP — just a shared
            passcode.
          </p>

          <form onSubmit={handleSubmit} className="mt-5">
            <label
              htmlFor="admin-passcode"
              className="block font-mono text-[10px] uppercase tracking-[0.14em] text-faint"
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
              className="mt-1.5 w-full rounded-xl border border-line bg-ink px-3 py-3 font-mono text-sm tracking-[0.2em] text-paper placeholder:text-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25"
            />

            <AnimatePresence initial={false}>
              {formError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
                  className="overflow-hidden"
                >
                  <p
                    role="alert"
                    className="mt-3 rounded-lg border border-advisory/30 bg-advisory/10 px-3 py-2 text-xs font-medium text-advisory"
                  >
                    {formError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              animate={shake}
              disabled={passcode.length === 0}
              whileTap={
                passcode.length === 0 || reduceMotion ? undefined : { scale: 0.98 }
              }
              className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-faint"
            >
              Unlock
            </motion.button>
          </form>
        </motion.div>

        <p className="mt-4 px-1 font-mono text-[10px] leading-relaxed text-faint">
          The passcode comes from{' '}
          <code className="text-muted">VITE_ADMIN_PASSCODE</code> in your{' '}
          <code className="text-muted">.env</code> file. If it is not set, the gate
          will tell you instead of guessing.
        </p>
      </main>

      <Notice />
    </div>
  )
}
