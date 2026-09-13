import { motion, useReducedMotion } from 'motion/react'
import { formatDateTime, formatRelative } from '../lib/format'
import { reportLabel, reportTheme } from '../styles/statusTheme'
import type { Report } from '../types'

/**
 * One report in the admin review queue.
 *
 * Approve deliberately reads as the heavier, more consequential action: it is
 * the one that flips a whole zone to advisory and pushes a public warning, so
 * it gets the solid fill while Reject stays an outline. That asymmetry is the
 * point — on a queue of twenty reports, the destructive-ish choice should not
 * be as easy to hit by accident as the safe one.
 *
 * Both buttons carry hover and press states, and the whole card dims its
 * controls while `busy` so a double-tap cannot fire two writes.
 */
export function ReportCard({
  report,
  zoneName,
  busy,
  onApprove,
  onReject,
}: {
  report: Report
  zoneName: string
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const isPending = report.status === 'pending'
  const theme = reportTheme(report.status)
  const reduceMotion = useReducedMotion()

  return (
    <li
      className={`relative overflow-hidden rounded-xl border bg-ink-2 transition-colors duration-200 ${
        isPending ? 'border-line hover:border-line-soft' : 'border-line/60'
      }`}
    >
      {/* Status hairline, consistent with the zone cards on the public map. */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: isPending ? theme.hex : 'transparent' }}
        aria-hidden="true"
      />

      <div className="p-4 pl-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display rounded-md border border-line bg-ink-3 px-2 py-1 text-sm leading-none text-paper">
            {zoneName}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${theme.pillClass}`}
          >
            <span
              className="relative grid h-1.5 w-1.5 shrink-0 place-items-center"
              aria-hidden="true"
            >
              <span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: theme.hex }}
              />
              {isPending && (
                <span
                  className="animate-status-pulse absolute inset-0 rounded-full"
                  style={{ backgroundColor: theme.hex }}
                />
              )}
            </span>
            {reportLabel(report.status)}
          </span>
          <span className="ml-auto font-mono text-[10px] text-faint">
            {formatRelative(report.submittedAt)}
          </span>
        </div>

        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-paper/85">
          {report.description}
        </p>

        {report.photoUrl && (
          <a
            href={report.photoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="group mt-3 block overflow-hidden rounded-lg border border-line"
          >
            <img
              src={report.photoUrl}
              alt="Reported conditions attachment"
              loading="lazy"
              className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-40"
            />
          </a>
        )}

        <p className="mt-3 font-mono text-[10px] text-faint">
          Submitted {formatDateTime(report.submittedAt)} PHT · id{' '}
          <span className="text-faint/80">{report.id}</span>
        </p>

        {isPending ? (
          <div className="mt-3.5 flex gap-2">
            <motion.button
              type="button"
              onClick={onApprove}
              disabled={busy}
              whileTap={reduceMotion || busy ? undefined : { scale: 0.975 }}
              className="group relative flex-1 overflow-hidden rounded-lg bg-advisory px-3 py-2.5 text-sm font-semibold text-ink transition-[filter,transform] duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {/* Sweep on hover: a small, cheap tell that the control is live. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-500 group-hover:translate-x-full"
              />
              <span className="relative">Approve → advisory</span>
            </motion.button>

            <motion.button
              type="button"
              onClick={onReject}
              disabled={busy}
              whileTap={reduceMotion || busy ? undefined : { scale: 0.975 }}
              className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm font-semibold text-paper/80 transition-colors duration-200 hover:border-line-soft hover:bg-white/5 hover:text-paper disabled:cursor-not-allowed disabled:opacity-45"
            >
              Reject
            </motion.button>
          </div>
        ) : (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
            Already reviewed — no further action in the MVP
          </p>
        )}
      </div>
    </li>
  )
}
