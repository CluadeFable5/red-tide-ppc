# Red Tide PPC

**Community-driven red tide (PSP) advisory map and report tracker for the coastal waters of Puerto Princesa, Palawan.**

A public map of coastal zones colour-coded by advisory status, an anonymous way for anyone on the water to report what they are seeing, and a passcode-gated admin view that turns a credible report into a zone-wide advisory.

---

## 1. The problem, in plain English

### What is a red tide?

"Red tide" — *pula ang dagat* in Filipino — is a **bloom of microscopic algae**. Under the right conditions (warm water, calm seas, nutrient runoff) certain single-celled organisms multiply explosively. In the Philippines the usual culprits are *Pyrodinium bahamense* and *Alexandrium* species.

The water can turn reddish-brown, but **not always**. A bloom can be dangerous while the sea still looks perfectly normal, which is exactly why a name based on colour is not enough on its own.

### Why it makes people sick

Some of those organisms produce **saxitoxin**, a nerve poison. Shellfish — *tahong* (mussels), *talaba* (oysters), *halaan* (clams), *tuway*, and *alamang* (small shrimp) — feed by filtering seawater, so the toxin concentrates inside their flesh.

Eating contaminated shellfish causes **Paralytic Shellfish Poisoning (PSP)**:

- Symptoms usually begin **30 minutes to 2 hours** after eating.
- It starts as tingling or numbness around the mouth, tongue and face, then spreads to the arms and legs.
- Severe cases progress to **respiratory paralysis** and can be fatal within 12 hours.
- **There is no antidote.** Treatment is supportive care — keeping the person breathing until the toxin wears off.

Three things people often get wrong, and this app repeats deliberately:

| Myth | Reality |
| --- | --- |
| "Cooking kills it." | **No.** Boiling, frying, grilling, vinegar and chili do **not** destroy saxitoxin. |
| "If it smells and tastes fine, it is safe." | **No.** Contaminated shellfish look, smell and taste normal. |
| "All seafood from that water is dangerous." | **No.** Fish, squid, shrimp and crab are generally safe if they are fresh, have their gills and intestines removed, and are washed under running water before cooking. The toxin sits in the organs, not the meat. |

### Who decides officially?

The **Bureau of Fisheries and Aquatic Resources (BFAR)** tests shellfish and seawater and publishes shellfish bulletins and advisories. The Philippine regulatory limit is **60 µg of saxitoxin per 100 g of shellfish meat**; above that, gathering and selling shellfish from the area is banned.

### The gap this project targets

Official testing is authoritative but **slow to reach a specific cove**, and it cannot cover every shoreline every day. Meanwhile the people who notice first are the ones already on the water: fishers, *gleaners*, boat operators, resort staff, residents walking the shore at low tide.

Red Tide PPC gives those sightings somewhere to go, and gives a local reviewer a fast way to raise a visible warning for one specific zone — while being explicit that **it is not a substitute for a BFAR advisory**.

---

## 2. What the app does

**Core loop**

1. **Public map** — a Leaflet map of the Puerto Princesa coastline. Each zone is a coloured polygon:
   - 🟢 **Safe** — no advisory recorded.
   - 🟡 **Unconfirmed** — flagged by an admin as needing a check; treat with caution.
   - 🔴 **Advisory** — confirmed; do not eat shellfish from this zone.
2. **Tap a zone** → a popup shows the name, current status, plain-language guidance, how many community reports are waiting for review, and when the status last changed — plus a **"Report something here"** button.
3. **Report form** — a description plus an optional photo. No account, no name, no login. The report is written to Firestore with status `pending`.
4. **Admin view at `/admin`** — behind a passcode. Pending reports are listed with zone, description, photo and timestamp.
   - **Approve** → the report becomes `confirmed` **and** its zone becomes `advisory` with `lastUpdated = now`.
   - **Reject** → the report becomes `rejected` and the zone is left exactly as it was.
5. **Manual control only** — zone status never changes by itself. When the water is cleared, an admin reverts the zone to `safe` from the admin view's **Zones** tab.

---

## 3. Quick start (no Firebase project required)

```bash
npm install
npm run dev
```

Open the URL Vite prints. **If no Firebase keys are present the app runs in demo mode**: the same UI, backed by an in-memory store that mirrors to `localStorage`. Nothing leaves the browser, and a banner says so. That is enough to click through the entire loop in a demo.

To use the admin view locally, create a `.env`:

```bash
cp .env.example .env
```

and set at least:

```
VITE_ADMIN_PASSCODE=whatever-you-like
```

Then open `/admin` and type that passcode.

> **Demo-mode tip:** demo data lives in `localStorage` under `red-tide-ppc:demo:v1`. Clear site data (or run `localStorage.clear()` in the console) to start over with all zones `safe`.

---

## 4. Connecting a real Firebase backend

The app uses **Firestore + Cloud Storage only — no Firebase Auth**.

### 4.1 Create the project

1. [Firebase console](https://console.firebase.google.com) → **Add project**.
2. **Build → Firestore Database → Create database** (start in production mode; the rules below replace the defaults).
3. **Build → Storage → Get started** (same region as Firestore).
4. **Project settings → General → Your apps → Web app (`</>`)** → register an app and copy the config object.

### 4.2 Fill in `.env`

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
VITE_ADMIN_PASSCODE=change-me
```

`.env` is gitignored. Everything prefixed `VITE_` is compiled into the public JavaScript bundle — these are identifiers, **not secrets**. Access control belongs in the security rules.

Restart `npm run dev` after editing `.env`; Vite only reads env files at startup.

### 4.3 Deploy the security rules

The repository ships `firestore.rules` and `storage.rules` (wired up by `firebase.json`):

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy --only firestore:rules,storage
```

Or paste the contents into the console: **Firestore → Rules** and **Storage → Rules**.

> ### ⚠️ These rules are insecure by design
>
> There is no authentication in this MVP, so the rules cannot distinguish a fisherman from an attacker:
>
> - `reports` must be **world-writable**, or nobody can submit anonymously.
> - `zones` must be **world-updatable**, or the admin's Approve button cannot flip a zone to `advisory`.
>
> What they still enforce: fixed document shapes, **every new report must start as `pending`** (nobody can self-confirm), zone updates restricted to `status`/`lastUpdated`, and no deletes.
>
> Before any real deployment, add Firebase Auth with an admin custom claim and lock writes behind it. The rule files show the intended shape in a comment.

### 4.4 Seed the zones

Zones are **pre-seeded, never user-created**:

```bash
npm run seed:dry-run   # show what would be written, write nothing
npm run seed           # create any missing zones
npm run seed -- --force  # overwrite existing zones (resets status to "safe")
```

The seed script reads the same `.env` as the app and writes the six zones defined in `src/data/zones.ts` into the `zones` collection with `lastUpdated = serverTimestamp()`.

### 4.5 Verify

Reload the app. The amber **demo mode** banner should be gone, and a report submitted in one browser should appear in the admin queue of another.

---

## 5. Admin review workflow

| Action | Report status | Zone status |
| --- | --- | --- |
| **Approve** | `pending` → `confirmed` | → `advisory`, `lastUpdated = now` |
| **Reject** | `pending` → `rejected` | **unchanged** |
| **Zones tab → Safe / Unconfirmed / Advisory** | unchanged | set directly, `lastUpdated = now` |

Submitting a report never changes a zone by itself — otherwise a rejected report would leave a zone stuck in a changed state. The number of pending reports per zone is shown on the map popup and in the zone list instead.

---

## 6. Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (binds `0.0.0.0`, so phones on the same network can open it) |
| `npm run build` | Type-check (`tsc -b`) then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run seed` | Seed zones into Firestore |
| `npm run seed:dry-run` | Seed preview, no writes |

---

## 7. Project structure

Deliberately small files in separate modules, so two developers can work in parallel without colliding:

```
scripts/
  seed.ts                 # writes the zones into Firestore
src/
  types.ts                # Zone / Report domain types (no DOM, no Firebase)
  store.ts                # ALL datastore calls + app state (Zustand)
  data/
    zones.ts              # the six pre-seeded zones + polygon helper
  lib/
    backend.ts            # Backend contract + which implementation to use
    backend.firebase.ts   # Firestore + Storage implementation
    backend.demo.ts       # in-memory / localStorage implementation
    firebase.ts           # Firebase bootstrap + env parsing
    status.ts             # status → colour / label / guidance (single source)
    format.ts             # date + relative time + byte formatting (PHT)
    image.ts              # photo size/type checks, downscale for demo mode
  components/
    Map.tsx               # react-leaflet map, polygons, popups
    ZonePopup.tsx         # popup content + "Report something here"
    ReportForm.tsx        # report modal / bottom sheet
    ReportCard.tsx        # one report in the admin queue
    AdminGate.tsx         # passcode screen
    Header.tsx  Legend.tsx  StatusBadge.tsx  Notice.tsx  DemoBanner.tsx
  pages/
    MapPage.tsx           # public view
    Admin.tsx             # /admin review dashboard
```

**Split suggestion:** one developer owns `Map.tsx` / `MapPage.tsx` / `Legend.tsx`; the other owns `ReportForm.tsx` / `Admin.tsx` / `AdminGate.tsx` / `ReportCard.tsx`. `store.ts`, `types.ts` and `status.ts` are the shared contract — change them together.

---

## 8. Data model

**`zones/{zoneId}`** — pre-seeded, admin-editable

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | e.g. `honda-inner` |
| `name` | string | shown on the map |
| `description` | string | one-line plain-English description |
| `polygon` | array | approximate `[lat, lng]` pairs |
| `status` | string | `safe` \| `unconfirmed` \| `advisory` |
| `lastUpdated` | timestamp | set with `serverTimestamp()` |

**`reports/{reportId}`** — anonymous user submissions

| Field | Type | Notes |
| --- | --- | --- |
| `zoneId` | string | which zone this is about |
| `description` | string | 10–2000 characters |
| `photoUrl` | string \| null | Cloud Storage download URL |
| `submittedAt` | timestamp | `serverTimestamp()` |
| `status` | string | `pending` \| `confirmed` \| `rejected` |

---

## 9. Deploying

Any static host works — `npm run build` produces `dist/`.

**Vercel** — `vercel.json` already rewrites every path to `index.html` (needed so `/admin` survives a refresh). Set the `VITE_*` variables under *Project → Settings → Environment Variables*, and add them for **both** build and production.

**Netlify** — build command `npm run build`, publish directory `dist`. `public/_redirects` handles the SPA fallback. Set the same `VITE_*` variables under *Site configuration → Environment variables*.

Notes:

- Env vars are baked in **at build time**. Changing them requires a redeploy.
- Add your production domain to the Firebase project's authorised domains, and make sure the deployed rules are the ones in this repo.
- Map tiles come from OpenStreetMap and need the visitor to be online.

---

## 10. Zone boundaries are approximate

The polygons in `src/data/zones.ts` are **hand-drawn approximations**, anchored on a handful of verified reference points (Puerto Princesa city centre, the port, Cowrie and Luli islands, Bacungan, Sabang). They exist to say "this is your bay" on a phone screen — **they are not survey boundaries and not official BFAR fisheries areas.**

Before this is used for real public-health decisions, replace them with the actual boundaries from BFAR or the Puerto Princesa City LGU.

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
5. **Replace the polygons** with real boundaries.
6. **Compress or resize photos client-side** before upload to keep Storage costs and load times down.

---

## 13. Tests

```bash
npm test
```

23 tests in three files:

- **`src/store.test.ts`** — the real store against the real (in-memory) backend: seeded zones load `safe`; `submitReport` writes a pending report; short descriptions are refused; `approveReport` confirms the report **and** flips the zone to `advisory`; `rejectReport` leaves the zone untouched; manual revert to `safe` works; pending counts are right; the passcode gate only unlocks on an exact match.
- **`src/App.test.tsx`** — the whole loop rendered in jsdom: map → tap a zone → report → `/admin` → wrong passcode rejected → correct passcode → Approve → zone turns advisory → public map shows the advisory. Plus a photo attachment run end to end.
- **`src/data/zones.test.ts`** — polygon sanity: unique ids, plausible coordinates inside the Puerto Princesa box, the two Honda Bay zones do not overlap, bounding box contains every vertex.

---

## Stack

React 19 · TypeScript 5.9 · Vite 8 · Zustand 5 · Tailwind CSS 4 · Leaflet + react-leaflet 5 · Firebase 12 (Firestore + Storage) · Vitest 5

**Not a medical or food-safety authority.** If someone shows symptoms of PSP after eating shellfish, treat it as an emergency and get them to a hospital immediately.
