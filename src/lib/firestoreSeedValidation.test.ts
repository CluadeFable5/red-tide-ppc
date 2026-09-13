import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  doc,
  getFirestore,
  setDoc,
  terminate,
  type Firestore,
} from 'firebase/firestore'
import { toFirestorePolygon } from './firestoreMapping'

/**
 * Regression test for the live seeding bug: `scripts/seed.ts` wrote zone
 * polygons as `[lat, lng]` tuples, and the real Firestore SDK rejected every
 * write with "Function setDoc() called with invalid data. Nested arrays are
 * not supported (found in document zones/pp-bay)". The mocked unit tests and
 * demo mode never saw it because they never run Firestore's validator.
 *
 * That validation is synchronous and client-side — it runs before anything
 * touches the network — so this exercises the actual SDK against a throwaway
 * app with dummy config. It never connects to (or can affect) a real project.
 * If a future firebase version moves validation behind the wire, these two
 * tests are the ones to revisit; the pure round-trip in
 * `firestoreMapping.test.ts` remains the real contract.
 */

const TUPLE_POLYGON: [number, number][] = [
  [9.748, 118.69],
  [9.742, 118.722],
  [9.72, 118.732],
  [9.694, 118.722],
]

let app: FirebaseApp
let db: Firestore

beforeAll(() => {
  app = initializeApp(
    {
      apiKey: 'AIzaFAKEfakeFAKEfakeFAKEfakeFAKEfake0',
      authDomain: 'red-tide-ppc-validator-test.firebaseapp.com',
      projectId: 'red-tide-ppc-validator-test',
      appId: '1:000000000000:web:0000000000000000',
    },
    'red-tide-seed-shape-validation',
  )
  db = getFirestore(app)
})

afterAll(async () => {
  // Stop the client the *accepted* write started, so the worker can exit
  // without waiting on connection retries against the nonexistent project.
  try {
    await terminate(db)
  } catch {
    // Client was never started (e.g. both calls threw before queueing).
  }
  await deleteApp(app)
})

describe('Firestore SDK validation of zone polygons', () => {
  it('rejects the old tuple shape (the bug) with the production error', () => {
    expect(() =>
      setDoc(doc(db, 'zones', 'pp-bay'), { polygon: TUPLE_POLYGON }),
    ).toThrow(/Nested arrays are not supported/)
  })

  it('accepts the toFirestorePolygon shape (the fix)', () => {
    // setDoc() validating == no synchronous throw. The returned promise only
    // settles on network I/O (auth failure against a fake project); swallow
    // that rejection — this test asserts on validation, not connectivity.
    const pending = setDoc(doc(db, 'zones', 'pp-bay'), {
      id: 'pp-bay',
      name: 'Puerto Princesa Bay (City Proper)',
      description: 'The city bay southwest of the poblacion.',
      polygon: toFirestorePolygon(TUPLE_POLYGON),
      status: 'safe',
    })
    expect(pending).toBeInstanceOf(Promise)
    pending.catch(() => {})
  })
})
