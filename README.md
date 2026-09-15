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

**Routes**

- `/` — the landing page: what this is, the live zone readout and figures, and the way in.
- `/map` — the public map (lazy-loaded; the landing and admin never pay for Leaflet).
- `/admin` — the passcode-gated review queue.

**Core loop**

1. **Public map at `/map`** — a Leaflet map of the Puerto Princesa coastline. Each zone is a coloured polygon:
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

The app uses **Firestore for data and Cloudinary for photo uploads — no Firebase Auth**.

### 4.1 Create the project

1. [Firebase console](https://console.firebase.google.com) → **Add project**.
2. **Build → Firestore Database → Create database** (start in production mode; the rules below replace the defaults).
3. **Project settings → General → Your apps → Web app (`</>`)** → register an app and copy the config object.

### 4.2 Fill in `.env`

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-upload-preset
VITE_ADMIN_PASSCODE=change-me
```

`.env` is gitignored. Everything prefixed `VITE_` is compiled into the public JavaScript bundle — these are identifiers, **not secrets**. Access control belongs in the security rules.

Restart `npm run dev` after editing `.env`; Vite only reads env files at startup.

### 4.3 Configure Cloudinary photo uploads

1. Create a free account at [Cloudinary](https://cloudinary.com/users/register_free).
2. In the Cloudinary console, copy your **Cloud Name** from **Settings → API Keys** into `VITE_CLOUDINARY_CLOUD_NAME`.
3. Go to **Settings → Upload → Upload presets**, create a preset with **Signing Mode: Unsigned**, and put its preset name in `VITE_CLOUDINARY_UPLOAD_PRESET`.

The upload preset name and cloud name are public browser configuration, not secrets. Restrict the unsigned preset in Cloudinary (for example, allowed formats and file size) before production use.

### 4.4 Deploy the Firestore security rules

The repository ships `firestore.rules` (wired up by `firebase.json`):

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy --only firestore:rules
```

Or paste the contents into the Firebase console under **Firestore → Rules**.

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

### 4.5 Seed the zones

Zones are **pre-seeded, never user-created**:

```bash
npm run seed:dry-run   # show what would be written, write nothing
npm run seed           # create any missing zones
npm run seed -- --force  # overwrite existing zones (resets status to "safe")
```

The seed script reads the same `.env` as the app and writes the six zones defined in `src/data/zones.ts` into the `zones` collection with `lastUpdated = serverTimestamp()`.

Polygons are stored as arrays of `{lat, lng}` objects: Firestore rejects nested arrays, so the `[lat, lng]` tuples the app uses are converted on the way in (`toFirestorePolygon`) and back to tuples on the way out (`normalizePolygon`). `seed:dry-run` also validates every payload shape before touching the network.

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
    backend.firebase.ts   # Firestore + Cloudinary upload plumbing
    backend.demo.ts       # in-memory / localStorage implementation
    firestoreMapping.ts   # Firestore doc → domain type (pure, unit-tested)
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
    ZoneSheet.tsx         # three-anchor bottom sheet: advisories + zone list
    StatusPip.tsx         # the status dot (pops on status change)
    Ambient.tsx           # advisory-signal gauge + map scanline (schematic)
    Header.tsx  Legend.tsx  StatusBadge.tsx  Notice.tsx  DemoBanner.tsx
    DecryptedText.tsx     # landing hero: glyphs resolve left to right (reactbits pattern)
    Waves.tsx             # landing background: three sine composites on a canvas
    CountUp.tsx           # landing figures: counts up on first view, re-tweens on live updates
    BlurText.tsx          # landing copy: words blur into focus on their own scroll trigger
    HeroBackdrop.tsx      # landing hero backdrop: owns the WebGL policy (see docs §15)
    ferrofluid/           # the `ogl` shader itself — reach it only via HeroBackdrop
    Map.test.tsx          # regression: the zone-path classes in a production render
  motion/
    RouteTransition.tsx   # landing <-> map <-> admin route transition (fade + rise; see docs §19)
    sheetAnchors.ts       # peek/mid/full maths + snap + underlay (pure, tested)
    readouts.ts           # data-derived sheet copy + gauge wave (pure, tested)
    useZoneSheet.ts       # sheet position/anchors + underlay motion values
  styles/
    statusTheme.ts        # status -> dark-theme colours, classes, map paint
  pages/
    Landing.tsx           # / — pre-map landing (DecryptedText hero, Waves, CountUp)
    MapPage.tsx           # /map public view (lazy-loaded)
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

---

## 10. Zone boundaries are approximate

The polygons in `src/data/zones.ts` are **hand-drawn approximations**. They are placed over real water and anchored on verified OpenStreetMap reference points — the Bancao-Bancao lighthouse, the Santa Lourdes wharf, Cowrie/Cañon/Luli and the other Honda Bay islands, Sabang village and Saint Paul Rock — and every vertex sits at least ~1 km clear of the mapped shoreline. They exist to say "this is your bay" on a phone screen — **they are not survey boundaries and not official BFAR fisheries areas.**

Two caveats worth knowing:

- The outlines are simplified to 6–8 vertices each, so a zone edge can cut across a mangrove islet or a small headland. They mark an area, not a boundary line.
- `binuatan` is a legacy id: there is no coastal place called Binuatan (the only Binuatan in the Philippines is a weaving centre in Barangay Santa Monica, inside the city). That polygon covers the real northeast-coast water off the Marayugon and Babuyan barangays.

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
5. **Replace the polygons** with real boundaries.
6. **Compress or resize photos client-side** before upload to keep bandwidth use and load times down.

---

## 13. Tests

```bash
npm test
```

142 tests across eleven files:

- **`src/App.test.tsx`** (5, jsdom) — the whole loop rendered for real: landing → map → tap a zone → report → `/admin` → wrong passcode rejected → correct passcode → Approve → zone turns advisory → public map shows the advisory. Plus the landing page's decrypted hero and live readout, a photo attachment run end to end, and a check that a too-short report submits nothing.
- **`src/pages/mapPass.test.tsx`** (6, jsdom) — the six-item visual pass, DOM side: peek row content + hidden body, anchor cycling, the `zone-path` fill ramp, attribution, zoom-control placement, and the full report → approve loop.
- **`src/components/Map.test.tsx`** (6, jsdom) — the production `zone-path` regression: the class lands on the path node in a single-pass render (no StrictMode double effect), `--selected` syncs from first mount onward, the fill ramp follows selection, and press feedback lights/releases the polygon.
- **`src/store.test.ts`** (13) — the real store against the real (in-memory) backend: seeded zones load `safe`; `submitReport` writes a pending report; short descriptions are refused; `approveReport` confirms the report **and** flips the zone to `advisory`; `rejectReport` leaves the zone untouched; manual revert to `safe` works; pending counts are right; the passcode gate only unlocks on an exact match.
- **`src/lib/firestoreMapping.test.ts`** (28) — the production-only mapping path: Timestamps, GeoPoints, unresolved `serverTimestamp()` values, malformed documents, and polygon values.
- **`src/motion/sheetAnchors.test.ts`** (32) — the sheet's snap arithmetic: offsets, clamping, velocity projection, flick gating, underlay mapping.
- **`src/lib/firebase.test.ts`** (21) — `readFirebaseConfig` returns a config only when all five keys are real, so a half-filled `.env` falls back to demo mode instead of half-initialising Firebase.
- **`src/motion/readouts.test.ts`** (18) — the data-derived copy: peek summary, anchor readout, dominant status, advisory share.
- **`src/data/zones.test.ts`** (8) — polygon sanity: unique ids, plausible coordinates inside the Puerto Princesa box, the two Honda Bay zones do not overlap, bounding box contains every vertex.
- **`src/lib/backend.firebase.test.ts`** (3) — Cloudinary uploads use the correct endpoint and form fields, return `secure_url`, and surface configuration/API errors.
- **`src/lib/firestoreSeedValidation.test.ts`** (2) — seed payloads pass the shape Firestore actually rejects on.

The Firestore mapping tests matter because that code only runs against a real project — the demo backend never touches it.

### Browser pass (real Chromium)

`scripts/final-pass.mjs` is the script of record for the six-item visual checklist (peek row, drag/flick anchors, polygon fill ramp, attribution legibility, zoom-control clearance, report → approve E2E). It runs the **production build** in headless Chromium at desktop and mobile sizes:

```bash
npm run preview        # in one terminal — serves dist/ on :4173
node scripts/final-pass.mjs   # in another — 6/6 checks, exit 0
```

Tiles and webfonts are allowed to fail (offline sandboxes): every assertion targets the app's own UI. Where a sandbox has no browser at all, the DOM/behaviour half of the same six items runs in CI via `src/pages/mapPass.test.tsx`.

---

## 14. Making common changes

| I want to… | Touch this |
| --- | --- |
| **Add or edit a zone** | `src/data/zones.ts` → then `npm run seed -- --force` to push it. In demo mode, clear `localStorage` to re-seed. |
| **Replace the polygons with real boundaries** | Same file. `polygon` accepts `[lat, lng]` pairs; the mapper also tolerates `{latitude, longitude}` GeoPoints entered in the console. |
| **Change a status colour** | `src/lib/status.ts` (`hex` is what Leaflet draws) **and** the `@theme` block in `src/index.css` — they are duplicated on purpose and must be kept in sync. |
| **Change the advisory wording** | `guidance` in `src/lib/status.ts`; the long explainer is in `src/pages/MapPage.tsx`. |
| **Change report validation limits** | `MIN/MAX_DESCRIPTION_LENGTH` in `src/store.ts`; the 2000-character cap is mirrored in `firestore.rules`. |
| **Change the photo size limit** | `MAX_PHOTO_BYTES` in `src/lib/image.ts`; mirror the limit in the Cloudinary unsigned upload preset. |
| **Tighten security** | Update `firestore.rules` and the Cloudinary unsigned preset restrictions. Replacing the passcode means adding Firebase Auth and gating `Admin.tsx` on it. |
| **Add a new admin action** | Add the action to `src/store.ts` (all datastore calls live there) and call it from `src/pages/Admin.tsx`. |

---

## Stack

React 19 · TypeScript 5.9 · Vite 8 · Zustand 5 · Tailwind CSS 4 · Leaflet + react-leaflet 5 · Firebase 12 (Firestore) · Cloudinary (photo uploads) · Vitest 5

**Not a medical or food-safety authority.** If someone shows symptoms of PSP after eating shellfish, treat it as an emergency and get them to a hospital immediately.
