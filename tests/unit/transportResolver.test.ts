import { describe, expect, it } from 'vitest'
const { TRANSPORTS, resolveActiveTransport, getAvailableTransports } = require('../../electron/scraper/transportResolver.cjs')

describe('TransportResolver', () => {
  it('resolves BROWSER_COMPANION when companion is available', () => {
    const mockCompanion = { isAvailable: () => true }
    expect(resolveActiveTransport({ companionTransport: mockCompanion })).toBe(TRANSPORTS.BROWSER_COMPANION)
  })

  it('falls back to PLAYWRIGHT when companion is not available', () => {
    const mockCompanion = { isAvailable: () => false }
    expect(resolveActiveTransport({ companionTransport: mockCompanion })).toBe(TRANSPORTS.PLAYWRIGHT)
    expect(resolveActiveTransport({ companionTransport: null })).toBe(TRANSPORTS.PLAYWRIGHT)
  })

  it('honors preferred transport if specified and available', () => {
    const mockCompanion = { isAvailable: () => true }
    expect(resolveActiveTransport({ companionTransport: mockCompanion, preferredTransport: TRANSPORTS.PLAYWRIGHT })).toBe(TRANSPORTS.PLAYWRIGHT)
    expect(resolveActiveTransport({ companionTransport: mockCompanion, preferredTransport: TRANSPORTS.MANUAL_IMPORT })).toBe(TRANSPORTS.MANUAL_IMPORT)
    expect(resolveActiveTransport({ companionTransport: mockCompanion, preferredTransport: TRANSPORTS.BROWSER_COMPANION })).toBe(TRANSPORTS.BROWSER_COMPANION)
  })

  it('falls back to priority when preferred companion is unavailable', () => {
    const mockCompanion = { isAvailable: () => false }
    expect(resolveActiveTransport({ companionTransport: mockCompanion, preferredTransport: TRANSPORTS.BROWSER_COMPANION })).toBe(TRANSPORTS.PLAYWRIGHT)
  })

  it('returns available transports list with primary flag', () => {
    const connectedCompanion = { isAvailable: () => true }
    const listConnected = getAvailableTransports({ companionTransport: connectedCompanion })
    expect(listConnected.some(t => t.id === TRANSPORTS.BROWSER_COMPANION && t.isPrimary)).toBe(true)

    const disconnectedCompanion = { isAvailable: () => false }
    const listDisconnected = getAvailableTransports({ companionTransport: disconnectedCompanion })
    expect(listDisconnected.some(t => t.id === TRANSPORTS.BROWSER_COMPANION)).toBe(false)
    expect(listDisconnected.some(t => t.id === TRANSPORTS.PLAYWRIGHT)).toBe(true)
    expect(listDisconnected.some(t => t.id === TRANSPORTS.MANUAL_IMPORT)).toBe(true)
    expect(listDisconnected.some(t => t.id === TRANSPORTS.EMBEDDED_ELECTRON)).toBe(false)

    const listWithExperimental = getAvailableTransports({ companionTransport: disconnectedCompanion, includeExperimental: true })
    const embedded = listWithExperimental.find(t => t.id === TRANSPORTS.EMBEDDED_ELECTRON)
    expect(embedded).toBeDefined()
    expect(embedded?.isPrimary).toBe(false)
    expect(embedded?.experimental).toBe(true)
  })

  it('honors EMBEDDED_ELECTRON when specified as preferred transport', () => {
    const mockCompanion = { isAvailable: () => true }
    expect(resolveActiveTransport({ companionTransport: mockCompanion, preferredTransport: TRANSPORTS.EMBEDDED_ELECTRON })).toBe(TRANSPORTS.EMBEDDED_ELECTRON)
  })

  it('resolves EMBEDDED_ELECTRON in AUTOMATIC mode when promoted', () => {
    const mockCompanion = { isAvailable: () => true }
    const mockEmbedded = { isAvailable: () => true }
    expect(resolveActiveTransport({
      companionTransport: mockCompanion,
      embeddedTransport: mockEmbedded,
      preferredTransport: TRANSPORTS.AUTOMATIC,
      promotionPolicy: 'PROMOTED',
    })).toBe(TRANSPORTS.EMBEDDED_ELECTRON)
  })

  it('falls back to BROWSER_COMPANION in AUTOMATIC promoted mode if embedded is unavailable', () => {
    const mockCompanion = { isAvailable: () => true }
    const mockEmbedded = { isAvailable: () => false }
    expect(resolveActiveTransport({
      companionTransport: mockCompanion,
      embeddedTransport: mockEmbedded,
      preferredTransport: TRANSPORTS.AUTOMATIC,
      promotionPolicy: 'PROMOTED',
    })).toBe(TRANSPORTS.BROWSER_COMPANION)
  })

  it('returns Built-in Scraper as primary in getAvailableTransports when promoted', () => {
    const mockCompanion = { isAvailable: () => true }
    const list = getAvailableTransports({ companionTransport: mockCompanion, isPromoted: true })
    const embedded = list.find(t => t.id === TRANSPORTS.EMBEDDED_ELECTRON)
    expect(embedded).toBeDefined()
    expect(embedded?.isPrimary).toBe(true)
    expect(embedded?.name).toBe('Built-in Scraper')

    const companion = list.find(t => t.id === TRANSPORTS.BROWSER_COMPANION)
    expect(companion).toBeDefined()
    expect(companion?.isPrimary).toBe(false)
    expect((companion as any)?.isFallback).toBe(true)
  })
})

