/**
 * Display formatting. Everything is rendered in Philippine Time, since the
 * people reading it are on the water in Palawan.
 */

const TIME_ZONE = 'Asia/Manila'

const absoluteFormatter = new Intl.DateTimeFormat('en-PH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

const dayFormatter = new Intl.DateTimeFormat('en-PH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
]

/** "13 Sep 2026, 4:30 pm" (PHT) */
export function formatDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—'
  return absoluteFormatter.format(new Date(epochMs))
}

/** "13 Sep 2026" (PHT) */
export function formatDay(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—'
  return dayFormatter.format(new Date(epochMs))
}

/** "12 minutes ago" / "yesterday" / "3 days ago" */
export function formatRelative(epochMs: number, now: number = Date.now()): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '—'
  const diff = epochMs - now
  const abs = Math.abs(diff)

  if (abs < 45 * 1000) return 'just now'

  for (const [unit, ms] of STEPS) {
    if (abs >= ms || unit === 'minute') {
      return relativeFormatter.format(Math.round(diff / ms), unit)
    }
  }
  return absoluteFormatter.format(new Date(epochMs))
}

/** 12.4 KB / 3.1 MB — used on the photo picker. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}
