import { formatDateTime, formatRelative } from '../lib/format'
import type { Report } from '../types'
import { ReportStatusBadge } from './StatusBadge'

/** One report in the admin review queue. */
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

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          {zoneName}
        </span>
        <ReportStatusBadge status={report.status} size="sm" />
        <span className="ml-auto text-[11px] text-slate-400">
          {formatRelative(report.submittedAt)}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {report.description}
      </p>

      {report.photoUrl && (
        <a
          href={report.photoUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block"
        >
          <img
            src={report.photoUrl}
            alt="Reported conditions attachment"
            loading="lazy"
            className="h-32 w-full rounded-lg border border-slate-200 object-cover sm:h-40"
          />
        </a>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        Submitted {formatDateTime(report.submittedAt)} PHT · id{' '}
        <span className="font-mono">{report.id}</span>
      </p>

      {isPending ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="flex-1 rounded-lg bg-advisory px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve → advisory
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[11px] italic text-slate-400">
          Already reviewed — no further action available in the MVP.
        </p>
      )}
    </li>
  )
}
