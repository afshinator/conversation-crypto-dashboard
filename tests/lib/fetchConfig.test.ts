/**
 * tests/lib/fetchConfig.test.ts
 *
 * Tests for lib/fetchConfig.ts. That file is the single source of truth for:
 * - Which endpoints the app fetches (FETCH_SOURCES)
 * - How long to pause between requests to the same host (PAUSE_MS_BETWEEN_SAME_VENDOR)
 * - A pure helper getHostnameFromUrl used by the fetch pipeline for same-vendor pause logic
 *
 * We test:
 * - The pause constant exists and is a usable number
 * - getHostnameFromUrl correctly parses hostnames from various URL shapes (including URLs not in the config)
 * - FETCH_SOURCES is a valid array of { key, url } with parseable URLs
 *
 * We do not assert list length or order so the config can grow or shrink without breaking tests.
 */

import { describe, it, expect } from 'vitest'
import {
  PAUSE_MS_BETWEEN_SAME_VENDOR,
  FETCH_SOURCES,
  getHostnameFromUrl,
} from '../../lib/fetchConfig'

describe('fetchConfig', () => {
  describe('PAUSE_MS_BETWEEN_SAME_VENDOR', () => {
    it('exists', () => {
      expect(PAUSE_MS_BETWEEN_SAME_VENDOR).toBeDefined()
    })

    it('is a number usable as a delay', () => {
      expect(typeof PAUSE_MS_BETWEEN_SAME_VENDOR).toBe('number')
      expect(Number.isFinite(PAUSE_MS_BETWEEN_SAME_VENDOR)).toBe(true)
    })
  })

  describe('getHostnameFromUrl', () => {
    it('exists and is a function', () => {
      expect(typeof getHostnameFromUrl).toBe('function')
    })

    it('returns hostname for URL with path (not in config)', () => {
      expect(
        getHostnameFromUrl('https://tradingeconomics.com/united-states/central-bank-balance-sheet')
      ).toBe('tradingeconomics.com')
    })

    it('returns hostname for URL with multiple path segments (not in config)', () => {
      expect(
        getHostnameFromUrl('https://frontendmasters.com/courses/ai-agents-v2/')
      ).toBe('frontendmasters.com')
    })

    it('returns hostname for URL with path and query', () => {
      expect(
        getHostnameFromUrl('https://example.com/path?q=1&foo=bar')
      ).toBe('example.com')
    })
  })

  describe('FETCH_SOURCES', () => {
    it('exists and is an array', () => {
      expect(FETCH_SOURCES).toBeDefined()
      expect(Array.isArray(FETCH_SOURCES)).toBe(true)
    })

    it('each entry has key and url', () => {
      for (const entry of FETCH_SOURCES) {
        expect(entry).toHaveProperty('key')
        expect(entry).toHaveProperty('url')
        expect(typeof entry.key).toBe('string')
        expect(typeof entry.url).toBe('string')
      }
    })

    it('each url is valid (parseable)', () => {
      for (const entry of FETCH_SOURCES) {
        expect(() => new URL(entry.url)).not.toThrow()
      }
    })
  })
})
