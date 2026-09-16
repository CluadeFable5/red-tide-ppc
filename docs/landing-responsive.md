# Landing responsive pass

> Historical record of the first pass. The follow-up fixes the flagged admin cap, self-hosts fonts, adds live-data announcements and expands map checks. See [follow-up validation](follow-up-validation.md) for current results.

## Cause and scoped fix

`Landing.tsx` applied `max-w-2xl` (672px) to the entire main element at every viewport size. Its sections remained stacked, so desktop width never changed the layout. The source did center the container (`mx-auto`); simply adding more centering would not solve the width/reflow problem.

The landing shell now grows at `md`, `lg`, `xl`, and `2xl` (896 / 1152 / 1280 / 1600px maximum widths), with matching responsive gutters. At `lg` (1024px), the hero and live status/figures become two columns. The existing hero animation stays scoped to the hero; no new map or animation component is introduced. At `md` (768px), “How it works” and “What is red tide” share two equal columns. Desktop figures and explanatory typography are larger. Safety copy and CTA behavior are unchanged.

`Header` accepts an opt-in container class from Landing so its brand/actions align with the wider main. Its default classes and overlay branch are unchanged, preserving `/admin` and `/map` layouts.

## Measured production-build layouts

Chromium, demo backend, DPR 1. All four widths passed in both normal and reduced motion.

| Viewport | Shell / usable content | Hero and figures | Explanatory sections | Banner and footer |
| --- | --- | --- | --- | --- |
| 375 × 812 | 375 / 335px; 20px gutters | Stacked; three equal stat cards across the content width | Stacked with mobile spacing | Full content width; footer stacked |
| 768 × 900 | 768 / 704px; 32px gutters | Stacked; stats expand across the page | Two 332px columns | Full content width; footer in a row |
| 1280 × 900 | 1280 / 1200px; 40px gutters | Hero left, substantial live status/figures panel right | Two 560px columns | Full content width; footer in a row |
| 1920 × 1080 | 1600 / 1504px; balanced 160px outer margins plus 48px gutters | Hero left, expanding live status/figures panel right | Two 704px columns | Full content width; footer in a row |

Checks cover container growth/centering, header alignment, actual column placement and usable widths, equal stat cards, both CTAs, banner/footer sizing and ordering, viewport overflow, browser exceptions, and keeping the MapPage chunk deferred. This is a geometric browser regression test, not a jsdom assertion about class names.

### Adjacent routes

- `/map`: Leaflet surface measured exactly 375×812, 768×900, 1280×900, and 1920×1080. No analogous narrow page container. No route changes.
- `/admin`: inspected the gate and the unlocked Zones tab in a local demo session. The gate's 448px cap suits a small login form. **Flagged:** the dashboard remains `max-w-3xl` (768px), giving only 736px of usable content on desktop, with no wider reflow. It is centered, not left-pinned. Left unchanged for a separate admin layout pass.

### Environment limitations

Google Fonts and remote map tiles were unavailable from the sandbox. Screenshots therefore show the shipped fallback font stacks, and the map audit verifies geometry/controls/polygons rather than remote tile appearance. No live Firebase data was used or modified. Normal-motion screenshots were taken after scrolling through the reveals; reduced-motion captures contain the static hero fallback.

## Reproduce

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
# In another terminal:
npx playwright install chromium
node scripts/landing-responsive-pass.mjs
```

Optional variables: `CHROMIUM_EXECUTABLE_PATH` for an existing browser, `RESPONSIVE_OUTPUT_DIR` for an alternate screenshot directory. Default artifacts go to ignored `.cache/landing-responsive/`: eight full-page landing screenshots, adjacent-route screenshots, and `measurements.json`. The script requires the demo backend for its admin inspection and never submits reports or status changes.

Sandbox run used a locally unpacked Chromium with its required shared libraries because the standard browser download was blocked. Temporary tooling did not change package manifests or the lockfile; validation ran after restoring dependencies with `npm ci`.

## Validation result

- `npm run typecheck`: passed.
- `npm test`: 178 tests passed across 18 files. Existing jsdom canvas/scrollTo and React act warnings were printed; no test failures.
- `npm run build`: passed.
- `scripts/landing-responsive-pass.mjs`: all eight landing width/motion combinations and four adjacent-route width audits passed.
- `git diff --check`: passed.
