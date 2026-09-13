import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDemoData, createDemoBackend } from './lib/backend.demo'
import { setBackendForTesting } from './lib/backend'
import { SEED_ZONES } from './data/zones'
import {
  MIN_DESCRIPTION_LENGTH,
  selectPendingCountByZone,
  selectPendingReports,
  useAppStore,
  zoneNameFor,
} from './store'
import type { ZoneStatus } from './types'

/**
 * These run the real store against the real demo backend (in-memory), so they
 * exercise the same code path the browser uses — subscribe → submit → approve
 * → reject — with no Firestore required.
 */

const HONDA_INNER = 'honda-inner'

function resetStore(): void {
  useAppStore.setState({
    zones: [],
    reports: [],
    zonesReady: false,
    reportsReady: false,
    error: null,
    formError: null,
    notice: null,
    submitting: false,
    busyReportId: null,
    busyZoneId: null,
    selectedZoneId: null,
    reportZoneId: null,
    adminUnlocked: false,
  })
}

/** Initialise the store against a brand-new demo backend. */
function startApp(): () => void {
  setBackendForTesting(createDemoBackend())
  resetStore()
  return useAppStore.getState().init()
}

beforeEach(() => {
  clearDemoData()
})

afterEach(() => {
  vi.unstubAllEnvs()
  setBackendForTesting(null)
})

describe('subscribeToZones', () => {
  it('loads every seeded zone, sorted by name, all starting safe', () => {
    const unsubscribe = startApp()

    const { zones, zonesReady } = useAppStore.getState()
    expect(zonesReady).toBe(true)
    expect(zones).toHaveLength(SEED_ZONES.length)
    expect(zones.every((zone) => zone.status === 'safe')).toBe(true)

    const names = zones.map((zone) => zone.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))

    unsubscribe()
  })

  it('reports the demo backend when Firebase is not configured', () => {
    startApp()
    expect(useAppStore.getState().backendKind).toBe('demo')
  })
})

describe('submitReport', () => {
  it('writes a pending report against the chosen zone', async () => {
    startApp()

    await useAppStore.getState().submitReport({
      zoneId: HONDA_INNER,
      description: 'Water looks rusty red near Cowrie this morning, dead fish too.',
      photo: null,
    })

    const { reports, reportZoneId, notice } = useAppStore.getState()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      zoneId: HONDA_INNER,
      status: 'pending',
      photoUrl: null,
    })
    expect(reports[0].submittedAt).toBeGreaterThan(0)
    expect(reportZoneId).toBeNull() // form closed itself on success
    expect(notice).toContain('Honda Bay — Inner Islands')
  })

  it('refuses a description that is too short and writes nothing', async () => {
    startApp()
    const tooShort = 'x'.repeat(MIN_DESCRIPTION_LENGTH - 1)

    await expect(
      useAppStore.getState().submitReport({
        zoneId: HONDA_INNER,
        description: tooShort,
        photo: null,
      }),
    ).rejects.toThrow()

    expect(useAppStore.getState().reports).toHaveLength(0)
    expect(useAppStore.getState().formError).toContain('at least')
  })

  it('refuses an unknown zone', async () => {
    startApp()

    await expect(
      useAppStore.getState().submitReport({
        zoneId: 'not-a-zone',
        description: 'A perfectly long enough description.',
        photo: null,
      }),
    ).rejects.toThrow()

    expect(useAppStore.getState().reports).toHaveLength(0)
  })
})

describe('approveReport', () => {
  it('confirms the report and flips its zone to advisory', async () => {
    startApp()
    await useAppStore.getState().submitReport({
      zoneId: HONDA_INNER,
      description: 'Reddish water and dead shellfish along the shallows.',
      photo: null,
    })

    const report = useAppStore.getState().reports[0]
    const before = useAppStore
      .getState()
      .zones.find((zone) => zone.id === HONDA_INNER)!.lastUpdated

    await useAppStore.getState().approveReport(report.id)

    const state = useAppStore.getState()
    const zone = state.zones.find((z) => z.id === HONDA_INNER)!

    expect(state.reports[0].status).toBe('confirmed')
    expect(zone.status).toBe('advisory')
    expect(zone.lastUpdated).toBeGreaterThanOrEqual(before)
    expect(state.busyReportId).toBeNull()
    expect(state.notice).toContain('under advisory')
    expect(selectPendingReports(state.reports)).toHaveLength(0)
  })
})

describe('rejectReport', () => {
  it('rejects the report and leaves the zone untouched', async () => {
    startApp()
    await useAppStore.getState().submitReport({
      zoneId: HONDA_INNER,
      description: 'Saw some discoloured water while passing through.',
      photo: null,
    })

    const report = useAppStore.getState().reports[0]
    await useAppStore.getState().rejectReport(report.id)

    const state = useAppStore.getState()
    expect(state.reports[0].status).toBe('rejected')
    expect(state.zones.find((z) => z.id === HONDA_INNER)!.status).toBe('safe')
  })
})

describe('manual zone status control (no auto-expiry)', () => {
  it('lets an admin revert an advisory zone back to safe', async () => {
    startApp()

    await useAppStore.getState().setZoneStatus(HONDA_INNER, 'advisory')
    expect(
      useAppStore.getState().zones.find((z) => z.id === HONDA_INNER)!.status,
    ).toBe<ZoneStatus>('advisory')

    await useAppStore.getState().setZoneStatus(HONDA_INNER, 'safe')
    expect(
      useAppStore.getState().zones.find((z) => z.id === HONDA_INNER)!.status,
    ).toBe<ZoneStatus>('safe')
  })

  it('can flag a zone unconfirmed without touching any report', async () => {
    startApp()
    await useAppStore.getState().setZoneStatus('pp-bay', 'unconfirmed')

    const state = useAppStore.getState()
    expect(state.zones.find((z) => z.id === 'pp-bay')!.status).toBe('unconfirmed')
    expect(state.reports).toHaveLength(0)
  })
})

describe('selectors', () => {
  it('counts only pending reports per zone', async () => {
    startApp()
    const submit = useAppStore.getState().submitReport

    await submit({
      zoneId: HONDA_INNER,
      description: 'First report for the inner islands today.',
      photo: null,
    })
    await submit({
      zoneId: HONDA_INNER,
      description: 'Second report for the inner islands today.',
      photo: null,
    })
    await submit({
      zoneId: 'pp-bay',
      description: 'One report down by the city port area.',
      photo: null,
    })

    const [first] = useAppStore.getState().reports.filter(
      (r) => r.zoneId === HONDA_INNER,
    )
    await useAppStore.getState().rejectReport(first.id)

    const counts = selectPendingCountByZone(useAppStore.getState().reports)
    expect(counts[HONDA_INNER]).toBe(1)
    expect(counts['pp-bay']).toBe(1)
    expect(Object.keys(counts)).toHaveLength(2)
  })

  it('resolves a zone name from an id', () => {
    startApp()
    expect(zoneNameFor(useAppStore.getState().zones, HONDA_INNER)).toBe(
      'Honda Bay — Inner Islands',
    )
    expect(zoneNameFor(useAppStore.getState().zones, 'missing')).toBe('That zone')
  })
})

describe('admin passcode gate', () => {
  it('refuses to unlock when no passcode is configured', () => {
    startApp()
    vi.stubEnv('VITE_ADMIN_PASSCODE', '')

    expect(useAppStore.getState().tryUnlockAdmin('anything')).toBe(false)
    expect(useAppStore.getState().adminUnlocked).toBe(false)
    expect(useAppStore.getState().formError).toContain('VITE_ADMIN_PASSCODE')
  })

  it('unlocks only on an exact match', () => {
    startApp()
    vi.stubEnv('VITE_ADMIN_PASSCODE', 's3cret-passcode')

    expect(useAppStore.getState().tryUnlockAdmin('wrong')).toBe(false)
    expect(useAppStore.getState().adminUnlocked).toBe(false)

    expect(useAppStore.getState().tryUnlockAdmin('s3cret-passcode')).toBe(true)
    expect(useAppStore.getState().adminUnlocked).toBe(true)

    useAppStore.getState().lockAdmin()
    expect(useAppStore.getState().adminUnlocked).toBe(false)
  })
})
