import { describe, expect, it } from 'vitest'
import {
  advisoryShare,
  dominantZoneStatus,
  formatPercent,
  sidePanelReadout,
  tideBaselinePath,
  tideWavePath,
  zoneSummaryLine,
  zoneTag,
} from './readouts'

describe('zoneSummaryLine', () => {
  it('matches the briefed peek copy', () => {
    expect(zoneSummaryLine(6, 0)).toBe('6 zones · No advisories')
  })

  it('reports advisories in the same line rather than a second one', () => {
    expect(zoneSummaryLine(6, 1)).toBe('6 zones · 1 under advisory')
    expect(zoneSummaryLine(6, 3)).toBe('6 zones · 3 under advisory')
  })

  it('handles the single-zone and empty cases without bad grammar', () => {
    expect(zoneSummaryLine(1, 0)).toBe('1 zone · No advisories')
    expect(zoneSummaryLine(0, 0)).toBe('0 zones · No advisories')
  })

  it('never says both "no advisories" and a count', () => {
    expect(zoneSummaryLine(6, 1)).not.toContain('No advisories')
  })
})

describe('sidePanelReadout', () => {
  it('numbers the two drawer states against the total — the sheet language adapted', () => {
    expect(sidePanelReadout('collapsed')).toBe('01 / 02')
    expect(sidePanelReadout('open')).toBe('02 / 02')
  })
})

describe('dominantZoneStatus', () => {
  it('ranks advisory above unconfirmed above safe', () => {
    expect(dominantZoneStatus({ safe: 6, unconfirmed: 0, advisory: 0 })).toBe('safe')
    expect(dominantZoneStatus({ safe: 5, unconfirmed: 1, advisory: 0 })).toBe('unconfirmed')
    expect(dominantZoneStatus({ safe: 5, unconfirmed: 1, advisory: 1 })).toBe('advisory')
  })

  it('defaults to safe when the feed has not arrived', () => {
    expect(dominantZoneStatus({})).toBe('safe')
  })
})

describe('advisoryShare', () => {
  it('is the fraction of zones under advisory', () => {
    expect(advisoryShare(0, 6)).toBe(0)
    expect(advisoryShare(3, 6)).toBe(0.5)
    expect(advisoryShare(6, 6)).toBe(1)
  })

  it('never divides by zero and never exceeds 1', () => {
    expect(advisoryShare(2, 0)).toBe(0)
    expect(advisoryShare(9, 6)).toBe(1)
  })
})

describe('formatPercent', () => {
  it('formats a share as whole percent', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1 / 3)).toBe('33%')
    expect(formatPercent(1)).toBe('100%')
  })

  it('clamps and survives bad input', () => {
    expect(formatPercent(-2)).toBe('0%')
    expect(formatPercent(4)).toBe('100%')
    expect(formatPercent(Number.NaN)).toBe('0%')
  })
})

describe('zoneTag', () => {
  it('renders the document id in the UI register', () => {
    expect(zoneTag('honda-inner')).toBe('HONDA-INNER')
  })
})

describe('tide wave path', () => {
  it('collapses to a flat trace when nothing is flagged', () => {
    const flat = tideWavePath({ scale: 0 })
    expect(flat).toContain('M 0 9.00')
    // Zero amplitude: every curve command is a straight run.
    const peaks = [...flat.matchAll(/q [\d.]+ (-?[\d.]+)/g)].map((match) =>
      Number(match[1]),
    )
    expect(peaks.length).toBeGreaterThan(0)
    expect(peaks.every((peak) => peak === 0)).toBe(true)
  })

  it('grows with the advisory share', () => {
    const amplitude = (path: string) => Number(path.match(/-([\d.]+)/)?.[1] ?? 0)
    expect(amplitude(tideWavePath({ scale: 1 }))).toBeGreaterThan(
      amplitude(tideWavePath({ scale: 0.5 })),
    )
  })

  it('stays inside the box at full scale', () => {
    const path = tideWavePath({ height: 18, amplitude: 6, scale: 1 })
    expect(path).toContain('-6.00')
    expect(path).not.toContain('-12')
  })

  it('tolerates out-of-range scales', () => {
    expect(tideWavePath({ scale: -1 })).toBe(tideWavePath({ scale: 0 }))
    expect(tideWavePath({ scale: 3 })).toBe(tideWavePath({ scale: 1 }))
    expect(tideWavePath({ scale: Number.NaN })).toBe(tideWavePath({ scale: 0 }))
  })

  it('draws a baseline across the full width', () => {
    expect(tideBaselinePath({ width: 120, height: 18 })).toBe('M 0 9.00 L 120 9.00')
  })
})
