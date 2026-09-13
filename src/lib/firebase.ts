import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

/**
 * Firebase bootstrap.
 *
 * The web config below is PUBLIC by design — it ships in the browser bundle.
 * It is an identifier, not a secret. Access control lives entirely in
 * `firestore.rules` / `storage.rules`.
 */

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

const rawEnv = import.meta.env as Record<string, string | undefined>

function trimmed(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v.length > 0 ? v : null
}

/** Placeholders shipped in `.env.example` — treat them as "not configured". */
const PLACEHOLDERS = new Set([
  'AIza...',
  'your-project.firebaseapp.com',
  'your-project',
  'your-project.firebasestorage.app',
  '000000000000',
  '1:000000000000:web:0000000000000000',
])

/**
 * Reads the Firebase web config out of `import.meta.env`.
 * Returns `null` when any required key is missing or still a placeholder, so
 * the app can fall back to demo mode instead of throwing at boot.
 */
export function readFirebaseConfig(): FirebaseConfig | null {
  const candidate: Record<keyof FirebaseConfig, string | null> = {
    apiKey: trimmed(rawEnv.VITE_FIREBASE_API_KEY),
    authDomain: trimmed(rawEnv.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: trimmed(rawEnv.VITE_FIREBASE_PROJECT_ID),
    storageBucket: trimmed(rawEnv.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: trimmed(rawEnv.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: trimmed(rawEnv.VITE_FIREBASE_APP_ID),
  }

  for (const value of Object.values(candidate)) {
    if (value === null || PLACEHOLDERS.has(value)) return null
  }

  return candidate as unknown as FirebaseConfig
}

/** Set `VITE_USE_DEMO_BACKEND=true` to force demo mode even with keys present. */
export function isDemoModeForced(): boolean {
  return rawEnv.VITE_USE_DEMO_BACKEND?.trim().toLowerCase() === 'true'
}

const config = readFirebaseConfig()

/** True when a complete, non-placeholder Firebase config is available. */
export const hasFirebaseConfig: boolean = config !== null && !isDemoModeForced()

let appInstance: FirebaseApp | null = null
let dbInstance: Firestore | null = null
let storageInstance: FirebaseStorage | null = null

function app(): FirebaseApp {
  if (!appInstance) {
    if (!config) {
      throw new Error(
        'Firebase is not configured. Copy .env.example to .env and fill in your project keys.',
      )
    }
    appInstance = initializeApp(config)
  }
  return appInstance
}

export function firestore(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(app())
  return dbInstance
}

export function storage(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(app())
  return storageInstance
}
