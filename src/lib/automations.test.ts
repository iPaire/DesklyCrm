import { describe, it, expect } from 'vitest'
import { AUTOMATION_DEFS, isEnabled, alreadyRanToday } from './automations'
import type { Automation } from '../types'

describe('AUTOMATION_DEFS', () => {
  it('declares a unique, non-empty type for every automation', () => {
    const types = AUTOMATION_DEFS.map(d => d.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types.every(t => t.length > 0)).toBe(true)
  })
})

describe('isEnabled', () => {
  const automations = [
    { automation_type: 'deal_stale_alert', enabled: true },
    { automation_type: 'task_overdue_alert', enabled: false },
  ] as Automation[]

  it('is true when a matching row is enabled', () => {
    expect(isEnabled(automations, 'deal_stale_alert')).toBe(true)
  })

  it('is false when a matching row is explicitly disabled', () => {
    expect(isEnabled(automations, 'task_overdue_alert')).toBe(false)
  })

  it('defaults to false when no row exists for that automation type', () => {
    expect(isEnabled(automations, 'deal_auto_archive')).toBe(false)
  })
})

describe('alreadyRanToday', () => {
  it('is true once lastRun matches today\'s date string', () => {
    expect(alreadyRanToday('Wed Sep 18 2026', 'Wed Sep 18 2026')).toBe(true)
  })

  it('is false the first time a user is seen today, or if lastRun is unset', () => {
    expect(alreadyRanToday('Tue Sep 17 2026', 'Wed Sep 18 2026')).toBe(false)
    expect(alreadyRanToday(undefined, 'Wed Sep 18 2026')).toBe(false)
  })
})
