import { describe, expect, it } from 'vitest'
import type { ZoneStatus } from '../types'
import { resolveActiveStatus } from './statusKey'

const counts = (
  advisory: number,
  unconfirmed: number,
  safe: number,
): Record<ZoneStatus, number> => ({ advisory, unconfirmed, safe })

describe('resolveActiveStatus', () => {
  it('the selected zone owns the indicator', () => {
    expect(resolveActiveStatus('safe', counts(2, 1, 4))).toBe('safe')
    expect(resolveActiveStatus('unconfirmed', counts(2, 1, 4))).toBe('unconfirmed')
  })

  it('with no selection, the worst non-zero status wins', () => {
    expect(resolveActiveStatus(null, counts(1, 5, 1))).toBe('advisory')
    expect(resolveActiveStatus(null, counts(0, 2, 5))).toBe('unconfirmed')
  })

  it('an all-clear map rests on safe', () => {
    expect(resolveActiveStatus(null, counts(0, 0, 7))).toBe('safe')
    expect(resolveActiveStatus(null, counts(0, 0, 0))).toBe('safe')
  })

  it('a selection wins even over a worse count', () => {
    expect(resolveActiveStatus('safe', counts(3, 0, 4))).toBe('safe')
  })
})
