import type { ReportStatus, ZoneStatus } from '../types'
import { reportStatusMeta, zoneStatusMeta } from '../lib/status'

type BadgeSize = 'sm' | 'md'

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}

function Badge({
  label,
  hex,
  softClass,
  size,
}: {
  label: string
  hex: string
  softClass: string
  size: BadgeSize
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${SIZE_CLASS[size]} ${softClass}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

export function ZoneStatusBadge({
  status,
  size = 'md',
}: {
  status: ZoneStatus
  size?: BadgeSize
}) {
  const meta = zoneStatusMeta(status)
  return <Badge label={meta.label} hex={meta.hex} softClass={meta.softClass} size={size} />
}

export function ReportStatusBadge({
  status,
  size = 'md',
}: {
  status: ReportStatus
  size?: BadgeSize
}) {
  const meta = reportStatusMeta(status)
  return <Badge label={meta.label} hex={meta.hex} softClass={meta.softClass} size={size} />
}
