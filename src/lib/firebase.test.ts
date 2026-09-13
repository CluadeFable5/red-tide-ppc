import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDemoModeForced, readFirebaseConfig } from './firebase'

/**
 * `readFirebaseConfig` decides whether the app talks to Firestore or falls back
 * to the demo backend, so a half-filled `.env` has to be detected rather than
 * half-initialised.
 */

const FULL: Record<string, string> = {
  VITE_FIREBASE_API_KEY: 'AIzaSyTestKey-1234567890',
  VITE_FIREBASE_AUTH_DOMAIN: 'red-tide.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'red-tide',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:abc123',
}

/** The exact placeholder strings shipped in `.env.example`. */
const PLACEHOLDER: Record<string, string> = {
  VITE_FIREBASE_API_KEY: 'AIza...',
  VITE_FIREBASE_AUTH_DOMAIN: 'your-project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'your-project',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
}

function stubAll(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

beforeEach(() => {
  stubAll(FULL)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readFirebaseConfig', () => {
  it('returns the config when every key is present', () => {
    expect(readFirebaseConfig()).toEqual({
      apiKey: FULL.VITE_FIREBASE_API_KEY,
      authDomain: FULL.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: FULL.VITE_FIREBASE_PROJECT_ID,
      messagingSenderId: FULL.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: FULL.VITE_FIREBASE_APP_ID,
    })
  })

  it('trims surrounding whitespace', () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '  red-tide  ')
    expect(readFirebaseConfig()?.projectId).toBe('red-tide')
  })

  it.each(Object.keys(FULL))(
    'returns null when %s is missing or blank',
    (key) => {
      vi.stubEnv(key, '')
      expect(readFirebaseConfig()).toBeNull()

      vi.stubEnv(key, '   ')
      expect(readFirebaseConfig()).toBeNull()
    },
  )

  it('treats the .env.example placeholders as "not configured"', () => {
    stubAll(PLACEHOLDER)
    expect(readFirebaseConfig()).toBeNull()
  })

  it.each(Object.keys(PLACEHOLDER))(
    'rejects a config where only %s is still a placeholder',
    (key) => {
      vi.stubEnv(key, PLACEHOLDER[key]!)
      expect(readFirebaseConfig()).toBeNull()
    },
  )
})

describe('isDemoModeForced', () => {
  it.each(['true', 'TRUE', ' true ', 'True'])('is true for %j', (value) => {
    vi.stubEnv('VITE_USE_DEMO_BACKEND', value)
    expect(isDemoModeForced()).toBe(true)
  })

  it.each(['', 'false', '0', 'yes'])('is false for %j', (value) => {
    vi.stubEnv('VITE_USE_DEMO_BACKEND', value)
    expect(isDemoModeForced()).toBe(false)
  })
})
