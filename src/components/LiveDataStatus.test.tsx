// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveDataStatus } from './LiveDataStatus'
import { useAppStore } from '../store'
import type { Report, Zone } from '../types'

const zones: Zone[] = [
  { id: 'a', name: 'City Bay', description: '', polygon: [], status: 'safe', lastUpdated: 1 },
  { id: 'b', name: 'Honda Bay', description: '', polygon: [], status: 'advisory', lastUpdated: 1 },
]
const report: Report = { id: 'r1', zoneId: 'a', description: 'Red water', photoUrl: null, submittedAt: 1, status: 'pending' }
const region = () => screen.getByRole('status', { name: 'Live coastal data' })
const settle = () => act(() => { vi.advanceTimersByTime(250) })

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState({ zones, reports: [report], zonesReady: true, reportsReady: true })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('LiveDataStatus', () => {
  it('mounts an empty persistent, polite and atomic region before publishing ready data', () => {
    render(<LiveDataStatus />)
    const node = region()
    expect(node.textContent).toBe('')
    expect(node.getAttribute('aria-live')).toBe('polite')
    expect(node.getAttribute('aria-atomic')).toBe('true')
    settle()
    expect(region()).toBe(node)
    expect(node.textContent).toBe('2 zones watched. 1 under advisory. 0 unconfirmed. 1 safe. 1 pending reports. Advisory signal 50%.')
  })

  it('announces ready zone data without waiting for reports or announcing placeholder zeroes', () => {
    useAppStore.setState({ zonesReady: false, reportsReady: false })
    render(<LiveDataStatus />)
    settle()
    expect(region().textContent).toBe('')
    act(() => useAppStore.setState({ zonesReady: true }))
    settle()
    expect(region().textContent).toContain('1 under advisory')
    expect(region().textContent).toContain('Report data loading.')
    expect(region().textContent).not.toContain('pending reports')
    act(() => useAppStore.setState({ reportsReady: true }))
    settle()
    expect(region().textContent).toContain('1 pending reports')
  })

  it('coalesces report and zone updates, with contextual per-zone and zero-count text', () => {
    render(<LiveDataStatus />)
    settle()
    act(() => useAppStore.setState({ reports: [{ ...report, status: 'confirmed' }] }))
    act(() => vi.advanceTimersByTime(100))
    expect(region().textContent).toContain('1 pending reports')
    act(() => useAppStore.setState({ zones: zones.map((z) => ({ ...z, status: 'advisory' })) }))
    settle()
    expect(region().textContent).toContain('2 under advisory')
    expect(region().textContent).toContain('0 pending reports')
    expect(region().textContent).toContain('City Bay: Advisory. 0 pending reports.')
  })

  it('announces zone changes even when all aggregate totals stay the same', () => {
    render(<LiveDataStatus />)
    settle()
    act(() => useAppStore.setState({ zones: [{ ...zones[0], status: 'advisory' }, { ...zones[1], status: 'safe' }] }))
    settle()
    expect(region().textContent).toContain('1 under advisory')
    expect(region().textContent).toContain('City Bay: Advisory. 1 pending reports.')
    expect(region().textContent).toContain('Honda Bay: Safe. 0 pending reports.')
  })

  it('announces an unconfirmed count and per-zone pending redistribution', () => {
    render(<LiveDataStatus />)
    settle()
    act(() => useAppStore.setState({ zones: [{ ...zones[0], status: 'unconfirmed' }, zones[1]], reports: [{ ...report, zoneId: 'b' }] }))
    settle()
    expect(region().textContent).toContain('1 unconfirmed')
    expect(region().textContent).toContain('City Bay: Unconfirmed. 0 pending reports.')
    expect(region().textContent).toContain('Honda Bay: Advisory. 1 pending reports.')
  })

  it('announces removals and the transition to no zones', () => {
    render(<LiveDataStatus />)
    settle()
    act(() => useAppStore.setState({ zones: [], reports: [] }))
    settle()
    expect(region().textContent).toContain('0 zones watched. 0 under advisory.')
    expect(region().textContent).toContain('Zone removed from watch: City Bay.')
  })

  it('does not repeat an announcement for timestamp or description-only changes', () => {
    render(<LiveDataStatus />)
    settle()
    act(() => useAppStore.setState({ reports: [] }))
    settle()
    const message = region().textContent
    act(() => useAppStore.setState({ zones: zones.map((z) => ({ ...z, lastUpdated: 999, description: 'Updated copy' })) }))
    settle()
    expect(region().textContent).toBe(message)
  })

  it('includes total and reviewed counts in the admin channel only', () => {
    render(<LiveDataStatus admin />)
    settle()
    expect(region().textContent).toContain('1 total reports. 0 reviewed reports.')
    act(() => useAppStore.setState({ reports: [{ ...report, status: 'rejected' }] }))
    settle()
    expect(region().textContent).toContain('1 total reports. 1 reviewed reports.')
  })

  it('cleans up a pending announcement on unmount', () => {
    const { unmount } = render(<LiveDataStatus />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
