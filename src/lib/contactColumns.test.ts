import { describe, it, expect } from 'vitest'
import { labelToKey, generateKey } from './contactColumns'

describe('labelToKey', () => {
  it('lowercases, spaces-to-underscores, and strips non-alphanumeric characters', () => {
    expect(labelToKey('Lead Source #2!')).toBe('lead_source_2')
  })

  it('falls back to "field" when nothing alphanumeric survives', () => {
    expect(labelToKey('###')).toBe('field')
  })
})

describe('generateKey', () => {
  it('reuses the base key when it is not already taken', () => {
    expect(generateKey('Lead Source', [])).toBe('lead_source')
  })

  it('appends a numeric suffix, skipping any that are already taken, on collision', () => {
    expect(generateKey('Lead Source', ['lead_source'])).toBe('lead_source_2')
    expect(generateKey('Lead Source', ['lead_source', 'lead_source_2'])).toBe('lead_source_3')
  })
})

