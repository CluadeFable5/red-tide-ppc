# Red Tide PPC follow-up — 2026-09-16

## 1. `/admin` responsive treatment — PASS

The dashboard now grows at `md`, `lg`, `xl`, and `2xl`, up to a 1600px shell. Its header, demo banner, statistics, tabs and disclaimer align with that shell. The passcode gate remains a deliberately compact form.

| Viewport | Usable content | Pending / reviewed reports | Zone management |
| --- | ---: | ---: | ---: |
| 375 × 812 | 335px | 1 column | 1 column |
| 768 × 900 | 704px | 2 columns | 2 columns |
| 1280 × 900 | 1200px | 2 columns | 3 columns |
| 1920 × 1080 | 1504px | 3 columns | 3 columns |

Report cards allow long text/IDs to wrap inside their grid track, and the loading skeleton uses the queue's grid. These are presentation changes; approval, rejection and zone-status store/backend logic are unchanged.

**Browser evidence:** 24 full-page captures: three tabs × four widths × normal/reduced motion, regenerated after self-hosting fonts and adding the live-data channel. Tests assert actual columns and widths, equal card sizing, header alignment, centering and no horizontal content overflow. Each width/motion run also performs approve, reject and zone-status actions against isolated demo fixtures (six pending reports, three reviewed reports, six zones). No live records are modified.

Run `node scripts/admin-responsive-pass.mjs`; set `REQUIRE_LOCAL_FONTS=1` to assert real font faces are loaded as well.

## 2. Font loading — PASS; self-hosting adopted

Removed the Google Fonts stylesheet/preconnects from `index.html`. `src/main.tsx` now imports Latin-only CSS from:

- `@fontsource/bebas-neue`: 400.
- `@fontsource/space-grotesk`: 400, 500, 600, 700.
- `@fontsource/jetbrains-mono`: 400, 500, 700.

These are the existing families and weights, not a typography redesign. Vite fingerprints and serves the files on the app's own origin. The packages retain `font-display: swap` and WOFF fallbacks; the existing fallback stacks still apply while loading. Latin covers current English/Filipino copy and names with accents such as ñ. Additional writing systems would need matching subsets in a future translation pass.

All eight WOFF2 assets together total **131,500 bytes**; browsers fetch only the faces actually used and can cache the fingerprinted assets. Font binaries live in npm packages/build output, not Git. Three small dependencies and eight CSS imports replace the remote integration; no font download script or custom bundler logic is needed. Copyright notices and SIL OFL licenses ship under `public/font-licenses/`.

**Proof, not an assumption about connectivity:** the map/live-data browser test blocks every off-origin request, checks `document.fonts` for all three loaded families, and verifies font requests are same-origin. All eight width/motion runs passed. Admin and landing screenshots were regenerated with real fonts.

The earlier fallback captures were caused by blocked external font access in this sandbox. They were not evidence of a deployed typography defect. However, a Google CDN dependency can also fail for production visitors with filtering, outages or offline connections, so “zero production effect under all conditions” would not be supportable. Self-hosting removes that dependency for both environments.

## 3. Live-data ARIA audit and fix — PASS

### Existing semantics before this follow-up

| Surface | Before |
| --- | --- |
| Landing “Reading the water…” | `role="status"`, but only the loading branch |
| Map loading overlay | `role="status"`, `aria-live="polite"`, `aria-busy` |
| Zone-list and report-queue skeletons | `role="status"`, `aria-busy`, loading label |
| Toast `Notice` | `role="status"`, `aria-live="polite"` |
| Report-form success | `role="status"`, `aria-live="polite"` |
| Form/passcode errors | `role="alert"` |
| Landing live summary and all three figure values | **Missing live-update announcements** |
| Map legend counts and advisory gauge percentage/counts | **Missing** |
| Map sheet summary, advisory count, zone count and per-zone pending values | **Missing** |
| Popup per-zone pending values and status | **Missing** |
| Admin totals, pending tab badge, per-zone pending counts/status | **Missing** |

### Implementation

`LiveDataStatus` mounts one persistent, initially empty channel on each public page and the unlocked admin dashboard:

```html
<p role="status" aria-live="polite" aria-atomic="true"
   aria-label="Live coastal data" class="sr-only">…</p>
```

The **data has one announcement owner**, rather than putting independent live regions on each repeated visible copy. It announces zones watched, advisory/unconfirmed/safe totals, pending reports and advisory percentage. Admin includes total/reviewed reports. Subsequent messages include changed per-zone status/pending counts, including zero, additions/removals, and changes that leave aggregate totals unchanged. Thus the popup, compact/full sheet, legend, gauge and admin tabs are all covered by the same source updates without announcing them repeatedly.

The channel sits outside the map's fading chrome and remounting zone lists. Independent feed readiness prevents false zero announcements without delaying an available advisory behind a slow report feed. A 250ms debounce coalesces the report and zone snapshots of an approval. Timestamp/description-only updates do not repeat count announcements. The locked gate has no data channel.

`CountUp` keeps visual tween frames `aria-hidden`; a separate screen-reader span exposes the actual target value immediately. It does not independently announce animation ticks. The prior loading/form/notice semantics remain intact. These are not official BFAR alert announcements and do not change public guidance or automatically assert urgency.

**Tests:** nine dedicated announcement tests (stable empty mount, partial readiness, coalescing, contextual zone changes, zeros/removals, same-total changes, irrelevant updates, admin counts, cleanup); two CountUp accessibility tests; one route integration test. Real-browser map/report/approve checks verify updated text, a single polite/atomic data channel and its accessibility-tree representation. A manual NVDA/VoiceOver listening session was **not** performed; automated semantics tests cannot prove every browser/screen-reader speech combination.

## 4. Final validation — PASS

After all application changes:

- `npm run typecheck` — passed.
- `npm test` — **190 tests, 20 files passed** (12 new tests). Existing jsdom `scrollTo`/canvas and React act warnings remain; no failures.
- `npm run build` — passed; font assets emitted and licenses included.
- `git diff --check` — passed.
- Admin browser checks — **24/24 tab/width/motion combinations**, plus approval/rejection/status interactions.
- Landing browser checks — **8/8 width/motion combinations**, now with real fonts.
- Map/live-data browser checks — **8/8 width/motion combinations**. Full viewport sizing after route entry; six polygons; sheet peek → mid → full → peek; real Reset view click; zone focus and polygon popup; form submission; live pending announcement; admin approval; return to map with advisory count and final accessible status.

### Map regression discovery

Real pointer-action checks exposed a **pre-existing** header bug: the map header was `pointer-events-none`, but its right-side Reset/Admin action cluster had no `pointer-events-auto` override (only the brand link did). A one-line override in `Header` restores those controls. The regression test uses real clicks, not forced or synthetic dispatch. The map's layout, polygons, gestures, data logic and animation controller were not rewritten. `MapPage` only gains the shared live-data channel; global font loading is intentional.

Remote OSM tiles are unavailable in the sandbox and are deliberately blocked in the font/network test. Map geometry, controls, local polygons and the full demo workflow were verified, not the availability/appearance of the external tile service.

## Reproduce browser checks

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
# Second terminal; use a demo-backend build:
npx playwright install chromium
REQUIRE_LOCAL_FONTS=1 node scripts/admin-responsive-pass.mjs
node scripts/landing-responsive-pass.mjs
node scripts/live-data-map-pass.mjs
```

All scripts accept a base URL as their first argument and `CHROMIUM_EXECUTABLE_PATH` for an installed browser. `RESPONSIVE_OUTPUT_DIR` overrides their ignored `.cache/` output directories. The sandbox run used the existing unpacked Chromium and its local shared libraries. Screenshots and JSON measurements are kept outside Git; only scripts, documentation and small font license notices are tracked.
