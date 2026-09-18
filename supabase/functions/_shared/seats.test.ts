import { describe, it, expect } from 'vitest'
import { computeSeatCount, isAddingSeat } from './seats'

describe('computeSeatCount', () => {
  it('never bills below 1 seat, even with 0 or missing active members', () => {
    expect(computeSeatCount(0)).toBe(1)
    expect(computeSeatCount(null)).toBe(1)
    expect(computeSeatCount(undefined)).toBe(1)
  })

  it('passes through the active member count above the floor', () => {
    expect(computeSeatCount(4)).toBe(4)
  })
})

describe('isAddingSeat', () => {
  it('is true only when a specific member is being activated and it grows the quantity', () => {
    expect(isAddingSeat(2, 3, 'member-1')).toBe(true)
  })

  it('is false for a routine quantity sync with no member being activated', () => {
    expect(isAddingSeat(2, 3, undefined)).toBe(false)
  })

  it('is false when the seat count did not actually grow (e.g. a member was removed)', () => {
    expect(isAddingSeat(3, 2, 'member-1')).toBe(false)
  })
})
