import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { formatBytes } from '../lib/format'
import { MAX_PHOTO_BYTES } from '../lib/image'
import {
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  useAppStore,
} from '../store'
import type { Zone } from '../types'
import { ZoneStatusBadge } from './StatusBadge'

/**
 * Anonymous report form. Rendered as a bottom sheet on phones and a centred
 * modal on wider screens.
 *
 * Photo (if any) is uploaded first, then the report is written with the
 * resulting URL — all inside `store.submitReport`.
 */
export function ReportForm({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const submitReport = useAppStore((state) => state.submitReport)
  const submitting = useAppStore((state) => state.submitting)
  const formError = useAppStore((state) => state.formError)

  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaId = useId()
  const characterCount = description.trim().length
  const tooShort = characterCount < MIN_DESCRIPTION_LENGTH

  // Lock background scrolling and close on Escape while the sheet is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

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
    if (tooShort || submitting) return

    try {
      await submitReport({ zoneId: zone.id, description, photo })
      // On success the store clears `reportZoneId` and the parent unmounts us.
    } catch {
      // store.submitReport already recorded the message in `error`.
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${textareaId}-title`}
    >
      <button
        type="button"
        aria-label="Close report form"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/60 backdrop-blur-[2px]"
      />

      <form
        onSubmit={handleSubmit}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${textareaId}-title`} className="text-base font-bold text-slate-900">
              Report something here
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Anonymous · no account needed
            </p>
          </div>
          <ZoneStatusBadge status={zone.status} size="sm" />
        </div>

        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
          {zone.name}
        </p>

        <label
          htmlFor={textareaId}
          className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500"
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
          className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/25"
        />
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className={tooShort ? 'text-slate-400' : 'text-green-700'}>
            {tooShort
              ? `At least ${MIN_DESCRIPTION_LENGTH} characters`
              : 'Looks good'}
          </span>
          <span className="tabular-nums text-slate-400">
            {characterCount}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </div>

        <div className="mt-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Photo <span className="font-normal normal-case text-slate-400">(optional)</span>
          </span>

          {previewUrl ? (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 p-2">
              <img
                src={previewUrl}
                alt="Selected report attachment"
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">{photo?.name}</p>
                <p className="text-[11px] text-slate-400">
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
                  className="mt-1 text-[11px] font-semibold text-red-600 hover:underline"
                >
                  Remove photo
                </button>
              </div>
            </div>
          ) : (
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-medium text-slate-600 transition hover:border-ocean hover:text-ocean">
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
            className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200"
          >
            {localError ?? formError}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={tooShort || submitting}
            className="flex-[1.4] rounded-xl bg-ocean px-4 py-3 text-sm font-semibold text-white transition hover:bg-ocean-soft disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? 'Sending…' : 'Submit report'}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Reports are reviewed by an admin before they change a zone&apos;s
          status. This app does not replace an official BFAR advisory.
        </p>
      </form>
    </div>
  )
}
