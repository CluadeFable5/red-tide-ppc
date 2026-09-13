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

### 13.7 Not verified here

There is no browser in the build sandbox, so this pass could not be screenshot-verified. The
structure and the interaction *state machine* were verified in jsdom (anchor cycling, the sheet's
`translateY`, and the underlay's live `scale`/`border-radius` tracking the same progress value), and
the Leaflet interaction math rests on `getScale()` reading `getBoundingClientRect()` against
`offsetWidth` — which is why scaling the wrapper is safe on Leaflet 1.9. Visual verification at
~375px is still the outstanding check.
