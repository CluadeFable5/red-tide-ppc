# Design References & Stack Decisions

**Status:** ✅ **delivered.** The design/motion pass is implemented and open as PR #2
(`arena/01a09693-red-tide-ppc` → `main`). Sections 1–7 are the pre-build research this
document was written for; section 12 records what actually shipped and where it diverged
from the plan.

**Verified:** 2026-09-13
**Author:** design/motion agent (Arena session, branch `arena/01a09693-red-tide-ppc`)
**Scope:** visual design, layout, and motion layer only. No data, Firebase, or store changes.

---

## 1. Verification method

Outbound `curl` is blocked in the build sandbox (HTTP `000` on every external host),
so sources were verified by direct page fetch and web search rather than HTTP status
codes. Package versions were read from the live npm registry.

Two categories of claim appear below, and they are marked differently:

- **Verified** — confirmed by fetching the site/registry during this pass.
- **Unverified** — listed for completeness, not individually confirmed. Treat as
  needing a check before use.

---

## 2. Verified sources — approved for use

| Source | Status | What to take | Notes |
|---|---|---|---|
| [reactbits.dev](https://reactbits.dev) | Verified — 47.1K★, 165+ components | Text/UI animation, transitions | **No mandatory Framer Motion.** Ships 4 variants: JS/TS × CSS/Tailwind — use **Tailwind + TS**. Installed by copying source (shadcn CLI or jsrepo), so it adds **no runtime dependency**. |
| [motion.dev](https://motion.dev) | Verified — current, v13.2.0 | React enter/exit, layout, gestures | `npm i motion` → `import { motion } from "motion/react"`. `<AnimatePresence>` provides exit animations - covers popup close, modal dismissal, route change. **The only net-new runtime dependency.** |
| [animista.net](https://animista.net) | Verified | CSS `@keyframes` | Generates copy-paste CSS with easing/delay/duration controls. FreeBSD license. **Zero JS** — use for the advisory pulse and other ambient effects. |
| [uiverse.io](https://uiverse.io) | Verified — 7,440 elements | Buttons, cards, loaders, inputs | Copies as HTML/CSS, **Tailwind, React, or Figma**. Tags: `dark`, `minimal`, `loader`, `animated`, `hover`. Explicitly free for commercial use. |
| [hyperui.dev](https://hyperui.dev) | Verified | Application + marketing sections | Includes an in-browser **dark-mode variant generator** and typography scale tool. Good base for admin cards and dark form inputs. |
| [designspells.com](https://designspells.com) | Verified — active, 334 entries | Micro-interaction *reference only* | No code. Use for press/hover feedback details and form feedback patterns. |
| [footer.design](https://www.footer.design) | Verified — active | Footer layout *reference only* | No code. Curated gallery; low priority for this project. |

---

## 3. Rejected / corrected entries

Four items from the original reference list do not check out. Recorded so they are not
re-researched later.

| Entry | Finding | Action |
|---|---|---|
| `coconutui.com` | **No such library exists.** Only match is a 2012 Dribbble shot titled "Coconut UI Css". Almost certainly a misremembering of **Kokonut UI** (real, active, 100+ components). | Drop. Kokonut UI is Framer Motion–based and conflicts with the motion-only decision — do not substitute. |
| "backlit UI" | No results. Likely **Bklit UI** (real: shadcn-based chart components, uses Motion). | Drop. Charting does not map to any of the six target surfaces. |
| [Manus.ai](https://manus.ai) | An AI agent product. Not a UI or component library. | Drop — no code to pull. |
| [free-for.dev](https://free-for.dev) | A directory of free service tiers. | Drop — unrelated to styling. Possibly useful for infrastructure decisions later. |
| Animmaster Lib | Real (`animmasterlib.dev`) but **paid/proprietary** (PRO tier, pricing, refund policy) and only **~30% React** (60% plain HTML/CSS/JS). | Drop — incompatible with the no-new-dependency constraint and React-first requirement. |

### Manual-use tools — unverified

These are generators/assets, not code sources. Not individually verified; listed so the
categories are on record. Nothing here blocks the design pass.

- **Shaders/gradients:** shaders.com, Shadergradient.co, Haikei.app
- **Assets:** Iconsax.io, unDraw.co, ContentCore.xyz, Figcomponents.com, flectory.flecto.io
- **Color/easing:** Coolors.co, cubic-bezier.com
- **Output/optimization:** Squoosh.app, Shots.so, RealFaviconGenerator.net

---

## 4. Tailwind v4 caveat — read before pasting any snippet

**HyperUI and Uiverse snippets are overwhelmingly Tailwind v3–era.** Tailwind 4 moved
configuration into CSS (`@theme`) and changed a set of utility names. Copy-paste is
**not** drop-in.

This matters more than usual here: the app is near-black on near-black, so a silently
broken border or ring does not read as "unstyled" — it reads as invisible, and it will
look broken on a projector.

Renames most likely to bite:

| v3 snippet | v4 equivalent | Why it bites |
|---|---|---|
| `border` (no color) | needs explicit color | Default border color changed `gray-200` → `currentColor` |
| `ring` | `ring-3` for the old look | Default ring width changed 3px → 1px; use `ring-3` to reproduce v3 |
| bare `ring` color | needs explicit color | Default ring color changed `blue-500` → `currentColor` |
| `outline-none` | `outline-hidden` | `outline-none` now literally means `outline-style: none` |
| `shadow-sm` | `shadow-xs` | Full shadow scale shifted down one step |
| `shadow` | `shadow-sm` | as above |
| `drop-shadow-sm` | `drop-shadow-xs` | scale shift |
| `blur-sm` | `blur-xs` | scale shift |
| `backdrop-blur-sm` | `backdrop-blur-xs` | scale shift |
| `rounded-sm` | `rounded-xs` | radius scale shifted down one step |
| `bg-gradient-to-r` | `bg-linear-to-r` | gradient utilities renamed |
| `bg-opacity-50` | `bg-black/50` | opacity modifiers replaced the separate scale |
| `flex-shrink-0` / `flex-grow` | `shrink-0` / `grow` | renamed |
| `overflow-ellipsis` | `text-ellipsis` | renamed |

**Rule:** when pasting any v3-era snippet, translate it to `@theme` tokens rather than
hardcoding hex values. Hardcoded colors are what cause UI drift across surfaces.

---

## 5. Licensing

All approved sources are clear for this use:

| Source | License | Commercial use |
|---|---|---|
| react-bits | MIT + Commons Clause | ✅ Free for personal **and** commercial use. Restriction is only that you may not resell the library itself. |
| Uiverse | Free for personal and commercial use | ✅ |
| Animista | FreeBSD | ✅ |
| Motion | MIT | ✅ |

---

## 6. Stack versions observed

Read from the live npm registry on 2026-09-13. **These are "latest", not pins.**

> ⚠️ **Policy:** the build agent's `package.json` is authoritative. Match its pinned
> versions for React, Vite, Tailwind, TypeScript, etc. Do **not** independently install
> these latest majors. `motion` is the only net-new package; its peer range
> (`react: ^18 || ^19`) must be checked against the installed React before adding, and
> any peer conflict flagged rather than force-resolved.

| Package | Latest observed | Note |
|---|---|---|
| vite | 8.3.0 | |
| react / react-dom | 19.3.0 | Required by react-leaflet 5 |
| tailwindcss | 4.3.3 | v4 — CSS-first `@theme`, **no `tailwind.config.js`** |
| @tailwindcss/vite | 4.3.3 | Vite plugin replaces the PostCSS setup |
| motion | 13.2.0 | Peer: react ^18 \|\| ^19 |
| leaflet / react-leaflet | 1.9.4 / 5.0.0 | |
| zustand | 5.0.15 | |
| firebase | 12.19.0 | |
| typescript | 7.0.2 | |
| animejs | 4.5.0 | **Not used** — see §7 |

---

## 7. Animation approach

**Decision: `motion` only, plus CSS/Tailwind keyframes. No animejs, no second library.**

| Layer | Tool | Used for |
|---|---|---|
| React transitions | `motion` | Popup open/close, form modal entrance, route transitions, pin drop |
| Ambient effects | CSS `@keyframes` (Animista-sourced) | Status pulse/glow, hover and press states, loaders |

Rationale: ambient effects are pure CSS — zero JS overhead, and the browser compositor
handles them. `AnimatePresence` is the piece CSS cannot do well (coordinating unmount),
which is exactly what the popup, modal, and route changes need. Adding animejs on top
would duplicate capability already covered.

animejs v4 was checked but not adopted. Note for future reference: **v4 changed to a
named-export API and is not backwards-compatible with v3 examples** — most tutorials
online are v3 and will not run as written.

---

## 8. Per-surface plan

Reference sources mapped to the six target surfaces.

| # | Surface | Approach |
|---|---|---|
| 1 | Map framing + persistent status legend | Hand-built — no library has a map-shaped pattern. Animista keyframes for the legend swatch pulse. Legend is persistent UI, **not** a modal. |
| 2 | Zone popup | `motion` + `AnimatePresence` for enter/exit. Animista keyframes for the subtle glow/pulse on "advisory". Typography: zone name in Bebas Neue, status/timestamp in JetBrains Mono. |
| 3 | Report form | `motion` slide/fade entrance. Uiverse (`dark` + `loader` tags) for submit-button state changes. HyperUI dark inputs as a base, retokenized to `@theme`. |
| 4 | Admin pending-report cards | Uiverse/HyperUI card + button patterns restyled to amber. **Skip the neobrutalism sets** — wrong tone for this identity. Restrained motion only; admin is a repeated-use surface. |
| 5 | Loading state | Branded amber. Option A: hand-built skeleton (no deps). Option B: `thinking-orbs` (`npm i thinking-orbs`, zero deps, MIT, canvas, dark-mode aware) — better fit than a generic spinner, but it is a **second new dependency**, so it needs explicit sign-off. |
| 6 | Page transitions (map ↔ admin) | `motion` `AnimatePresence`, optionally `layoutId` for shared elements. |

Aceternity UI is technically usable but every component imports `framer-motion`; those
imports would need rewriting to `motion/react` per component. react-bits covers the same
ground with better ergonomics and no engine lock-in. **Not adopted.**

---

## 9. Design system

| Token | Value |
|---|---|
| Background | `#080808` near-black |
| Accent / CTA | `#f0a500` amber |
| Text | `#eaeaea` off-white |
| Display / headings | Bebas Neue |
| Body | Space Grotesk |
| Data / timestamps / technical labels | JetBrains Mono |

Tone: clean, minimal, mobile-first. Verify every surface at **~375px width first**, then
scale up. This gets demoed live on a phone in front of a panel.

---

## 10. File ownership boundary

Agreed split to prevent merge conflicts. **The build agent's files are read-only to the
design pass.**

**Design pass owns:**
- `src/styles/**` — tokens, `@theme`, keyframes
- `src/components/**` — all presentation
- `src/motion/**` — animation primitives
- `docs/**`

**Never touched by the design pass:**
- `src/lib/firebase.ts`
- `src/store.ts`
- `src/data/**`
- `src/hooks/**`

**The seam — the only contract that matters:** presentational components take data as
props and emit callbacks. A presentational component **never** imports `store.ts` or
Firebase directly. `ZonePopup` receives a zone object and an `onReport` callback; it does
not decide what a zone is.

This is what makes "do not break the zone-click → popup → report-form flow" structurally
guaranteed rather than something to police by hand: the design pass cannot alter data
flow it does not import.

---

## 11. Open decisions

1. **Loading state** — hand-built skeleton vs. `thinking-orbs` second dependency (§8).
2. **Branch naming** — the Arena session is pinned to `arena/01a09693-red-tide-ppc` and
   cannot create or push other branches. The working rule holds (never commit to `main`,
   open the PR from the session branch into `main`), so the only delta from the requested
   `design-pass` name is the branch label itself.

---

## 12. What shipped

Implemented across eight commits on `arena/01a09693-red-tide-ppc`, one per surface, each
verified with `typecheck` + `build` + `test` (66/66) before committing.

| Commit | Surface |
|---|---|
| `fe7d128` | Design tokens, typefaces, base dark theme |
| `d1bc1e6` | Map-first landing framing + persistent legend |
| `e89dcde` | Zone popup: entrance, status glow, type hierarchy |
| `f9159ba` | Report form: sheet entrance, submit/success states |
| `06468d2` | Admin review: queue, approve/reject affordances |
| `7c7f252` | Branded loading states |
| `62101f3` | Route cross-fade |
| `a9364bc` | Toast restyle + cleanup |

### Divergences from this plan

- **Pulse moved to `advisory`.** §8 assigned the attention pulse to the "advisory"
  state as briefed, and it stayed there. Only ONE status pulses — two animated states
  means neither reads as urgent.
- **`animejs` confirmed dropped.** CSS keyframes handled everything that needed a loop;
  `motion` handled everything that needed mount/unmount coordination. A second library
  would have been duplicative.
- **`thinking-orbs` not adopted.** The loading state is hand-built
  (`src/components/LoadingState.tsx`) with a self-drawing brand mark, avoiding the second
  dependency. Revisit only if a richer loader is wanted later.
- **react-bits not pulled.** Nothing in its catalogue mapped to a map/popup/admin surface;
  the value was in the reference list itself, not the components.
- **Leaflet popup close is not animated.** Leaflet removes the popup node synchronously in
  its own `onRemove`, so there is no frame to animate out in. Intercepting it means
  monkey-patching Leaflet, which is not worth the risk to the popup → report-form flow.
  Entrance is animated; close stays crisp. Documented in `ZonePopup.tsx`.
- **Route transitions are opacity-only.** Animating transform/filter on an ancestor of a
  live Leaflet map risks a mis-measured canvas. Opacity removes the hard cut without
  touching the map's coordinate space.

### New module in the design layer

`src/styles/statusTheme.ts` — dark-ground status colours derived from the semantic
source of truth in `src/lib/status.ts`, which was left untouched. Labels and guidance are
still read from `ZONE_STATUS_META`, so wording stays single-sourced while presentation is
themed.

⚠️ `StatusMeta.badgeClass` and `.softClass` in `src/lib/status.ts` now have **zero
consumers**. They are dead and light-theme (`bg-green-50` on a #080808 ground reads as a
bright blob) — safe to delete on the next touch of that file.

---

## 13. Map-first restructure: the three-anchor zone sheet (2026-09-13)

**Branch:** `arena/01a099a2-red-tide-ppc` → `main`
**Scope:** presentation only. `store.ts`, `firebase.ts`, `data/**` and `hooks/**` untouched; every
store call on the map page is unchanged. Verified with `npm run typecheck`, `npm run build` and
`npm test` (126 passed).

### 13.1 The problem this fixes

The map page stacked `map → legend → advisory banner → zone list` as vertical siblings. The map was
capped to a slice of the viewport (`h-[100svh] sm:h-[64vh]`) and the list started below the fold, so
the two things the page is for — the water and the zones — could never be seen at the same time.

The fix is not "make the map bigger". It is to stop treating the map and the data as siblings: the
map becomes the base layer of the viewport, and the data comes up **over** it as a sheet with three
resting states. That is the Google Maps shape, and it is a three-state pattern on purpose — two
states (open/closed) is a drawer, and a drawer has nothing to reveal *through*.

| Anchor | Visible | Content |
|---|---|---|
| peek | 14% | drag handle + one mono line: `6 zones · No advisories` |
| mid | 45% | advisory banner + zone cards, scrollable |
| full | 85% | the whole list, primer and demo notice; map recedes |

### 13.2 Research: what the pattern actually is

| Source | What was taken |
|---|---|
| [gorhom/react-native-bottom-sheet](https://github.com/gorhom/react-native-bottom-sheet) | The `animatedIndex` mechanic: **one** continuous shared value, `0 → snapPoints.length - 1`, which every consumer interpolates from. The underlay is not a second animation — it is the same index, read differently. |
| [`doveletter.dev` — Google Maps style sheet in Compose](https://doveletter.dev/articles/flexible-bottomsheet-google-maps) | Confirmation that the pattern is *three* visible states (`slightlyExpanded` / `intermediatelyExpanded` / `fullyExpanded`) plus non-modal, and that the map stays interactive behind it. Also the useful framing that the intermediate state exists for "quick details" — it is not just a waypoint. |
| Android `BottomSheetLayout` / `BaseViewTransformer` ([ThreePhasesBottomSheet](https://github.com/AndroidDeveloperLB/ThreePhasesBottomSheet)) | The recede is implemented as a *view transformer*: `transformView(translation, maxTranslation, peekedTranslation, parent, view)` computes the underlay transform from the sheet's live translation. Same idea as `animatedIndex`, older implementation. |
| [gorhom issue #314 / #767](https://github.com/gorhom/react-native-bottom-sheet/issues/314) | The concrete underlay recipe: `interpolate(animatedPosition, [0, 0.6, 1], [1, 0.9, 0.7])` style mapping, and the `[1, 0] → [0.5, 0]` backdrop opacity ramp. Our values are gentler (see 13.4). |
| [Turo — map + bottom sheet](https://medium.com/turo-engineering/adjusting-compose-google-map-while-bottom-sheet-moves-4a7465305137) | The non-modal discipline: the map must never be shrunk/re-measured on sheet movement (only its overlay padding changes). Applied here by animating the underlay on the **wrapper**, never on the map's own sizing. |

**Adapted, not adopted.** No `react-native`, no reanimated, no gesture-handler, no new dependency.
In React + `motion` the `animatedIndex` role is played by a `MotionValue<number>` derived from the
sheet's `y`; `useTransform` plays the role of `useAnimatedStyle`.

### 13.3 Mechanics

- **`src/motion/sheetAnchors.ts`** (pure, no DOM/motion imports) — offsets from ratios, clamping,
  `nearestAnchor`, `resolveSheetAnchor`, `nextSheetAnchor`, and the underlay mapping
  (`underlayProgress` 0 at peek → 1 at full, then scale / radius / veil / shadow).
- **`src/motion/readouts.ts`** (pure) — the peek copy, anchor readout, dominant status, advisory
  share, and the gauge's wave path. Copy is derived from counts, so pluralisation and the
  "no advisories" line are unit-tested rather than typed into JSX.
- **`src/motion/useZoneSheet.ts`** — owns the sheet's `y`, its anchor state, and the shared
  progress value. `dragListener={false}` + `useDragControls()` puts drag activation on the sheet
  **header only**; dragging the whole panel would fight the scroll region inside it. `dragMomentum`
  is `false` so exactly one animation ever writes `y`.
- **Snap on release velocity, not position.** `projected = clamp(offset) + velocity × 0.18s`, then
  nearest anchor. Above `|480 px/s|` the gesture is a deliberate flick and is guaranteed to advance
  at least one anchor in the direction it was thrown (clamped at both ends) — without that, a fast
  flick whose short projection still rounds to the starting anchor is silently swallowed, which is
  the classic "the sheet is stuck" bug. Branch coverage lives in `sheetAnchors.test.ts`.
- **Underlay** — one progress value drives `scale → 0.96`, `border-radius → 18px`, a veil over the
  map, and the opacity of an inset shadow the sheet casts up onto it. Continuous through a drag,
  because it is the same value the sheet itself is animating on.
- **Viewport geometry** is measured from the sheet element (`h-[100dvh]` + `ResizeObserver`), not
  from `window.innerHeight`, so mobile URL-bar collapse cannot leave the peek strip short.

### 13.4 Deliberate values, and the ones that were toned down

The reference recipes push the underlay hard (scale to 0.7, backdrop opacity to 0.7). Both are wrong
here: this is a **non-modal** sheet over a map people are actively reading, and a 30% shrink with a
70% scrim would make the map unusable at the moment it is the only thing on screen. Chosen instead:
scale 0.96, veil 0.34, radius 18px, plus an inset shadow. Enough to read as depth; not enough to
hide the coastline.

Chrome over the map (legend pills, gauge) fades out by progress 0.35 rather than being covered by the
sheet — floating UI should either be fully over the map or not on screen.

### 13.5 Differentiation pass

- **Status pips pop on change** (`scale: [1, 1.3, 1]`, `StatusPip.tsx`), in the legend chips, the
  zone cards and the sheet's summary. Triggered by a change to a status or a count, never on mount:
  a page-load pop on six rows says nothing about what changed. The continuous advisory ring stays
  CSS (`.animate-status-pulse`) so it runs on the compositor.
- **Zone cards stagger in** (`staggerChildren`) the first time the sheet leaves peek, via a one-shot
  list key. It is deliberately *once* — a list that re-animates every time it is scrolled back to is
  noise.
- **Polygon fill ramps instead of cutting.** `zonePaint()` in `styles/statusTheme.ts` defines a
  three-step fill (`0.26 → 0.40 → 0.52`); `.zone-path` in `index.css` transitions the SVG
  presentation attributes Leaflet writes. Browsers synthesise `mouseover` ahead of `click` on touch,
  so the tap lands on an already-lifting polygon and the popup opens onto it.
  **Honest limitation:** the popup itself is still opened by Leaflet's own click binding, so this
  ramps *into* the popup rather than gating it. Delaying it would mean unbinding and reopening the
  popup by hand, risking the zone-click → popup → report-form flow for a sub-200 ms effect.
- **Ambient motif — the advisory-signal gauge.** The water subject deserves better than decorative
  waves, and inventing tide predictions would be dishonest, so the gauge plots something the app
  actually holds: the share of zones under advisory. The trace is flat when nothing is flagged and
  rises with the share (two tiled copies, drifted −50% on a loop), and the mono readout carries
  `{advisory}/{zones} adv · {pending} pend`. It is labelled "advisory signal" — never "tide".
- **Register.** Registration marks on the map corners, a printed tick rail along the sheet's top
  edge, an anchor readout (`02 / 03`), zone document ids shown as machine tags
  (`HONDA-INNER · 3 days ago`) and a `PT` vertex count on card hover. Monospace for anything that is
  data; Bebas for anything that is a name.

### 13.6 Things this pass had to touch outside the design layer's own files

- `pages/MapPage.tsx` — the restructure itself (presentation only; store calls unchanged).
- `components/ReportForm.tsx` — modal `z-index` `1000 → 1030`. It had to move above the sheet
  (`1020`), otherwise the report form would have opened *behind* it. Layer order is now:
  loading overlay `1005` < map chrome `1010` < sheet `1020` < report modal `1030` < toast `1100`.
- `components/Map.tsx` — `attributionControl={false}`. The OSM attribution control is pinned
  bottom-right, which is underneath the sheet at every anchor, and attribution is a licence
  requirement. It now sits in the sheet's always-visible row, with the rest of the caveats.

### 13.7 What the browser pass changed

The pass ran in real Chromium (375×667 touch emulation, 1280×800, 390×844) with tiles and webfonts
served locally. Four things it caught that reasoning had not:

- **Half-cut headline at the peek edge.** At `translateY(660)` the sheet's top edge sliced the
  "No advisories recorded right now" heading mid-line, which reads as a broken crop rather than as
  content continuing below. The body is now driven by the *same* progress value as the underlay
  (`useTransform(progress, [0, 0.12], [0, 1])`) and is fully transparent at peek — content stays in
  the DOM, so screen readers still get it, but nothing is visibly clipped.
- **The mid anchor showed nothing readable.** Cards could not fit twice in a ~300px sheet, so the
  briefed "advisory headline + a couple of zones" was not true at mid: one card and no headline. Mid
  is now a *scan* stop (headline + one-line zone rows with status, pending count and a report
  action — two rows fully visible at 375px) and full is the *read* stop (description, polygon size,
  timestamps). Exactly one copy of every string is rendered, chosen by the anchor.
- **The press ramp did not exist on touch.** Leaflet's container binds mouse events only, so a tap
  reaches the layer as a mouseover/mousedown/click burst at `touchend` — measured here as touchdown
  at t≈18ms and the first layer event at t≈131ms, with the popup opening at t≈125–146ms. The ramp
  therefore played *underneath* the popup, which is precisely the "instant cut" the design was
  supposed to avoid. `ZonePressFeedback` now lights the polygon from the native `pointerdown`
  (capture-phase, delegated, released on pointerup/cancel or after 10px of travel so a pan does not
  leave a zone lit). Measured after the fix: the fill is at 0.42 of the 0.22 → 0.44 ramp while the
  finger is still down, with 8 interpolated values before the popup paints.
- **Keyboard users were locked out of the handle.** The drag-tail guard swallowed *every* click
  after a drag, including `Enter` on the focused button. It is now `isDragTail(didDrag, detail)` —
  pointer clicks (`detail !== 0`) are still suppressed, keyboard/AT activation is not.

Also confirmed rather than assumed: `:active` is not usable for the press cue (Chrome withholds it
until the tap is recognised, i.e. until `touchend` — the same 113ms that was missing), the map keeps
its 1280×800 layout box while the wrapper scales to 0.96 (so Leaflet never re-measures), a polygon's
`isPointInFill` point still resolves to its own `<path>` while scaled, and a 180px flick commits one
anchor with the spring arriving in ~350ms and no overshoot in either direction.

### 13.8 Not verified here

Cross-browser only. Everything above is Chromium (153, headless shell, touch emulation); Safari's
`touchend`-relative ordering of the synthesised mouse burst and its `:active` timing are untested, so
the press cue's *lead time* on iOS is an assumption even though the mechanism (native `pointerdown`)
is not. Real-device inertia on the sheet's spring, and screen-reader announcement of the anchor
change, are also untouched by this pass.

---

## 14. Pre-map landing page, lazy map, and the zone-path production fix (2026-09-13)

**Branch:** `arena/01a09a09-red-tide-ppc` → `main`
**Scope:** a new route `/` (landing), the map moves to `/map` and becomes lazy-loaded,
`/admin` unchanged. Plus a production bug fix in `Map.tsx` and its regression test.

### 14.1 The landing page (`/`)

A map-first app that opens on a map has a first-load cost problem and a message
problem: the heaviest code (Leaflet) is paid for by a visitor who may leave after
glancing, and a bare map says "here is water" but not "here is why you should care."
The landing page fixes both.

**Three reactbits-inspired pieces**, hand-rolled to the existing tokens so no new
runtime dependency is added (reactbits is copy-source, per §2):

| Piece | File | What it does |
|---|---|---|
| `DecryptedText` hero | `components/DecryptedText.tsx` | The "RED TIDE" headline starts as a field of random glyphs and locks into the real letters, left to right, over ~600 ms. A final-width placeholder (`invisible`) reserves the exact box so the scramble never reflows. `aria-label` sits on the `<h1>`; the scramble is `aria-hidden`. Respects `prefers-reduced-motion` (renders the finished string). |
| `Waves` canvas background | `components/Waves.tsx` | Three overlaid sine composites (two amber, one advisory-red, low alpha) drift at different speeds. `requestAnimationFrame`, DPR-scaled, `ResizeObserver`-tracked, paused on `document.hidden`, still frame under reduced motion. `aria-hidden`, `pointer-events-none`. |
| `CountUp` figures | `components/CountUp.tsx` | Counts from the currently-shown value to `to` with an ease-out, starting when the figure first enters the viewport (`IntersectionObserver`). When a **live** figure's target changes it re-tweens from where it is — a jump would read as a glitch. `tabular-nums` so digits don't wobble the layout. |

**Live, not brochure.** Every figure is fed from the same feeds the map uses
(zones watched, pending reports, under advisory, plus a static "30 min to first
symptoms" from the PSP primer). The landing is therefore a *readout*, and that is
exactly why Firebase ships with it — see §14.3.

### 14.2 Lazy map, and the bundle numbers

`MapPage` (the whole Leaflet tree) is now `React.lazy` behind `/map`. The `leaflet`
and `firebase` code was *already* split into their own shared chunks by
`vite.config`'s `manualChunks`, so lazy-loading the page only moves the page's own
code out of the initial chunk — it does **not** re-merge the vendor libs.

`vite build` output (gzipped), before → after:

| Chunk | Before | After | Note |
|---|---|---|---|
| `index` (app) | 21.6 kB | 16.7 kB | landing replaces the eager map page |
| `MapPage` (new) | — | 10.6 kB | loaded only on `/map` |
| `firebase` | 135.2 kB | 135.2 kB | unchanged — see §14.3 |
| `vendor` | 108.8 kB | 108.8 kB | unchanged |
| `leaflet` | 48.7 kB | 48.7 kB | unchanged, still shared |
| `router` | 14.1 kB | 14.1 kB | unchanged |

Net: a visitor landing on `/` no longer pulls the map-page code, and the initial
app chunk shrank by ~5 kB gz. The win is small in absolute terms *because the heavy
libs were already chunked* — the real effect is that `/` and `/admin` mount
without touching Leaflet at all, and the map's parse cost is deferred until it is
actually asked for.

### 14.3 Open item — Firebase is *not* deferred

**The 135.2 kB `firebase` chunk is deliberately loaded on the landing page.** It is
the largest single chunk and the obvious candidate for `React.lazy`, but deferring
it would be wrong here for three compounding reasons:

1. **The landing is live.** Its figures read the same Firestore feeds the map does.
   If Firebase were deferred to `/map`, the landing would either show zeros/stale
   numbers (dishonest on a *safety* surface) or have to open its own subscription
   and then tear it down and reopen it on navigation — re-subscribing a realtime
   feed twice in the life of one visit, for no user-facing benefit.
2. **`App` already initialises the feeds once for the whole app** (a single
   `useEffect` at the root). That one subscription serves the landing *and* the map
   and the admin. Splitting it per-route to save the initial download would
   duplicate the realtime connection and re-introduce exactly the double-subscribe
   race the single root init exists to avoid.
3. **It is not a cold cost the user feels.** The chunk is a cached, versioned asset;
   the first-visit cost is one fetch, and the app's entire purpose is realtime.
   Trading a one-time ~135 kB download for a landing that lies about the current
   advisory state is a bad trade on a tool that exists to say "the water is bad
   *right now*."

Revisit only if the landing stops showing live data, or Firebase is replaced with a
lighter transport. Until then: leave it in the initial bundle.

### 14.4 The `zone-path` production bug, found and fixed

**Symptom:** the polygon press/hover fill ramp and the `--selected` press exemption
(§13.5) worked in dev but silently did nothing in a production build — the
`path.zone-path` CSS selector never matched, because the class was never on the
`<path>` in prod.

**Root cause:** the class was passed inside `pathOptions`. react-leaflet applies
`pathOptions` via `layer.setStyle(...)`, and Leaflet's `setStyle` writes only the
stroke/fill *presentation attributes* — it never touches the SVG element's `class`.
Leaflet reads `options.className` exactly **once**, in the SVG renderer's
`_initPath`, when the path node is created as the layer is added to the map. So:

- **dev (StrictMode):** effects run twice. The first pass stores `className` on the
  layer's options via `setStyle`; the strict re-add re-runs `_initPath`, which reads
  `options.className` *that time* and applies it. The class appears.
- **prod (single pass):** `setStyle` stores `className` on options, but `_initPath`
  already ran *before* that, when options had no class. Nothing ever re-applies it.
  The class is absent. The ramp, the press cue and the `--selected` exemption all
  depend on that class, so all of it died.

**Fix (`Map.tsx`):**
- `className="zone-path"` is now a **top-level** (constructor) prop, so Leaflet's
  `_initPath` applies it at creation in every environment, dev or prod.
- The `--selected` modifier, which changes over the layer's life, is synced
  **imperatively**: a `useRef` to the `LeafletPolygon`, and an effect that toggles
  `zone-path--selected` on `layer.getElement()`. A `layer.on('add', …)` subscription
  covers the first application (children's effects commit before `MapContainer`
  finishes adding the layer, so the plain effect alone would race it).
- The press-feedback `instanceof SVGPathElement` check was replaced with a
  namespace/tag duck-typed guard (`isZonePath`) — `SVGPathElement` is not defined on
  `window` in jsdom, where the regression tests run.

**Regression test (`Map.test.tsx`, 6):** renders `<Map>` the way production does —
one pass, no StrictMode — and asserts the class is actually on the path node, that
`--selected` is applied on first mount for a pre-selected zone, that it moves when
selection changes, that the fill-ramp attribute follows selection, and that the
press class lights on `pointerdown` and releases on `pointerup` (and never dims an
already-selected polygon). This is the test that fails against the old
`pathOptions.className` code.

### 14.5 The six-item browser pass, now in two halves

The visual checklist (peek row, drag/flick anchors, polygon fill ramp, attribution
legibility, zoom-control clearance, report → approve E2E) previously lived in
throwaway debug scripts. It is now split deliberately:

- **`scripts/final-pass.mjs`** — the script of record, run in **real Chromium**
  (desktop 1280×800 + mobile 375×667 touch) against the **production** build. This
  is the only half that can prove geometry and motion: bounding-box clearance,
  computed fill-opacity mid-ramp, a real flick's release velocity, and the E2E loop
  through a real browser. `node scripts/final-pass.mjs` → 6/6, exit 0.
- **`src/pages/mapPass.test.tsx`** — the DOM/behaviour half of the same six items,
  in **jsdom**, in CI. It proves what a DOM without a layout engine can prove:
  peek-row content and the hidden body, anchor cycling, the `zone-path` ramp
  attributes, attribution, zoom-control placement, and the full loop through the
  demo backend. So the checklist has executable coverage even in a sandbox with no
  browser at all.

The flick-velocity projection itself is pure logic in `sheetAnchors.test.ts` (§13).

**Honest limitation:** `final-pass.mjs` runs Chromium only. The two halves agree on
*what* to check, but a sandbox without a real browser can only run the jsdom half —
the geometry/motion assertions then ride on the last real-browser run, not on CI.

---

## 15. Landing motion pass: BlurText + a contained Ferrofluid hero (2026-09-14)

**Branch:** `arena/01a09e59-red-tide-ppc`
**Scope:** the landing page (`/`) only. `/map` and `/admin` untouched; `store.ts`,
`firebase.ts`, `data/` and `hooks/` untouched. Two more reactbits pieces, one of
which breaks a standing constraint on purpose — see §15.2.

### 15.1 `BlurText` — text reveal on scroll

`components/BlurText.tsx`, after reactbits.dev `BlurText` (MIT + Commons Clause).
Words (or letters) start blurred, transparent and offset, and resolve to sharp.
Its only dependency is `motion`, already in the tree — **no new dependency.**

Applied to, and only to:

| Block | Mode | Why |
|---|---|---|
| "Community early warning" eyebrow | `letters`, 14 ms | Short label; letter-by-letter reads better at 12 px than three word-blocks. |
| Hero subheading | `words`, 55 ms, `direction="top"` | The brief's headline treatment. |
| "How it works" `<h2>` + its three items | `words`, 18 ms | Each item carries a slightly deeper `rootMargin` than the one above it, so the list resolves top-to-bottom. |

**The headline keeps `DecryptedText`.** The two are competing treatments for the
same `<h1>`; the scramble is the established identity and it already handles
reduced motion and the small-viewport skip. BlurText picks up everything around it.

**Staggering is per-block, not one timeline.** Each `BlurText` owns its own
`IntersectionObserver`, so nothing below the fold fires at page load — the eyebrow
and subheading resolve on arrival, "How it works" resolves when you scroll to it.

**Type tokens are unchanged:** Bebas Neue on the `<h1>` (`font-display`), Space
Grotesk for body copy (the `<body>` default), JetBrains Mono for the stat readouts
(untouched — the figures are `CountUp`, not `BlurText`). No copy was reworded;
`landingMotion.test.tsx` asserts the exact strings.

#### Two deliberate divergences from upstream

1. **Words are joined by a real space, not `U+00A0`.** Upstream appends a
   non-breaking space *inside* each word span. That is invisible on reactbits'
   own demo because its root is `flex flex-wrap`, but this component renders into
   ordinary headings and list items — and a paragraph of NBSP-joined words is a
   single unbreakable run that blows through `max-w-md` instead of wrapping. Caught
   by the test suite while writing it; pinned by a regression test.
2. **The root is a `<span>` by default (`as` prop), not a `<p>`.** Upstream hard-codes
   `<p>`, which is invalid inside `<h2>` and `<li>`.

#### The copy can never be stranded invisible

This animates from `opacity: 0` on a public-health page, so every failure path ends
with the plain string on screen:

- `prefers-reduced-motion` → static text, **no motion nodes mounted at all**.
- No `IntersectionObserver` (old Android, bots, reader mode, jsdom) → treated as
  already in view, so it reveals immediately rather than never.
- Observer installed but never fires → a 4 s failsafe reveals it anyway.

And the genuinely safety-critical text is **not routed through this component**:
both CTAs, the "what is red tide" PSP primer, the `DemoBanner`, and the
"not an official BFAR advisory" disclaimer are plain, unanimated DOM.
`landingMotion.test.tsx` enforces that as a standing rule.

### 15.2 `Ferrofluid` — the WebGL exception, and what it cost

`components/ferrofluid/Ferrofluid.tsx` + `components/HeroBackdrop.tsx`, after
reactbits.dev `Ferrofluid`. **This adds `ogl` (WebGL) — a new runtime dependency,
and a direct contradiction of this project's "no WebGL / canvas-heavy effects"
rule** (rural connectivity, low-end Android). It was authorised for the landing
hero only, conditional on the mitigations below. It is **not** full-page, and
nothing behind "How it works" or the stat cards.

**Colours are the app's own tokens** — `['#f0a500', '#eaeaea', '#080808']`, amber
and off-white on near-black — not the component's default indigo/cyan.

#### Mitigations, all of them in `HeroBackdrop`

| Mitigation | Implementation |
|---|---|
| **Reduced motion mounts no WebGL** | The `React.lazy` import is never reached, so `ogl` is never fetched and no GL context is ever created. A static amber radial gradient is the entire backdrop. Not a paused canvas — a hard skip. |
| **`dpr={1}`** | Not `devicePixelRatio`. Fragments scale with the square of DPR, so on a DPR-3 phone this is a ~9× reduction in shading work. The effect is a soft glow; 1× is indistinguishable. |
| **Paused off-screen** | `IntersectionObserver` on the hero cancels the rAF loop. Scrolling the rest of the page does zero GL work. |
| **Paused on `document.hidden`** | Backgrounded tab renders nothing. |
| **No mouse interaction** | `mouseInteraction={false}` — also removes a `pointermove` handler from the main thread during scroll. |
| **Lazy-loaded** | Own chunk behind `Suspense`; the page paints without it. |
| **Deferred to idle** | `requestIdleCallback` (1.2 s timeout fallback) gates the import, so it never competes with first paint or the Firestore subscription. A visitor who scrolls straight past never downloads it at all. |
| **`antialias: false`** | MSAA buys nothing on a soft glow and costs real fill rate. |
| **Contained** | Sized by the hero `<section>`, with a `to-ink` gradient at its bottom edge. The existing `Waves` canvas is masked out across the top of the page, so exactly one animated layer ever repaints a given band. |

#### Two fixes to the vendored source

1. **`paused` no longer re-creates the GL context.** Upstream lists `paused` in the
   effect's dependency array — so every pause/resume tears down the renderer,
   program, geometry and canvas and builds a new one. Since this component pauses on
   *every* scroll-out and tab-blur, that would mean repeated WebGL context churn,
   the single most expensive thing a page can do to a mobile GPU. `paused` now lives
   in a ref driving a start/stop pair. Also added: `WEBGL_lose_context` on unmount
   (browsers cap live contexts and the router remounts this), and `try/catch` around
   context creation, shader link and `render()` so a device without WebGL falls back
   to the gradient instead of throwing.
2. **`colors` is compared by value, not array identity** — upstream rebuilds the
   entire scene on every parent render unless the caller memoises.

### 15.3 Bundle cost — measured, `npm run build`, gzipped

The first build regressed the initial load: `vite.config.ts`'s `manualChunks` was
sweeping `ogl` into the eager `vendor` chunk, which **downloads it on every visit
and makes the lazy boundary a lie** — `vendor` went 108.78 → 121.49 kB gz. The
config now explicitly returns `undefined` for `ogl` so rollup keeps it in the
dynamic chunk. Numbers below are after that fix.

| Chunk (gz) | Before | After | Δ |
|---|---|---|---|
| `index` (app JS) | 16.15 kB | 17.37 kB | **+1.22 kB** (BlurText + HeroBackdrop) |
| `index` CSS | 10.89 kB | 11.13 kB | **+0.24 kB** |
| `vendor` | 108.78 kB | 108.78 kB | unchanged ✅ |
| `firebase` | 135.20 kB | 135.20 kB | unchanged |
| `leaflet` | 48.68 kB | 48.68 kB | unchanged |
| `router` | 14.10 kB | 14.10 kB | unchanged |
| **Initial load total** | **340.52 kB** | **341.98 kB** | **+1.46 kB gz (+0.43%)** |
| `Ferrofluid` (new, **deferred**) | — | 15.86 kB | not in the initial load |

**Verified not preloaded:** the built `index.html` contains no reference to the
Ferrofluid chunk — it is fetched only after idle, and only if the hero is on screen.

**On a ~400 kbit/s rural 3G link (~50 kB/s):** the initial-load delta is **~29 ms**,
which is not meaningful. The 15.86 kB shader chunk would be ~317 ms — which is
exactly why it is lazy, idle-gated and visibility-gated rather than part of the
initial payload. It never blocks the page from rendering, and users on reduced
motion or who scroll past the hero never pay it at all.

### 15.4 Verification

`npm run typecheck`, `npm test` (**165 passing, 16 files**) and `npm run build` are
all green. Routing confirmed unchanged: `App.test.tsx`'s existing walk still goes
`/` → `/map` → report → `/admin` → approve → back to the map.

New tests:

- **`BlurText.test.tsx`** (7) — the three no-strand paths (reduced motion, no
  `IntersectionObserver`, observer-never-fires failsafe), the accessible label,
  per-block observation, and the line-wrap regression from §15.1.
- **`HeroBackdrop.test.tsx`** (4) — the decisive one being that under
  `prefers-reduced-motion` the Ferrofluid module's **import count is 0**: not
  merely "no canvas rendered", but the chunk was never even requested, so no GL
  context can exist. Plus: off-screen hero does not import it either, the gradient
  is always painted, and the canvas does mount when visible + idle.
- **`landingMotion.test.tsx`** (6) — the safety guardrail: both CTAs present with
  working hrefs, the BFAR disclaimer present and containing zero animated spans,
  the PSP primer plain, and all animated copy byte-identical to what shipped.

**Not verified here:** the same sandbox limitation as §13.8 and §1 — Playwright's
browser CDN is unreachable, so there is no real-Chromium run of this pass. Every
claim above about *observable GPU cost* (the DPR-1 fill-rate saving, frame timing,
the pause actually landing on a real compositor) is reasoned from the code and the
shader, not measured on a device. The reduced-motion and lazy-load claims *are*
mechanically verified, because they are import-graph facts rather than rendering
facts. **Before this ships to real users on real phones, run it on one.**

---

## 16. §15 verified in a real browser — and the three bugs it found (2026-09-14)

**Branch:** `arena/01a09e59-red-tide-ppc`
**Script:** `scripts/hero-pass.mjs` (+ `scripts/png-analyse.mjs`)
**Shots:** `docs/hero-pass-shots/`

§15.4 closed with an explicit debt: the WebGL mitigations were argued from the
shader source and the import graph, never measured. Playwright's browser CDN is
blocked here, so the gap stood. This section closes it.

### 16.1 Getting a real browser without adding a dependency

`@sparticuz/chromium` + `puppeteer-core`, installed in `~/qa-tools` — **outside
the repo**, so `package.json` is untouched. Two obstacles worth recording:

- The npm-shipped binary needs `libnss3`/`libnspr4`, absent here, and
  `deb.debian.org` is unreachable. `@sparticuz/chromium` **ships them itself**
  in `bin/al2023.tar.br`; extracting that and setting `LD_LIBRARY_PATH` is
  enough.
- `chromium.graphicsMode = true` is required, otherwise the bundled args include
  `--disable-gpu` and there is no WebGL to test.

Result: real Chromium **153.0.8010.0**, WebGL via **ANGLE/SwiftShader**.

> **SwiftShader is a CPU rasteriser.** Absolute fps below is a software floor,
> not a phone number. Relative and boolean facts (does it mount, does it stop,
> does it wrap) transfer; absolute GPU cost does not.

### 16.2 Results — 6/6, after fixes

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Canvas mounts normally; none under reduced motion | **PASS** | normal: 1 WebGL context, 1 `Ferrofluid` chunk request, canvas 672×490. reduced: **0 contexts, 0 chunk requests**, static gradient present, 1 canvas on the page (Waves only) |
| 2 | Frame cost at dpr=1, throttled | **PASS** | control (no canvas) **60.0 fps**; shader unthrottled 11.5 fps / 11.5 draws·s⁻¹; CPU 4× 8.4 fps; CPU 6× 8.3 fps. Marginal shader cost **+70.4 ms/frame** on a CPU rasteriser |
| 3 | Pause on scroll-out and tab-hidden | **PASS** | draw calls per 1500 ms — desktop **13 → 0** out of view, **0** hidden, 15 on return; phone **34 → 0**, **0**, 33 |
| 4 | DecryptedText → BlurText ordering | **PASS** | h1 resolves at **350 ms**, subheading opaque at **600 ms**, list stays **0.00** through 3200 ms without scrolling, **1.00** after |
| 5 | Word-wrap fix | **PASS** | at 360 px: 17 word spans over **3 lines** (tops 284/310/336), no U+00A0, `scrollWidth == clientWidth` |
| 6 | No seam at the hero boundary | **PASS** | gutter scan max jump 2.66/255; across the hero bottom 1.93/255; **side edges 0.54/255** (was 11.17) |

### 16.3 Three real bugs, none of which the unit tests could see

**(a) The off-screen pause never fired on desktop.** `HeroBackdrop` used
`rootMargin: '100px'`. The landing page at 1280×800 has only ~537 px of scroll,
so a fully scrolled-away hero still sits at `bottom = -88px` — inside the 100 px
margin. The observer therefore never reported it hidden and **the shader ran for
the entire visit on desktop**: measured 13 draws/1.5 s scrolled out, identical to
visible. The single most important mitigation was inert on the most common
desktop size. Now `rootMargin: '0px'` → 0 draws. The canvas holds its last frame
while paused, so resuming is not a pop.

**(b) The BlurText failsafe was cancelling the scroll stagger.** The flat 4 s
timer from §15.1 fired on blocks that were still below the fold: "How it works"
measured `opacity: 1.00` at t=3200 ms **without ever being scrolled to**. A
reader lingering on the hero arrived to find the list already revealed.

The first fix — gate the timer on "is any part of the element in the viewport" —
was *also* wrong, and the browser caught that too: at 1280×800 the first list
item peeks 46 px into the viewport at rest, but the observer is configured
`threshold: 0.2` with a negative bottom `rootMargin`, so it is *correct* for it
not to have fired. The naive check overrode a perfectly healthy observer.

The rule now: **the failsafe catches an observer that is broken, not one that is
waiting.** A real `IntersectionObserver` always delivers an initial callback; if
any callback has ever arrived the backstop disarms permanently and the
threshold/rootMargin contract is left alone. Only total silence *plus* the
element genuinely being on screen triggers a reveal. The unit-test fake was
updated to deliver that initial callback, because the old fake was simulating a
*dead* observer and so could never have caught this.

**(c) The hero backdrop had a hard vertical edge.** Found by *looking at the
screenshot*, not by the scan — item 6's original strip ran vertically down the
page gutter, which structurally cannot see a vertical boundary. The backdrop is
only as wide as the content column, so its left edge was an **11.17/255**
luminance step at x=304: a visible lighter rectangle behind the headline. (The
`-inset-x-4` passed via `className` never applied — `inset-0` is hard-coded on
the same element and wins.) Fixed with a two-pass intersected feather mask
(horizontal 18%/82%, vertical to 62%), which also subsumes the old bottom-fade
div. Side-edge jump now **0.54/255**. Item 6 now scans horizontally too.

### 16.4 What is still not proven

- **Absolute GPU cost on a real device.** SwiftShader says the shader dominates
  a CPU rasteriser; it cannot say what a Mali/Adreno phone does. The mitigations
  are now *verified to engage*, which is the part that was in doubt — but the
  "is 1 dpr cheap enough on a ₱4,000 Android" question still needs hardware.
  For reference, scaling the backing store on this rasteriser: dpr 1 → 87.7 ms,
  0.75 → 70.5 ms, 0.5 → 58.7 ms, 0.35 → 48.5 ms per frame. Sub-linear, so the
  fixed per-frame overhead dominates — dropping dpr below 1 buys less than the
  fragment count suggests.
- **Safari/iOS.** Chromium only, as in §13.8. `mask-composite` has a `-webkit-`
  fallback in place but is unverified there.
- **Real 3G.** The lazy/idle-gated chunk boundary is confirmed by request
  counts, not by a throttled-network trace.

---

## 17. Mobile spacing pass on the landing page (2026-09-14)

**Branch:** `arena/01a09e59-red-tide-ppc`
**Scope:** spacing utilities only on `pages/Landing.tsx` and `components/Header.tsx`.
No copy added, removed, reworded or shortened. No routing change.
**Script:** `scripts/spacing-pass.mjs` · **Shots:** `docs/mobile-spacing-shots/`

### 17.1 Responsive-strategy audit (the "confirm, don't rebuild" check)

Asked first, before touching anything: is this app adapting with CSS, or with
device-detection JS?

| Checked for | Result |
|---|---|
| `userAgent` / `navigator.platform` / `navigator.vendor` / `maxTouchPoints` | **none** |
| `isMobile` / `isTablet` / `isPhone` / `isDesktop` flags | **none** |
| `window.innerWidth`-driven *conditional rendering* | **none** |
| Tailwind responsive utilities | yes — `sm:` throughout, no JS branch |

**Verdict: already CSS-only. Nothing was rebuilt.** The layout is pure Tailwind
breakpoints and the changes below are additional spacing utilities.

Three `window`/`matchMedia` reads do exist, and all three are legitimately
*behavioural*, not layout:

- `Waves.tsx` / `Ferrofluid.tsx` — canvas backing-store sizing. Has to be JS; a
  canvas cannot size its own drawing buffer from CSS.
- `BlurText.tsx` — `getBoundingClientRect` in the observer backstop (§16.3b).
  Behaviour, not layout.

**One thing worth flagging, not fixed here:** `DecryptedText.tsx` hard-codes
`window.matchMedia('(max-width: 640px)')` to skip the scramble on phones. That
is a real JS breakpoint and it duplicates Tailwind's `sm` (40rem) — if the theme
ever retunes that breakpoint the two silently disagree. It is *not* layout
(it gates an animation, and the text renders identically either way), so it is
out of scope for a spacing pass, but it is the one maintenance trap in the file
set and should be moved to a `matchMedia` on a shared token or a CSS-driven
signal when that file is next touched.

### 17.2 What changed

A `min-[400px]:` step was introduced alongside `sm:` so the very narrow phones
get their own treatment rather than inheriting the desktop-ish defaults.

| Surface | Before → after (mobile) |
|---|---|
| Page gutter (`main`) | `px-4` (16px) → `px-5` (20px), `px-6` from 400px |
| Header gutter | `px-4` → `px-5`, `px-6` from 400px — now aligns with the body column |
| Header action gap | `gap-2` (8px) → `gap-2`/`gap-2.5` (8→10px at 400px) |
| Header nav tap targets | 29px tall → **33px** (`py-1.5` → `py-2`) |
| Header → hero | `pt-14` (56px) → `pt-20` (80px) |
| Eyebrow → headline | `mt-3` → `mt-4` |
| Headline → subheading | `mt-4` (16px) → `mt-5` (20px) |
| Subheading → CTA row | `mt-8` (32px) → `mt-10` (40px) |
| CTA wrap gap | `gap-y-3` → `gap-y-4` |
| CTA → live readout | `mt-12` (48px) → `mt-14` (56px) |
| Stat card padding | `py-2.5` → `py-3`; grid `gap-2` → `gap-2.5` |
| Section gaps | `mt-12` → `mt-14` |
| List item spacing | `space-y-2.5` (10px) → `space-y-3.5` (14px) |
| Bullet gutter | `gap-2.5` → `gap-3` |
| Footer | `py-6` → `py-7`, `gap-1.5` → `gap-2` |

**Everything above `sm` is explicitly pinned to its previous value** (`sm:mt-3`,
`sm:py-2.5`, `sm:space-y-2.5`, …), so the desktop layout verified in §16 is
byte-for-byte unchanged — confirmed by measurement, see 17.4.

### 17.3 Two regressions I introduced and then fixed

Recorded because both were only visible in a screenshot, not in the numbers.

**(a) `flex-wrap` on the header cluster made things worse.** The brief suggested
wrapping at very narrow widths rather than squeezing. Tried it; measured it;
reverted it. The cluster (DEMO + ADMIN + MAP) is wider than the space left after
the brand, so it wrapped MAP onto its own line, took the header from **53px to
97px (three rows)**, and *still* truncated the brand to "PUERTO PRINCESA,…". A
sticky bar that eats 97px of a 780px phone viewport is a worse outcome than a
tight gap. Kept `shrink-0` on one line instead.

**(b) The brand truncated to "Red …" at 360px.** After widening the nav buttons,
the cluster took 187px of the 320px usable width, leaving 80px for a title that
needs 93px. Fixed by making the *eyebrow* yield instead of the product name:
`hidden min-[380px]:block`, plus slightly tighter nav padding/tracking below
400px (cluster 187px → **171px**). "Red Tide" now renders in full at 360px, and
the eyebrow returns at 380px+ where there is room for both.

### 17.4 Measured, in real Chromium

`scripts/spacing-pass.mjs`, production build, same harness as §16.

| Metric | 360px | 390px | 768px | 1280px |
|---|---|---|---|---|
| side padding L/R | 20/20 | 20/20 | 48/48 | 304/304 |
| header height | 54 | 54 | 54 | 54 |
| header → eyebrow | 80 | 80 | 96 | 96 |
| headline → subheading | 20 | 20 | 16 | 16 |
| subheading → CTA | 40 | 40 | 32 | 32 |
| CTA → live readout | 56 | 56 | 64 | 64 |
| list item gap | 14 | 14 | 10 | 10 |
| nav gap / tap height | 8 / 33 | 8 / 33 | 10 / 33 | 10 / 33 |
| **horizontal scroll** | **none** | **none** | **none** | **none** |
| **element overflow** | **none** | **none** | **none** | **none** |

768px and 1280px are identical to the pre-change values — the desktop pass in
§16 still holds. Brand truncation: **false at every width**.

Shared-`Header` regression check (it is also used by `/admin` and `/map`):
`/admin` 360px header 53px, `/map` 360px overlay header 76px, `/admin` 1280px
54px — no truncation, no horizontal scroll, passcode gate and Leaflet both
still mount.

`npm run typecheck`, `npm test` (167 passing) and `npm run build` all green.

---

## 18. One breakpoint, one source of truth (2026-09-14)

**Branch:** `arena/01a09e59-red-tide-ppc`
**Scope:** animation gating only. No layout or spacing change — verified, see 18.4.
Closes the maintenance item flagged in §17.1.

### 18.1 The problem

`DecryptedText.tsx` skipped its scramble below the `sm` breakpoint via a
hard-coded `matchMedia('(max-width: 640px)')`. That was a second, independent
copy of a number the theme already owns.

Worth stating precisely, because it is subtler than "two constants that might
drift": Tailwind's `sm` is **`40rem`**, not `640px`. The two agreed only because
the browser's default root font size is 16px. They were already different
*kinds* of value:

- Retune the theme → the JS gate silently keeps the old boundary.
- A user who raises their browser's default font size → `40rem` becomes 800px
  while the JS check stays pinned at 640px, so the gate disagrees with the
  layout **on the same device, today**, with nobody having edited anything.

### 18.2 Why Tailwind v4 makes this awkward

This project is Tailwind v4 CSS-first — there is no `tailwind.config.js` to
import from. And v4 **tree-shakes `@theme` tokens**: `--breakpoint-sm` drives
the `sm:` variant at compile time but is not emitted, so
`getComputedStyle(root).getPropertyValue('--breakpoint-sm')` reads empty at
runtime. Confirmed by probing a build — `0` occurrences of `--breakpoint` in the
compiled CSS.

The lever that does work is `theme()`, which the compiler resolves and inlines.

### 18.3 The fix

`src/index.css` — declares the token once, then republishes it for JS:

```css
@theme {
  --breakpoint-sm: 40rem;   /* drives every `sm:` utility */
}

:root {
  --bp-sm: theme(--breakpoint-sm);  /* inlined at build time -> readable at runtime */
}
```

`src/lib/breakpoints.ts` — the only place JS learns a breakpoint. Reads
`--bp-sm`, resolves `rem` against the **actual** root font size, and exposes
`isBelowSm()` built as `not all and (min-width: …)` — the exact complement of
Tailwind's `sm:` condition, so the gate flips on precisely the pixel the layout
does. Falls back to `40rem` (the same literal `index.css` declares) if no
stylesheet has applied, and to measuring `innerWidth` if `matchMedia` is absent.

`DecryptedText.tsx` — `smallViewport()` is now one call to `isBelowSm()`.
**No pixel value is written in TypeScript anywhere.**

### 18.4 Verified

**The linkage, demonstrated rather than asserted.** Changed *only*
`--breakpoint-sm: 40rem` → `48rem` and rebuilt:

| | before | after one-line edit |
|---|---|---|
| `sm:` media queries | `@media (width>=40rem)` | `@media (width>=48rem)` |
| JS token `--bp-sm` | `40rem` | `48rem` |
| stale `40rem` left | — | **0** |

Both moved together; no `.ts` file was touched. Reverted after.

**In real Chromium**, production build:

| viewport | `--bp-sm` | `isBelowSm()` | `main` padding-left |
|---|---|---|---|
| 375px | 40rem | true | 20px |
| 639px | 40rem | **true** | 24px |
| 640px | 40rem | **false** | 24px |
| 1280px | 40rem | false | 24px |

The flip lands exactly on 640 — Tailwind's `sm:` is `>= 40rem`, so 639 is below
and 640 is not. Boundary behaviour is pinned by unit tests at 639/640 too.

**Test suite:** 176 passing (was 167) across 17 files. `breakpoints.test.ts`
adds 9, including the drift case (move the token, the resolved px follows) and
the 20px-root-font case where `40rem` correctly resolves to 800px — the
scenario the old hard-coded `640` got wrong.

`DecryptedText.test.tsx`'s matchMedia fake previously keyed on the literal
string `'(max-width: 640px)'`. It was updated to answer the new query shape;
left alone it would have silently passed while testing nothing, which is worth
noting as the kind of stale mock this sort of refactor leaves behind.

**No layout change:** the §17 spacing sweep re-run at 360/390/768/1280 reports
identical padding, header heights and gaps, with no horizontal scroll or
overflow at any width. `git diff` on `index.css` touches no spacing utility.

### 18.5 Remaining

`--breakpoint-sm` is the only breakpoint JS consumes, so it is the only one
republished. If another gate ever needs `md`/`lg`, add the matching
`--bp-*: theme(--breakpoint-*)` line and a reader in `lib/breakpoints.ts` — do
not reintroduce a literal.
