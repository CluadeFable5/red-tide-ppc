/**
 * Seed script — writes the pre-defined Puerto Princesa zones into Firestore.
 *
 *   npm run seed             # create zones that are missing
 *   npm run seed:dry-run     # print what would be written, write nothing
 *   npm run seed -- --force  # overwrite existing zones (resets status to "safe")
 *
 * Run this once per environment, after you have created your Firestore database
 * and deployed `firestore.rules`.
 *
 * Zone polygons live in `src/data/zones.ts` as `[lat, lng]` tuples for Leaflet.
 * Firestore forbids nested arrays, so each vertex is serialized to a
 * `{lat, lng}` object before writing (`toFirestorePolygon`) and every payload
 * is pre-flighted for nested arrays — `--dry-run` checks shapes without
 * writing anything.
 */

import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { SEED_ZONES } from '../src/data/zones'
import {
  containsNestedArrays,
  toFirestorePolygon,
} from '../src/lib/firestoreMapping'

const ZONES_COLLECTION = 'zones'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run') || args.has('-n')
const force = args.has('--force')

/** Node 20.12+ / 22+: load `.env.local` then `.env` without a dotenv dep. */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file)
    } catch {
      // File not present — that is fine.
    }
  }
}

function readConfig(): FirebaseOptions {
  const get = (key: string): string => {
    const value = process.env[key]?.trim()
    if (!value) {
      throw new Error(
        `Missing ${key}. Copy .env.example to .env and fill in your Firebase web config.`,
      )
    }
    return value
  }

  return {
    apiKey: get('VITE_FIREBASE_API_KEY'),
    authDomain: get('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: get('VITE_FIREBASE_PROJECT_ID'),
    messagingSenderId: get('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: get('VITE_FIREBASE_APP_ID'),
  }
}

async function main(): Promise<void> {
  loadEnvFiles()
  const config = readConfig()

  console.log(`Firebase project: ${config.projectId}`)
  console.log(`Zones to seed:    ${SEED_ZONES.length}`)
  if (dryRun) console.log('Dry run — nothing will be written.\n')
  else console.log('')

  const db = getFirestore(initializeApp(config))

  let created = 0
  let updated = 0
  let skipped = 0

  for (const zone of SEED_ZONES) {
    const payload = {
      id: zone.id,
      name: zone.name,
      description: zone.description,
      // Tuples ([lat, lng]) are nested arrays, which Firestore rejects;
      // store objects instead. normalizePolygon() reads them back as tuples.
      polygon: toFirestorePolygon(zone.polygon),
      status: zone.status,
      lastUpdated: serverTimestamp(),
    }

    if (containsNestedArrays(payload)) {
      throw new Error(
        `Refusing to write zones/${zone.id}: the payload contains an array ` +
          'nested inside another array, which Firestore rejects. Serialize ' +
          'the offending field before writing (see toFirestorePolygon).',
      )
    }

    if (dryRun) {
      console.log(`[dry-run] would write  ${zone.id} — ${zone.name} (shape OK: ${zone.polygon.length} vertices)`)
      created += 1
      continue
    }

    // Read-after-check: a dry run never touches the network.
    const reference = doc(db, ZONES_COLLECTION, zone.id)
    const existing = await getDoc(reference)

    if (existing.exists() && !force) {
      console.log(`[skip]     ${zone.id} — ${zone.name} (already exists)`)
      skipped += 1
      continue
    }

    await setDoc(reference, payload, { merge: true })
    if (existing.exists()) {
      console.log(`[overwrite] ${zone.id} — ${zone.name}`)
      updated += 1
    } else {
      console.log(`[create]   ${zone.id} — ${zone.name}`)
      created += 1
    }
  }

  console.log('')
  console.log(
    `Done. created=${created} updated=${updated} skipped=${skipped}` +
      (force && !dryRun ? ' (--force: existing statuses were reset)' : ''),
  )

  if (created === 0 && !dryRun) {
    console.log(
      '\nNothing new was written. Re-run with `npm run seed -- --force` to overwrite.',
    )
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error: unknown) => {
    console.error('\nSeeding failed.')
    console.error(error instanceof Error ? error.message : error)
    console.error(
      '\nChecklist: .env exists with the VITE_FIREBASE_* values, the Firestore ' +
        'database has been created, and firestore.rules allow zone creation.',
    )
    process.exit(1)
  })
