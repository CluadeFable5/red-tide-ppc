
**Split suggestion:** one developer owns `Map.tsx` / `MapPage.tsx` / `Legend.tsx`; the other owns `ReportForm.tsx` / `Admin.tsx` / `AdminGate.tsx` / `ReportCard.tsx`. `store.ts`, `types.ts` and `status.ts` are the shared contract — change them together.

---

## 8. Data model

**`zones/{zoneId}`** — pre-seeded, admin-editable

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | e.g. `honda-inner` |
| `name` | string | shown on the map |
| `description` | string | one-line plain-English description |
| `polygon` | array | array of `{lat, lng}` objects (the app converts to/from `[lat, lng]` tuples; Firestore forbids nested arrays) |
| `status` | string | `safe` \| `unconfirmed` \| `advisory` |
| `lastUpdated` | timestamp | set with `serverTimestamp()` |

**`reports/{reportId}`** — anonymous user submissions

| Field | Type | Notes |
| --- | --- | --- |
| `zoneId` | string | which zone this is about |
| `description` | string | 10–2000 characters |
| `photoUrl` | string \| null | Cloudinary secure image URL |
| `submittedAt` | timestamp | `serverTimestamp()` |
| `status` | string | `pending` \| `confirmed` \| `rejected` |

---

## 9. Deploying

Any static host works — `npm run build` produces `dist/`.

**Vercel** — `vercel.json` already rewrites every path to `index.html` (needed so `/admin` survives a refresh). Set the `VITE_*` variables under *Project → Settings → Environment Variables*, and add them for **both** build and production.

**Netlify** — build command `npm run build`, publish directory `dist`. `public/_redirects` handles the SPA fallback. Set the same `VITE_*` variables under *Site configuration → Environment variables*.

Notes:

- Env vars are baked in **at build time**. Changing them requires a redeploy.
- Make sure the deployed Firestore rules are the ones in this repo, and restrict the unsigned Cloudinary preset for production.
- Map tiles come from OpenStreetMap and need the visitor to be online.
- If you're pausing/unpausing auto-publish to conserve build minutes or bandwidth on a free tier, remember: a paused site serves nothing to visitors, and new commits won't auto-deploy until you resume it. Always confirm the deploy log shows every stage (Initializing → Building → Deploying → Cleanup → Post-processing) as **Complete** before pausing again.

---

## 10. Zone boundaries

The polygons in `src/data/zones.ts` are **hand-drawn approximations, traced against the real coastline** — not survey boundaries and not official BFAR fisheries areas. Each zone's shape follows the shoreline stretch its name and description describe (mangrove edge, bay shallows, island cluster, port frontage, etc.), so the polygon actually overlaps the water people fish, glean, or gather shellfish in, rather than floating out in open sea disconnected from land.

Reference points used to anchor the shapes: the Bancao-Bancao lighthouse, the Santa Lourdes wharf, Cowrie/Cañon/Luli and the other Honda Bay islands, Sabang village, and Saint Paul Rock.

Two caveats worth knowing:

- The outlines are simplified to a handful of vertices each, so a zone edge can cut across a mangrove islet or a small headland. They mark an area, not a precise boundary line.
- `binuatan` is a legacy id: there is no coastal place called Binuatan (the only Binuatan in the Philippines is a weaving centre in Barangay Santa Monica, inside the city). That polygon covers the real northeast-coast water off the Marayugon and Babuyan barangays.

> **Provenance note:** an earlier revision of these polygons was placed by offset from the coastline (vertices deliberately kept clear of the mapped shore) rather than traced along it, which put the shapes out in open water instead of over the areas the app is meant to warn people about. If you're touching this file, verify visually that every zone's near-land edge actually sits against the shoreline — zoom the map into each zone individually and check for a gap of open water between the polygon and the coast.

Before this is used for real public-health decisions, replace them with the actual boundaries from BFAR or the Puerto Princesa City LGU.

**If you edit the polygons:** zones are seeded into Firestore, so an existing project keeps the old coordinates until you re-seed — `npm run seed -- --force`.

---

## 11. Explicitly out of scope for this MVP

- **No user accounts** and no auth beyond the admin passcode gate.
- **No push notifications** and no SMS/route-based alerts.
- **No BFAR API integration or scraping** — status is entered by a human admin.
- **No automatic expiry or decay** of zone status; reverting to `safe` is a deliberate admin action.
- **No geolocation or per-report coordinates** — a report belongs to a zone, not to a point.
- **No moderation history or audit trail** beyond the report's final status.

---

## 12. What to fix before real use

1. **Replace the passcode with Firebase Auth** and an `admin` custom claim; lock `zones` and `reports` updates behind it. The current gate is a string compare against a value that is readable in the page source.
2. **Tighten `firestore.rules`** once zones are seeded (`allow create: if false` on `zones`).
3. **Add rate limiting / basic spam control** on report creation — right now anyone can flood the queue.
4. **Store the reviewer and timestamp** on approve/reject for accountability (`reviewedAt` is already written; `reviewedBy` needs auth).
5. **Replace the polygons** with real boundaries (see §10).
6. **Compress or resize photos client-side** before upload to keep bandwidth use and load times down.

---

## 13. Tests

```bash
npm test
```

142+ tests across the suite (grows with each pass — see `docs/` for the browser-verification write-ups behind recent UI changes):

- **`src/App.test.tsx`** (jsdom) — the whole loop rendered for real: landing → map → tap a zone → report → `/admin` → wrong passcode rejected → correct passcode → Approve → zone turns advisory → public map shows the advisory. Plus the landing page's decrypted hero and live readout, a photo attachment run end to end, and a check that a too-short report submits nothing.
- **`src/pages/mapPass.test.tsx`** (jsdom) — the six-item visual pass, DOM side: peek row content + hidden body, anchor cycling, the `zone-path` fill ramp, attribution, zoom-control placement, and the full report → approve loop.
- **`src/components/Map.test.tsx`** (jsdom) — the production `zone-path` regression: the class lands on the path node in a single-pass render (no StrictMode double effect), `--selected` syncs from first mount onward, the fill ramp follows selection, and press feedback lights/releases the polygon.
- **`src/store.test.ts`** — the real store against the real (in-memory) backend: seeded zones load `safe`; `submitReport` writes a pending report; short descriptions are refused; `approveReport` confirms the report **and** flips the zone to `advisory`; `rejectReport` leaves the zone untouched; manual revert to `safe` works; pending counts are right; the passcode gate only unlocks on an exact match.
- **`src/lib/firestoreMapping.test.ts`** — the production-only mapping path: Timestamps, GeoPoints, unresolved `serverTimestamp()` values, malformed documents, and polygon values.
- **`src/motion/sheetAnchors.test.ts`** — the sheet's snap arithmetic: offsets, clamping, velocity projection, flick gating, underlay mapping, and header-chrome fade timing (threshold, easing curve, reduced-motion instant swap).
- **`src/lib/firebase.test.ts`** — `readFirebaseConfig` returns a config only when all five keys are real, so a half-filled `.env` falls back to demo mode instead of half-initialising Firebase.
- **`src/motion/readouts.test.ts`** — the data-derived copy: peek summary, anchor readout, dominant status, advisory share.
- **`src/data/zones.test.ts`** — polygon sanity: unique ids, plausible coordinates inside the Puerto Princesa box, the two Honda Bay zones do not overlap, bounding box contains every vertex, and every zone's near-land edge actually sits against the coastline (no open-water gap).
- **`src/lib/backend.firebase.test.ts`** — Cloudinary uploads use the correct endpoint and form fields, return `secure_url`, and surface configuration/API errors.
- **`src/lib/firestoreSeedValidation.test.ts`** — seed payloads pass the shape Firestore actually rejects on.

The Firestore mapping tests matter because that code only runs against a real project — the demo backend never touches it.

### Browser pass (real Chromium)

`scripts/final-pass.mjs` is the script of record for the six-item visual checklist (peek row, drag/flick anchors, polygon fill ramp, attribution legibility, zoom-control clearance, report → approve E2E). It runs the **production build** in headless Chromium at desktop and mobile sizes:

```bash
npm run preview        # in one terminal — serves dist/ on :4173
node scripts/final-pass.mjs   # in another — 6/6 checks, exit 0
```

Tiles and webfonts are allowed to fail (offline sandboxes): every assertion targets the app's own UI. Where a sandbox has no browser at all, the DOM/behaviour half of the same six items runs in CI via `src/pages/mapPass.test.tsx`.

Additional one-off verification scripts (bottom sheet snap points, header fade timing, coastal polygon accuracy, hero full-bleed) live in `scripts/` alongside their write-ups in `docs/` — check there before re-deriving something that's already been measured.

---

## 14. Making common changes

| I want to… | Touch this |
| --- | --- |
| **Add or edit a zone** | `src/data/zones.ts` → then `npm run seed -- --force` to push it. In demo mode, clear `localStorage` to re-seed. Verify the new polygon actually touches the coastline (see §10) before shipping. |
| **Replace the polygons with real boundaries** | Same file. `polygon` accepts `[lat, lng]` pairs; the mapper also tolerates `{latitude, longitude}` GeoPoints entered in the console. |
| **Change a status colour** | `src/lib/status.ts` (`hex` is what Leaflet draws) **and** the `@theme` block in `src/index.css` — they are duplicated on purpose and must be kept in sync. |
| **Change the advisory wording** | `guidance` in `src/lib/status.ts`; the long explainer is in `src/pages/MapPage.tsx`. |
| **Change report validation limits** | `MIN/MAX_DESCRIPTION_LENGTH` in `src/store.ts`; the 2000-character cap is mirrored in `firestore.rules`. |
| **Change the photo size limit** | `MAX_PHOTO_BYTES` in `src/lib/image.ts`; mirror the limit in the Cloudinary unsigned upload preset. |
| **Tighten security** | Update `firestore.rules` and the Cloudinary unsigned preset restrictions. Replacing the passcode means adding Firebase Auth and gating `Admin.tsx` on it. |
| **Add a new admin action** | Add the action to `src/store.ts` (all datastore calls live there) and call it from `src/pages/Admin.tsx`. |
| **Adjust the bottom sheet's snap points or feel** | `src/motion/sheetAnchors.ts` (detent ratios, spring constants, header-fade threshold) — pure and unit-tested, change here before touching `ZoneSheet.tsx`. |

---

## Stack

React 19 · TypeScript 5.9 · Vite 8 · Zustand 5 · Tailwind CSS 4 · Leaflet + react-leaflet 5 · Firebase 12 (Firestore) · Cloudinary (photo uploads) · Vitest 5

**Not a medical or food-safety authority.** If someone shows symptoms of PSP after eating shellfish, treat it as an emergency and get them to a hospital immediately.
