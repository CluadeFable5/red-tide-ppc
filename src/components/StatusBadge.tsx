import type { ReportStatus, ZoneStatus } from '../types'
import { reportLabel, reportTheme, zoneLabel, zoneTheme } from '../styles/statusTheme'

type BadgeSize = 'sm' | 'md'

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-[11px]',
}

function Badge({
  label,
  hex,
  pillClass,
  pulses,
  glowClass,
  size,
}: {
  label: string
  hex: string
  pillClass: string
  pulses: boolean
  glowClass: string
  size: BadgeSize
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-mono uppercase tracking-[0.08em] ${SIZE_CLASS[size]} ${pillClass}`}
    >
      {/*
        Status is never carried by colour alone: the dot pulses for
        `unconfirmed`, and the label always spells the state out.
      */}
      <span className="relative grid h-1.5 w-1.5 shrink-0 place-items-center">
        <span
          className={`absolute inset-0 rounded-full ${glowClass}`}
          style={{ backgroundColor: hex }}
          aria-hidden="true"
        />
        {pulses && (
          <span
            className="animate-status-pulse absolute inset-0 rounded-full"
            style={{ backgroundColor: hex }}
            aria-hidden="true"
          />
        )}
      </span>
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
  const theme = zoneTheme(status)
  return (
    <Badge
      label={zoneLabel(status)}
      hex={theme.hex}
      pillClass={theme.pillClass}
      pulses={theme.pulses}
      glowClass={theme.glowClass}
      size={size}
    />
  )
}

export function ReportStatusBadge({
  status,
  size = 'md',
}: {
  status: ReportStatus
  size?: BadgeSize
}) {
  const theme = reportTheme(status)
  return (
    <Badge
      label={reportLabel(status)}
      hex={theme.hex}
      pillClass={theme.pillClass}
      pulses={theme.pulses}
      glowClass={theme.glowClass}
      size={size}
    />
  )
}
