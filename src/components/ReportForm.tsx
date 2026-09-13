import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { formatBytes } from '../lib/format'
import { MAX_PHOTO_BYTES } from '../lib/image'
import {
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  useAppStore,
} from '../store'
import type { Zone } from '../types'
import { ZoneStatusBadge } from './StatusBadge'

type Phase = 'idle' | 'submitting' | 'success' | 'closing'

/** How long the success confirmation stays up before the sheet dismisses. */
const SUCCESS_HOLD_MS = 1600

/**
 * Anonymous report form — bottom sheet on phones, centred modal on wider
 * screens.
 *
 * DATA FLOW IS UNCHANGED: this still calls `store.submitReport` with the same
 * draft shape, and `store` still owns validation, the photo upload order and
 * closing the sheet. Nothing about the write path is touched here.
 *
 * The one structural addition is a presentation latch. `submitReport` clears
 * `reportZoneId` the moment the write succeeds, which would unmount this
 * component before it could show a success state. The parent (`MapPage`) holds
 * the zone reference and passes `open` down, so:
 *
 *   cancel      → `open` false while idle      → sheet animates out
 *   submit ok   → `open` false while submitting → stays up, flips to success,
 *                 holds ~1.6s, then animates out
 *   submit fail → `open` stays true             → form stays, error shows inline
 *
 * While the success state is up the container's role switches from `dialog`
 * to `status`: the form is finished, so it is no longer a dialog.
 */
export function ReportForm({
  zone,
  open,
  onClose,
  onDismissed,
}: {
  zone: Zone
  /** Driven by the store. False means the store considers the sheet closed. */
  open: boolean
  onClose: () => void
  /** Called once the exit animation has finished, so the parent can drop the latch. */
  onDismissed: () => void
}) {
  const submitReport = useAppStore((state) => state.submitReport)
  const formError = useAppStore((state) => state.formError)
  const reduceMotion = useReducedMotion()

  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaId = useId()
  const characterCount = description.trim().length
  const tooShort = characterCount < MIN_DESCRIPTION_LENGTH

  const isSuccess = phase === 'success'
  const isSubmitting = phase === 'submitting'
  // `submitting` is included so the sheet does not flash out in the instant
  // between the store closing it and this component learning it succeeded.
  const visible = open || isSubmitting || isSuccess

  // Lock background scrolling and close on Escape while the sheet is open.
  useEffect(() => {
    if (!visible) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [visible, isSubmitting, onClose])

  // Hold the success state briefly, then let it exit.
  useEffect(() => {
    if (!isSuccess) return
    const timer = setTimeout(() => setPhase('closing'), SUCCESS_HOLD_MS)
    return () => clearTimeout(timer)
  }, [isSuccess])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    if (!file) {
      setPhoto(null)
      setPreviewUrl(null)
      setLocalError(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setLocalError('Please choose an image file.')
      setPhoto(null)
      setPreviewUrl(null)
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setLocalError(`That photo is ${formatBytes(file.size)} — the limit is 5 MB.`)
      setPhoto(null)
      setPreviewUrl(null)
      return
    }

    setLocalError(null)
    setPhoto(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (tooShort || isSubmitting) return

    setPhase('submitting')
    try {
      await submitReport({ zoneId: zone.id, description, photo })
      setPhase('success')
    } catch {
      // store.submitReport already recorded the message in `formError`; the
      // form stays open and shows it inline.
      setPhase('idle')
    }
  }

  const sheetTransition = reduceMotion
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.9 }

  return (
    <AnimatePresence onExitComplete={onDismissed}>
      {visible && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close report form"
            onClick={isSubmitting ? undefined : onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/72 backdrop-blur-[3px]"
          />

          <motion.div
            // The success state is a confirmation, not a form — see the note in
            // the component doc comment.
            role={isSuccess ? 'status' : 'dialog'}
            aria-modal={isSuccess ? undefined : true}
            aria-live={isSuccess ? 'polite' : undefined}
            aria-labelledby={isSuccess ? undefined : `${textareaId}-title`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 34 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
            transition={sheetTransition}
            className="relative max-h-[92svh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-ink-2 shadow-[0_-8px_60px_-12px_rgb(0_0_0/0.9)] sm:max-w-lg sm:rounded-2xl sm:shadow-[0_24px_70px_-20px_rgb(0_0_0/0.9)]"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isSuccess ? (
                <SuccessPanel key="success" zoneName={zone.name} hasPhoto={!!photo} />
              ) : (
                <motion.form
                  key="form"
                  onSubmit={handleSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0.01 : 0.16 }}
                  className="p-5"
                >
                  <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2
                        id={`${textareaId}-title`}
                        className="font-display text-2xl leading-none text-paper"
                      >
                        Report something here
                      </h2>
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                        Anonymous · no account needed
                      </p>
                    </div>
                    <ZoneStatusBadge status={zone.status} size="sm" />
                  </div>

                  <p className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-ink-3 px-3 py-2">
                    <span className="font-display truncate text-base text-paper">
                      {zone.name}
                    </span>
                  </p>

                  <label
                    htmlFor={textareaId}
                    className="mt-4 block font-mono text-[10px] uppercase tracking-[0.14em] text-faint"
                  >
                    What did you see?
                  </label>
                  <textarea
                    id={textareaId}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    autoFocus
                    maxLength={MAX_DESCRIPTION_LENGTH}
                    placeholder="e.g. Water turned reddish-brown near the shallows this morning, and there were dead shellfish on the sand."
                    className="mt-1.5 w-full resize-y rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-paper placeholder:text-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25"
                  />
                  <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                    <span
                      className={`transition-colors duration-200 ${
                        tooShort ? 'text-faint' : 'text-safe'
                      }`}
                    >
                      {tooShort
                        ? `At least ${MIN_DESCRIPTION_LENGTH} characters`
                        : 'Looks good'}
                    </span>
                    <span className="tabular-nums text-faint">
                      {characterCount}/{MAX_DESCRIPTION_LENGTH}
                    </span>
                  </div>

                  <div className="mt-4">
                    <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                      Photo{' '}
                      <span className="normal-case tracking-normal text-faint/70">
                        (optional)
                      </span>
                    </span>

                    {previewUrl ? (
                      <div className="mt-2 flex items-center gap-3 rounded-xl border border-line p-2">
                        <img
                          src={previewUrl}
                          alt="Selected report attachment"
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-paper/85">
                            {photo?.name}
                          </p>
                          <p className="font-mono text-[10px] text-faint">
                            {photo ? formatBytes(photo.size) : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (previewUrl) URL.revokeObjectURL(previewUrl)
                              setPhoto(null)
                              setPreviewUrl(null)
                              if (fileInputRef.current) fileInputRef.current.value = ''
                            }}
                            className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-advisory hover:underline"
                          >
                            Remove photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-ink px-3 py-4 text-sm font-medium text-muted transition-colors duration-200 hover:border-accent/50 hover:text-accent">
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.5 8.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-3.5 8 4.5-5 3 3 2-2 4.5 4H3Z"
                          />
                          <rect x="1.75" y="2.75" width="16.5" height="14.5" rx="2.5" />
                        </svg>
                        Take or choose a photo
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </label>
                    )}
                  </div>

                  {(localError || formError) && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-advisory/30 bg-advisory/10 px-3 py-2 text-xs font-medium text-advisory"
                    >
                      {localError ?? formError}
                    </p>
                  )}

                  <div className="mt-5 flex gap-2">
                    <motion.button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmitting}
                      whileTap={reduceMotion ? undefined : { scale: 0.975 }}
                      className="flex-1 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-paper/80 transition-colors duration-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      Cancel
                    </motion.button>

                    <motion.button
                      type="submit"
                      disabled={tooShort || isSubmitting}
                      whileTap={
                        reduceMotion || tooShort || isSubmitting
                          ? undefined
                          : { scale: 0.975 }
                      }
                      className={`relative flex-[1.4] overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
                        tooShort
                          ? 'cursor-not-allowed bg-line text-faint'
                          : 'bg-accent text-ink hover:bg-accent/90'
                      }`}
                    >
                      {/* Indeterminate sweep while the photo uploads and the
                          write lands — feedback that survives a slow network. */}
                      {isSubmitting && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
                        >
                          <span className="animate-sheen block h-full w-full bg-ink/40" />
                        </span>
                      )}
                      <span className="flex items-center justify-center gap-2">
                        {isSubmitting && (
                          <Spinner className="h-3.5 w-3.5 text-ink/70" />
                        )}
                        {isSubmitting ? 'Sending…' : 'Submit report'}
                      </span>
                    </motion.button>
                  </div>

                  <p className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
                    Reports are reviewed by an admin before they change a zone's
                    status. This app does not replace an official BFAR advisory.
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/**
 * Success confirmation.
 *
 * Not a toast: the toast pattern tells the user nothing about *what* happened
 * once it disappears. This holds for ~1.6s with the zone named, so the person
 * who filed the report gets a clear end to the interaction before the sheet
 * closes itself.
 */
function SuccessPanel({
  zoneName,
  hasPhoto,
}: {
  zoneName: string
  hasPhoto: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative grid h-16 w-16 place-items-center">
        {/* Expanding ring, then the tick draws itself. */}
        <motion.span
          className="absolute inset-0 rounded-full border border-safe/40"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1.15, opacity: [0, 0.9, 0] }}
          transition={{ duration: reduceMotion ? 0.01 : 1.1, ease: 'easeOut' }}
          aria-hidden="true"
        />
        <motion.span
          className="grid h-16 w-16 place-items-center rounded-full bg-safe/12 ring-1 ring-inset ring-safe/30"
          initial={{ scale: reduceMotion ? 1 : 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            reduceMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 460, damping: 22 }
          }
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-safe"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <motion.path
              d="M4 12.5 9.5 18 20 6.5"
              initial={{ pathLength: reduceMotion ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: reduceMotion ? 0.01 : 0.42,
                delay: reduceMotion ? 0 : 0.14,
                ease: 'easeOut',
              }}
            />
          </svg>
        </motion.span>
      </div>

      <motion.h2
        className="font-display mt-5 text-3xl leading-none text-paper"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.3 }}
      >
        Salamat!
      </motion.h2>

      <motion.p
        className="mt-2 max-w-xs text-sm leading-relaxed text-muted"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.2, duration: 0.3 }}
      >
        Your report for <span className="text-paper/90">{zoneName}</span> was sent
        for review.
        {hasPhoto && ' The photo came through with it.'}
      </motion.p>

      <motion.p
        className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-faint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.34, duration: 0.3 }}
      >
        An admin will review it shortly
      </motion.p>
    </div>
  )
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
