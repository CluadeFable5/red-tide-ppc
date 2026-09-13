import { reportLabel, reportTheme, zoneLabel, zoneTheme } from '../styles/statusTheme'
import type { ReportStatus, ZoneStatus } from '../types'
import { StatusPip } from './StatusPip'

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
  trigger,
}: {
  label: string
  hex: string
  pillClass: string
  pulses: boolean
  glowClass: string
  size: BadgeSize
  /** Changes to this pop the pip — see StatusPip. */
  trigger?: string
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-mono uppercase tracking-[0.08em] ${SIZE_CLASS[size]} ${pillClass}`}
    >
      {/*
        Status is never carried by colour alone: the dot pulses for the
        advisory state, and the label always spells the state out. The pip
        itself pops when the status changes, so a row that changes does not
        change silently.
      */}
      <StatusPip
        size="xs"
        hex={hex}
        pulses={pulses}
        glowClass={glowClass}
        trigger={trigger}
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
  const theme = zoneTheme(status)
  return (
    <Badge
      label={zoneLabel(status)}
      hex={theme.hex}
      pillClass={theme.pillClass}
      pulses={theme.pulses}
      glowClass={theme.glowClass}
      size={size}
      trigger={`zone:${status}`}
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
      trigger={`report:${status}`}
    />
  )
}
