import { describe, expect, it } from 'vitest'
import { INTRO_GLIDE_SECONDS, INTRO_GLIDE_WIDE_ZOOM, polygonCentroid } from './pins'

describe('polygonCentroid', () => {
  it('finds the centre of a square', () => {
    const c = polygonCentroid([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ])
    expect(c[0]).toBeCloseTo(1, 6)
    expect(c[1]).toBeCloseTo(1, 6)
  })

  it('matches the vertex mean for a triangle', () => {
    const c = polygonCentroid([
      [0, 0],
      [3, 0],
      [0, 3],
    ])
    expect(c[0]).toBeCloseTo(1, 6)
    expect(c[1]).toBeCloseTo(1, 6)
  })

  it('falls back to the vertex mean for zero-area polygons', () => {
    const c = polygonCentroid([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    expect(c[0]).toBeCloseTo(2, 6)
    expect(c[1]).toBeCloseTo(2, 6)
  })

  it('never divides by zero on an empty polygon', () => {
    expect(polygonCentroid([])).toEqual([0, 0])
  })
})

describe('intro glide constants', () => {
  it('starts wide and lands on the default zoom over a readable glide', () => {
    expect(INTRO_GLIDE_WIDE_ZOOM).toBeLessThan(11)
    expect(INTRO_GLIDE_SECONDS).toBeGreaterThanOrEqual(2)
    expect(INTRO_GLIDE_SECONDS).toBeLessThanOrEqual(4)
  })
})
