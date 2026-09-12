# Design References & Stack Decisions

**Status:** pre-build research. No application code exists yet — this document records
verified tooling, rejected candidates, and known pitfalls so the design pass can start
without re-litigating decisions.

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
