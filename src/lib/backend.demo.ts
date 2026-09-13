import type {
  NewReport,
  Report,
  ReportStatus,
  Zone,
  ZoneStatus,
} from '../types'
import type { Backend } from './backend'
import { SEED_ZONES } from '../data/zones'
import { fileToCompressedDataUrl, MAX_PHOTO_BYTES } from './image'

/**
 * Offline demo backend: same contract as the Firebase one, but keeps everything
 * in memory and mirrors it to localStorage so a page refresh survives.
 *
 * Used automatically when no Firebase keys are configured, or on demand via
 * `VITE_USE_DEMO_BACKEND=true`. It exists so that `npm run dev` always produces
 * a working, demoable app — including with no network and no Firebase project.
 */

const STORAGE_KEY = 'red-tide-ppc:demo:v1'

type Listener = () => void

interface DemoData {
  zones: Zone[]
  reports: Report[]
}

function freshData(): DemoData {
  const now = Date.now()
  return {
    zones: SEED_ZONES.map((zone) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      polygon: [...zone.polygon],
      status: zone.status,
      lastUpdated: now,
    })),
    reports: [],
  }
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

function readStorage(): DemoData | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoData>
    if (!Array.isArray(parsed.zones) || !Array.isArray(parsed.reports)) {
      return null
    }
    return { zones: parsed.zones, reports: parsed.reports }
  } catch {
    return null
  }
}

function writeStorage(data: DemoData): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage unavailable (private mode / node) — memory-only is fine.
  }
}

export function clearDemoData(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function createDemoBackend(): Backend {
  let data: DemoData = readStorage() ?? freshData()
  const zoneListeners = new Set<Listener>()
  const reportListeners = new Set<Listener>()

  function persist(): void {
    writeStorage(data)
  }

  function emit(listeners: Set<Listener>): void {
    for (const listener of listeners) listener()
  }

  function emitZones(): void {
    persist()
    emit(zoneListeners)
  }

  function emitReports(): void {
    persist()
    emit(reportListeners)
  }

  return {
    kind: 'demo',

    subscribeToZones(onChange) {
      const listener: Listener = () => onChange(clone(data.zones))
      zoneListeners.add(listener)
      listener()
      return () => {
        zoneListeners.delete(listener)
      }
    },

    subscribeToReports(onChange) {
      const listener: Listener = () => onChange(clone(data.reports))
      reportListeners.add(listener)
      listener()
      return () => {
        reportListeners.delete(listener)
      }
    },

    async addReport(input: NewReport): Promise<Report> {
      const report: Report = {
        id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        zoneId: input.zoneId,
        description: input.description,
        photoUrl: input.photoUrl,
        submittedAt: Date.now(),
        status: 'pending',
      }
      data = { ...data, reports: [report, ...data.reports] }
      emitReports()
      return clone(report)
    },

    async uploadReportPhoto(file: File): Promise<string> {
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error('Photo is larger than 5 MB. Please pick a smaller image.')
      }
      return fileToCompressedDataUrl(file)
    },

    async setReportStatus(reportId: string, status: ReportStatus): Promise<void> {
      const found = data.reports.some((report) => report.id === reportId)
      if (!found) throw new Error(`No report with id "${reportId}".`)
      data = {
        ...data,
        reports: data.reports.map((report) =>
          report.id === reportId ? { ...report, status } : report,
        ),
      }
      emitReports()
    },

    async setZoneStatus(zoneId: string, status: ZoneStatus): Promise<void> {
      const found = data.zones.some((zone) => zone.id === zoneId)
      if (!found) throw new Error(`No zone with id "${zoneId}".`)
      data = {
        ...data,
        zones: data.zones.map((zone) =>
          zone.id === zoneId
            ? { ...zone, status, lastUpdated: Date.now() }
            : zone,
        ),
      }
      emitZones()
    },
  }
}
