import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useAppStore } from '../store'

const AUTO_DISMISS_MS = 7000

/**
 * Floating success/error toast driven by the store.
 *
 * Enter and exit both animate: previously the toast was mounted and unmounted
 * outright, so dismissing one made it vanish between frames. AnimatePresence
 * gives it a short slide-and-fade out, and the auto-dismiss timer is unchanged.
 *
 * The two tones are deliberately not equally loud. Errors take the advisory
 * red and do not auto-dismiss differently — but they read as urgent, while a
 * success sits on the raised surface with an amber tick.
 */
export function Notice() {
  const error = useAppStore((state) => state.error)
  const notice = useAppStore((state) => state.notice)
  const dismissMessages = useAppStore((state) => state.dismissMessages)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!notice && !error) return
    const timer = setTimeout(dismissMessages, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notice, error, dismissMessages])

  const message = error ?? notice
  const isError = Boolean(error)

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.98 }}
          transition={
            reduceMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 420, damping: 34 }
          }
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[1100] sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <div
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3 backdrop-blur-md ${
              isError
                ? 'border-advisory/40 bg-advisory/12'
                : 'border-line bg-ink-2/95'
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 ${isError ? 'text-advisory' : 'text-accent'}`}
              aria-hidden="true"
            >
              {isError ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-13a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm0 9.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
            <p
              className={`flex-1 text-sm leading-snug ${
                isError ? 'text-paper' : 'text-paper/90'
              }`}
            >
              {message}
            </p>
            <button
              type="button"
              onClick={dismissMessages}
              aria-label="Dismiss message"
              className="-mr-1 shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-white/10 hover:text-paper"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.3 5a1 1 0 0 0-1.3 1.4L8.6 10l-3.6 3.6A1 1 0 1 0 6.3 15l3.7-3.6 3.6 3.6a1 1 0 0 0 1.4-1.4L11.4 10l3.6-3.6A1 1 0 0 0 13.7 5L10 8.6 6.3 5Z" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
