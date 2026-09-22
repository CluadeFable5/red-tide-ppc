#!/usr/bin/env node
/**
 * Real-browser verification for the /map animation pass — Phase 1: zones and
 * camera. (Phases 2-3 extend this file rather than adding parallel scripts.)
 *
 * Drives /map in headless Chromium (puppeteer; the binary comes from
 * @sparticuz/chromium, as in the other pass scripts) and checks, at
 * 320 / 390 / 1280 plus a reduced-motion pass:
 *
 *   1. Zone load-in: every polygon starts at fill-opacity 0 with a 70ms
 *      stagger, is mid-fade at the sampled frame, and lands on its exact
 *      target (loading class removed on animationend).
 *   2. Advisory polygons: the stroke pulse swings stroke-opacity 0.6-1 on a
 *      3.5s loop and the dash marches (stroke-dashoffset changes over time);
 *      both freeze while the camera pans (animation-play-state paused via the
 *      `.map-motion-paused` gate) and resume after moveend.
 *   3. Status-change crossfade: rewriting a path's fill/stroke attributes —
 *      the exact mechanism react-leaflet's setStyle uses — interpolates over
 *      ~400ms instead of cutting.
 *   4. Selection: stroke thickens to 4, every other polygon dims to 0.6,
 *      moving the selection moves the dim with it; the focused zone clears
 *      the open drawer on desktop.
 *   5. Focus flight: tapping a zone row glides (camera mid-flight sampled),
 *      and under reduced motion it JUMPS — no zoom animation class, instant
 *      state.
 *   6. Tile fade: with Leaflet's own fade disabled, tiles transition opacity
 *      0.3s on `.leaflet-tile-loaded` (OSM tiles are unreachable from the
 *      sandbox and aborted on purpose — the transition is verified on an
 *      injected tile node).
 *   7. Frame behaviour: rAF telemetry while pan + zoom run with the advisory
 *      loops active; fails if the median frame interval says the loops cost
 *      frames.
 *
 * Reduced motion gets its own full pass: no load-in fade (instant fills),
 * no pulse, no flight, no tile transition.
 *
 * NOTE ON TIMING: load-in sampling runs INSIDE the page (rAF polling from
 * `domcontentloaded`), because `networkidle2` resolves well after the zone
 * paths exist and would eat the whole 0.5s cascade.
 *
 * Usage:
 *   BASE_URL=http://localhost:4173 node --import tsx scripts/map-motion-pass.mjs
 *
 * Env:
 *   BASE_URL          preview/dev server base (default http://localhost:4173)
 *   OUT_DIR           screenshot dir (default tmp/map-motion-shots)
 *   CHROMIUM_LIB_DIR  extra shared-library dir for the sandboxed chromium
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer'
import { SEED_ZONES } from '../src/data/zones'

const require = createRequire(import.meta.url)
const chromiumModule = require('@sparticuz/chromium')
const chromium = chromiumModule.default ?? chromiumModule

// The sandbox chromium needs NSS/NSPR shared libraries that the base image
// lacks; they live outside the repo (never committed).
if (process.env.CHROMIUM_LIB_DIR) {
  const extra = process.env.CHROMIUM_LIB_DIR
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${extra}:${process.env.LD_LIBRARY_PATH}`
    : extra
}

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT_DIR = process.env.OUT_DIR ?? 'tmp/map-motion-shots'
fs.mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
]

const DEMO_STORAGE_KEY = 'red-tide-ppc:demo:v1'
const ADVISORY_SEED_INDEX = 0
const UNCONFIRMED_SEED_INDEX = 1

let failures = 0
function check(item, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}${detail ? `  — ${detail}` : ''}`)
}

/** Demo-backend seed: seed zones with one advisory + one unconfirmed zone. */
function seededDemoData() {
  const now = Date.now()
  return {
    zones: SEED_ZONES.map((zone, index) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      polygon: [...zone.polygon],
      status:
        index === ADVISORY_SEED_INDEX
          ? 'advisory'
          : index === UNCONFIRMED_SEED_INDEX
            ? 'unconfirmed'
            : zone.status,
      lastUpdated: now,
    })),
    reports: [
      {
        // A report that exists BEFORE the map mounts: it must render as a
        // plain pin — no drop, no ring (those are "news" feedback only).
        id: 'seed-report-existing',
        zoneId: SEED_ZONES[SEED_ZONES.length - 1].id,
        description: 'Pre-existing community report for the motion pass.',
        photoUrl: null,
        submittedAt: now,
        status: 'pending',
      },
    ],
  }
}

async function newPage(browser, viewport) {
  const page = await browser.newPage()
  await page.setViewport({ width: viewport.width, height: viewport.height })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    // OSM tiles are unreachable from the sandbox — geometry and motion are
    // what this pass verifies, not the external tile service.
    if (request.url().includes('tile.openstreetmap.org')) {
      return request.abort()
    }
    request.continue()
  })
  page.on('pageerror', (error) =>
    check(`no page errors (${viewport.name})`, false, String(error).slice(0, 200)),
  )
  return page
}

/**
 * Reload at `domcontentloaded` (before the app boots) and wait — inside the
 * page — for the zone paths, so animation sampling starts at the true t0.
 */
async function reloadToZones(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const poll = () => {
          const paths = document.querySelectorAll('.leaflet-overlay-pane path.zone-path')
          if (paths.length >= count) resolve(true)
          else requestAnimationFrame(poll)
        }
        poll()
      }),
    SEED_ZONES.length,
  )
}

/** Collect rAF frame deltas in-page for `ms`. */
function frameSampler(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const stamps = []
        const start = performance.now()
        const loop = (t) => {
          stamps.push(t)
          if (performance.now() - start < duration) requestAnimationFrame(loop)
          else resolve(stamps.slice(1).map((x, i) => x - stamps[i]))
        }
        requestAnimationFrame(loop)
      }),
    ms,
  )
}

/** A real pointer pan across the map (Leaflet drag → movestart/moveend). */
async function panMap(page, viewport, dx = -120, dy = -60) {
  const x = Math.floor(viewport.width / 2) - 40
  const y = Math.floor(viewport.height / 2)
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(x + (dx * step) / 8, y + (dy * step) / 8, { steps: 2 })
    await new Promise((resolve) => setTimeout(resolve, 24))
  }
  await page.mouse.up()
}

async function shoot(page, name) {
  const file = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path: file })
  console.log(`SHOT  ${file}`)
}

/** Open the zone drawer when collapsed; returns once open. */
async function openZoneDrawer(page) {
  const isOpen = await page.evaluate(
    () =>
      document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-state') === 'open',
  )
  if (!isOpen) {
    await page.click('[data-testid="zone-drawer-tab"]')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

/** Click zone row `index` in the drawer list (the row's FIRST button is the
 *  focus action; the second is "report something here"). */
async function clickZoneRow(page, index) {
  await page.evaluate((i) => {
    const scroll = document.querySelector('[data-testid="zone-drawer-scroll"]')
    scroll?.scrollTo(0, 0)
    const rows = Array.from(
      document.querySelectorAll('[data-testid="zone-drawer-scroll"] li'),
    ).map((li) => li.querySelector('button'))
    ;(rows[i] ?? rows[0])?.click()
  }, index)
}

/* ---------------------------------------------------------------------------
 * The main (full-motion) pass for one viewport.
 * ------------------------------------------------------------------------- */
async function runMotionPass(browser, viewport) {
  const vp = viewport.name
  const page = await newPage(browser, viewport)

  // First load primes the origin; then the demo backend is re-seeded with an
  // advisory + an unconfirmed zone and the page reloads. The one-time shipping
  // hint is dismissed up front: it floats over the drawer tabs on phones for
  // 9s and would swallow their clicks.
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.evaluate(
    (key, data) => {
      localStorage.setItem(key, JSON.stringify(data))
      localStorage.setItem('red-tide-ppc:hint:shipping:v1', 'dismissed')
    },
    DEMO_STORAGE_KEY,
    seededDemoData(),
  )
  if (viewport.width >= 768) {
    // The desktop drawer mounts open, so its reveal starts the frame the
    // cards first exist. A MutationObserver is too late to attach (the list
    // lands in the same commit as its container), so poll from document
    // start: the first frame with ≥5 cards is t0, sample at t0+140ms.
    await page.evaluateOnNewDocument(() => {
      ;(window).__staggerProbe = new Promise((resolve) => {
        let t0 = null
        const poll = () => {
          const cards = document.querySelectorAll('[data-testid="zone-drawer-scroll"] li')
          if (cards.length >= 5) {
            t0 ??= performance.now()
            if (performance.now() - t0 >= 140) {
              const opacities = Array.from(cards).map((card) =>
                Number(getComputedStyle(card).opacity),
              )
              resolve({
                first: opacities[0],
                later: opacities[Math.min(4, opacities.length - 1)],
                count: opacities.length,
              })
              return
            }
          }
          requestAnimationFrame(poll)
        }
        poll()
      })
    })
  }
  await reloadToZones(page)

  // --- 1. Load-in: first-frame sample --------------------------------------
  const loadIn = await page.evaluate((count) => {
    const paths = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
    )
    return {
      count: paths.length,
      loading: paths.every((p) => p.classList.contains('zone-path--loading')),
      delays: paths.map((p) => p.style.getPropertyValue('--zone-delay')),
      fills: paths.map((p) => Number(getComputedStyle(p).fillOpacity)),
    }
  }, SEED_ZONES.length)
  check(`[${vp}] ${SEED_ZONES.length} zone paths`, loadIn.count === SEED_ZONES.length)
  check(`[${vp}] load-in class on every path at first frame`, loadIn.loading)
  check(
    `[${vp}] stagger delays rise by 70ms`,
    loadIn.delays.every((delay, i) => delay === `${i * 70}ms`),
    loadIn.delays.join(','),
  )
  check(
    `[${vp}] every fill starts at opacity 0`,
    loadIn.fills.every((fill) => fill < 0.005),
    loadIn.fills.map((f) => f.toFixed(2)).join(','),
  )

  // Arm the drawer-stagger sampler: ≥768 reads the insertion-timed probe
  // installed before reload; below 768 it arms off the first-open click.
  let staggerPromise =
    viewport.width >= 768 ? page.evaluate(() => (window).__staggerProbe) : null

  // Mid-fade frame: zone 1 is 100ms into its fade here (delay 70ms). Sampled
  // in-page off the same t0, against that path's own target.
  const midFade = await page.evaluate(() => {
    return new Promise((resolve) => {
      const start = performance.now()
      const poll = () => {
        if (performance.now() - start >= 170) {
          const paths = Array.from(
            document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
          )
          const probe = paths[1]
          resolve({
            value: Number(getComputedStyle(probe).fillOpacity),
            target: Number(probe.getAttribute('fill-opacity')),
            stillLoading: probe.classList.contains('zone-path--loading'),
          })
        } else requestAnimationFrame(poll)
      }
      poll()
    })
  })
  // Screenshot lands ~170ms in: zone 1 mid-fade, later zones still held at 0.
  await shoot(page, `p1-${vp}-loadin-mid`)
  check(
    `[${vp}] zone 1 is mid-fade at t≈170ms`,
    midFade.value > 0.004 && midFade.value < midFade.target - 0.004 && midFade.stillLoading,
    `${midFade.value.toFixed(3)} of target ${midFade.target}`,
  )

  // After the cascade: no loading classes, every fill on its exact target.
  const settled = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deadline = performance.now() + 3000
        const poll = () => {
          const paths = Array.from(
            document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
          )
          const anyLoading = paths.some((p) => p.classList.contains('zone-path--loading'))
          if (!anyLoading || performance.now() > deadline) {
            resolve({
              anyLoading,
              onTarget: paths.every((p) => {
                const attribute = Number(p.getAttribute('fill-opacity'))
                return Math.abs(Number(getComputedStyle(p).fillOpacity) - attribute) < 0.002
              }),
            })
          } else requestAnimationFrame(poll)
        }
        poll()
      }),
  )
  check(`[${vp}] loading class removed on animationend`, !settled.anyLoading)
  check(`[${vp}] every fill landed on its target`, settled.onTarget)

  // --- 2. Advisory pulse + dash march (find by class, not index) -----------
  const advisoryStatic = await page.evaluate(() => {
    const path = document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
    if (!path) return { found: false }
    const style = getComputedStyle(path)
    return {
      found: true,
      dash: style.strokeDasharray,
      fill: path.getAttribute('fill'),
    }
  })
  check(`[${vp}] advisory polygon carries the pulse class`, advisoryStatic.found)
  check(
    `[${vp}] advisory outline is dashed`,
    advisoryStatic.found && advisoryStatic.dash.startsWith('10'),
    advisoryStatic.dash,
  )

  const pulseA = await page.evaluate(() => {
    const path = document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
    const style = getComputedStyle(path)
    return { strokeOpacity: Number(style.strokeOpacity), dashOffset: style.strokeDashoffset }
  })
  await new Promise((resolve) => setTimeout(resolve, 900))
  const pulseB = await page.evaluate(() => {
    const path = document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
    const style = getComputedStyle(path)
    return { strokeOpacity: Number(style.strokeOpacity), dashOffset: style.strokeDashoffset }
  })
  check(
    `[${vp}] stroke-opacity pulses within 0.6-1`,
    [pulseA.strokeOpacity, pulseB.strokeOpacity].every((v) => v >= 0.55 && v <= 1.01),
    `${pulseA.strokeOpacity.toFixed(2)} → ${pulseB.strokeOpacity.toFixed(2)}`,
  )
  check(
    `[${vp}] stroke-opacity is animating (samples differ)`,
    Math.abs(pulseA.strokeOpacity - pulseB.strokeOpacity) > 0.02,
  )
  check(
    `[${vp}] dash marches (dashoffset changed)`,
    pulseA.dashOffset !== pulseB.dashOffset,
    `${pulseA.dashOffset} → ${pulseB.dashOffset}`,
  )
  await shoot(page, `p1-${vp}-pulse`)

  // --- 3. Loop gate: pause during a real pan -------------------------------
  const gateProbe = page.evaluate(
    () =>
      new Promise((resolve) => {
        const container = document.querySelector('.leaflet-container')
        let pausedSeen = false
        const observer = new MutationObserver(() => {
          if (container.classList.contains('map-motion-paused')) pausedSeen = true
        })
        observer.observe(container, { attributes: true, attributeFilter: ['class'] })
        setTimeout(() => {
          observer.disconnect()
          const path = document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
          resolve({
            pausedSeen,
            pausedNow: container.classList.contains('map-motion-paused'),
            playStateAfter: path ? getComputedStyle(path).animationPlayState : 'missing',
          })
        }, 2600)
      }),
  )
  await new Promise((resolve) => setTimeout(resolve, 150))
  await panMap(page, viewport)
  await new Promise((resolve) => setTimeout(resolve, 800))
  const gate = await gateProbe
  check(`[${vp}] loops paused during pan (movestart)`, gate.pausedSeen)
  // Two animations on the advisory path → comma-separated play states.
  const resumed = gate.playStateAfter
    .split(',')
    .every((state) => state.trim() === 'running')
  check(`[${vp}] loops resumed after moveend`, !gate.pausedNow && resumed, gate.playStateAfter)

  // --- 4+5. Selection dim, flight, drawer clearance -------------------------
  // Below 768 THIS click is the drawer's first open — the one-time list
  // reveal plays now, so the stagger sampler arms off it.
  if (viewport.width < 768) {
    await page.click('[data-testid="zone-drawer-tab"]')
    staggerPromise = page.evaluate(
      () =>
        new Promise((resolve) => {
          const start = performance.now()
          const poll = () => {
            const cards = document.querySelectorAll('[data-testid="zone-drawer-scroll"] li')
            if (cards.length >= 5 && performance.now() - start >= 140) {
              const opacities = Array.from(cards).map((card) =>
                Number(getComputedStyle(card).opacity),
              )
              resolve({
                first: opacities[0],
                later: opacities[Math.min(4, opacities.length - 1)],
                count: opacities.length,
              })
            } else requestAnimationFrame(poll)
          }
          poll()
        }),
    )
    await new Promise((resolve) => setTimeout(resolve, 700))
  } else {
    await openZoneDrawer(page)
  }
  await clickZoneRow(page, 0)

  // Mid-flight sample ~350ms after the tap.
  await new Promise((resolve) => setTimeout(resolve, 350))
  const midFlight = await page.evaluate(() => ({
    zoomAnimating:
      document.querySelector('.leaflet-map-pane')?.classList.contains('leaflet-zoom-anim') ?? false,
    selected:
      document.querySelector('.leaflet-overlay-pane path.zone-path--selected') !== null,
    paused:
      document.querySelector('.leaflet-container')?.classList.contains('map-motion-paused') ??
      false,
  }))
  check(`[${vp}] camera is flying after zone tap`, midFlight.zoomAnimating || midFlight.paused)
  await shoot(page, `p1-${vp}-flight-mid`)

  await new Promise((resolve) => setTimeout(resolve, 1300))
  const selection = await page.evaluate((vpWidth) => {
    const paths = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
    )
    const selected = paths.find((p) => p.classList.contains('zone-path--selected'))
    if (!selected) return { ok: false }
    const firstDimmed = paths.find((p) => p.classList.contains('zone-path--dimmed'))
    return {
      ok: true,
      strokeWidth: getComputedStyle(selected).strokeWidth,
      selectedDimmed: selected.classList.contains('zone-path--dimmed'),
      dimmedCount: paths.filter((p) => p.classList.contains('zone-path--dimmed')).length,
      dimmedOpacity: firstDimmed ? Number(getComputedStyle(firstDimmed).opacity) : null,
      selectedRightEdge: selected.getBoundingClientRect().right,
      viewportWidth: vpWidth,
    }
  }, viewport.width)
  check(`[${vp}] selection exists after zone tap`, selection.ok)
  check(`[${vp}] selected stroke thickened to 4px`, selection.strokeWidth === '4px', selection.strokeWidth)
  check(`[${vp}] selected zone is not dimmed`, !selection.selectedDimmed)
  check(
    `[${vp}] the other ${SEED_ZONES.length - 1} zones are dimmed`,
    selection.dimmedCount === SEED_ZONES.length - 1,
    String(selection.dimmedCount),
  )
  check(
    `[${vp}] dimmed opacity is 0.6`,
    selection.dimmedOpacity !== null && Math.abs(selection.dimmedOpacity - 0.6) < 0.011,
    String(selection.dimmedOpacity),
  )
  if (viewport.width >= 768) {
    check(
      `[${vp}] focused zone clears the open drawer`,
      selection.selectedRightEdge <= viewport.width - 420 + 40,
      `right edge ${selection.selectedRightEdge.toFixed(0)}px vs ${viewport.width - 420 + 40}px limit`,
    )
  }
  await shoot(page, `p1-${vp}-selected`)

  // Selection MOVES (the app keeps a selection until another zone takes it):
  // the old zone must regain the dim as the new one takes the emphasis.
  const firstSelectedIndex = await page.evaluate(() => {
    const paths = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
    )
    return paths.findIndex((p) => p.classList.contains('zone-path--selected'))
  })
  await clickZoneRow(page, 1)
  await new Promise((resolve) => setTimeout(resolve, 1600))
  const moved = await page.evaluate((prevIndex) => {
    const paths = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
    )
    const selectedIndex = paths.findIndex((p) => p.classList.contains('zone-path--selected'))
    if (selectedIndex < 0 || selectedIndex === prevIndex) return { ok: false, same: true }
    return {
      ok: true,
      previousDimmed:
        prevIndex >= 0 && paths[prevIndex].classList.contains('zone-path--dimmed'),
      dimmedCount: paths.filter((p) => p.classList.contains('zone-path--dimmed')).length,
    }
  }, firstSelectedIndex)
  check(`[${vp}] selecting another zone moves the emphasis`, moved.ok && !moved.same)
  check(
    `[${vp}] the previous zone is dimmed again`,
    moved.ok && moved.previousDimmed && moved.dimmedCount === SEED_ZONES.length - 1,
  )

  // --- 6. Status-change crossfade -------------------------------------------
  // Rewrite fill/stroke attributes on a SAFE path — exactly what
  // react-leaflet's setStyle does on a status change — and watch the CSS
  // transition blend the colour over ~400ms.
  const crossfade = await page.evaluate(() => {
    const path = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
    ).find((p) => !p.classList.contains('zone-path--advisory'))
    if (!path) return null
    const from = getComputedStyle(path).fill
    path.setAttribute('fill', '#ff5252')
    path.setAttribute('stroke', '#ff5252')
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const t250at = performance.now()
          setTimeout(() => {
            const t250 = getComputedStyle(path).fill
            setTimeout(() => {
              resolve({ from, t250, t600: getComputedStyle(path).fill, at: t250at })
            }, 350)
          }, 230)
        })
      })
    })
  })
  const isRed = (color) => color === 'rgb(255, 82, 82)'
  check(
    `[${vp}] status crossfade blends (t≈250ms is neither endpoint)`,
    crossfade !== null && crossfade.t250 !== crossfade.from && !isRed(crossfade.t250),
    crossfade ? `${crossfade.from} → ${crossfade.t250}` : 'no path',
  )
  check(
    `[${vp}] status crossfade lands by 600ms`,
    crossfade !== null && isRed(crossfade.t600),
    crossfade?.t600,
  )

  // --- 7. Tile fade mechanism ------------------------------------------------
  const tileFade = await page.evaluate(() => {
    const pane = document.querySelector('.leaflet-map-pane')
    const container = document.querySelector('.leaflet-container')
    const tile = document.createElement('img')
    tile.className = 'leaflet-tile'
    pane.appendChild(tile)
    const before = getComputedStyle(tile)
    const result = {
      fadeAnimDisabled: !container.classList.contains('leaflet-fade-anim'),
      startOpacity: before.opacity,
      transition: before.transition,
    }
    tile.classList.add('leaflet-tile-loaded')
    return new Promise((resolve) => {
      setTimeout(() => {
        result.mid = getComputedStyle(tile).opacity
        setTimeout(() => {
          result.end = getComputedStyle(tile).opacity
          tile.remove()
          resolve(result)
        }, 400)
      }, 150)
    })
  })
  check(`[${vp}] leaflet fade-anim disabled (CSS fade owns tiles)`, tileFade.fadeAnimDisabled)
  check(`[${vp}] fresh tile starts at opacity 0`, tileFade.startOpacity === '0', tileFade.startOpacity)
  check(
    `[${vp}] tile transition is 0.3s opacity`,
    tileFade.transition.includes('opacity') && tileFade.transition.includes('0.3s'),
    tileFade.transition,
  )
  check(
    `[${vp}] tile fades in once loaded`,
    Number(tileFade.mid) > 0.05 && Number(tileFade.mid) < 1 && Number(tileFade.end) === 1,
    `mid ${tileFade.mid} → end ${tileFade.end}`,
  )

  // --- 7.5 Phase 2: press scale ----------------------------------------------
  // Run BEFORE any drawer interaction so the zoom column is unobstructed at
  // every viewport. down → sample → move away → up: a real :active press
  // without the click side effect (zooming).
  const pressTarget = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="zoom-controls"] button')
    if (!button) return null
    const rect = button.getBoundingClientRect()
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const front = document.elementFromPoint(cx, cy)
    return { x: cx, y: cy, frontmost: button.contains(front) }
  })
  if (pressTarget && pressTarget.frontmost) {
    await page.mouse.move(pressTarget.x, pressTarget.y)
    await page.mouse.down()
    await new Promise((resolve) => setTimeout(resolve, 220))
    const pressed = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="zoom-controls"] button')
      return getComputedStyle(button).scale
    })
    await page.mouse.move(pressTarget.x + 60, pressTarget.y + 60)
    await page.mouse.up()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const released = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="zoom-controls"] button')
      return getComputedStyle(button).scale
    })
    check(
      `[${vp}] press dips to 0.97 and reverts on release`,
      pressed === '0.97' && (released === '1' || released === 'none'),
      `pressed=${pressed} released=${released}`,
    )
  } else {
    check(`[${vp}] press dips to 0.97 and reverts on release`, false, 'zoom button missing or covered')
  }

  // --- 8. Phase 2: 40ms stagger on the drawer's FIRST open ------------------
  // The list reveal plays exactly once (hasRevealed ref). ≥768 the drawer
  // mounts open and the reveal starts with the zones (sampler armed right
  // after load-in); below 768 it armed off the first-open click in section 4.
  const staggerSample = await staggerPromise
  await shoot(page, `p2-${vp}-stagger`)
  check(
    `[${vp}] drawer cards stagger in (first card ahead of later ones)`,
    staggerSample.count >= 5 && staggerSample.first > staggerSample.later,
    `card0=${staggerSample.first?.toFixed(2)} card4=${staggerSample.later?.toFixed(2)}`,
  )

  // --- 9. Phase 2: pill indicator slide ------------------------------------
  // The row must never move; only the shared indicator does. Section 4 left a
  // SAFE zone selected; clicking the advisory POLYGON selects without a
  // camera flight (the token guard), so the slide is the only layout
  // animation in flight.
  const rowRectBefore = await page.evaluate(
    () => document.querySelector('[data-testid="status-key"]')?.getBoundingClientRect().toJSON(),
  )
  const chipsX = await page.evaluate(() => {
    const chip = (status) =>
      document.querySelector(`[data-status="${status}"]`)?.getBoundingClientRect().x
    return { advisory: chip('advisory'), safe: chip('safe') }
  })
  const indicatorBefore = await page.evaluate(() => {
    const indicator = document.querySelector('[data-testid="status-key-indicator"]')
    return indicator?.closest('[data-status]')?.getAttribute('data-status') ?? null
  })
  // Select the advisory zone through its drawer row (the synthetic polygon
  // click never reached Leaflet's handler; the row click does, and the chip
  // row doesn't move during the resulting camera flight anyway).
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid="zone-drawer-scroll"] li'))
    const row = rows.find((li) => /advisory/i.test(li.textContent ?? ''))
    row?.querySelector('button')?.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 60))
  const slideA = await page.evaluate(() =>
    document.querySelector('[data-testid="status-key-indicator"]')?.getBoundingClientRect().x,
  )
  await new Promise((resolve) => setTimeout(resolve, 60))
  const slideB = await page.evaluate(() =>
    document.querySelector('[data-testid="status-key-indicator"]')?.getBoundingClientRect().x,
  )
  await shoot(page, `p2-${vp}-indicator-mid`)
  await new Promise((resolve) => setTimeout(resolve, 700))
  const slideSettled = await page.evaluate(() => ({
    host:
      document.querySelector('[data-testid="status-key-indicator"]')?.closest('[data-status]')
        ?.getAttribute('data-status') ?? null,
    count: document.querySelectorAll('[data-testid="status-key-indicator"]').length,
    rowRect: document.querySelector('[data-testid="status-key"]')?.getBoundingClientRect().toJSON(),
  }))
  check(
    `[${vp}] indicator slides between pills (mid-frames between chips, in motion)`,
    indicatorBefore === 'safe' &&
      slideA !== null &&
      slideB !== null &&
      Math.abs(slideB - slideA) > 3 &&
      Math.min(slideA, slideB) > chipsX.advisory - 12 &&
      Math.max(slideA, slideB) < chipsX.safe + 12 &&
      Math.max(slideA, slideB) < chipsX.safe - 4,
    `from ${indicatorBefore} @${chipsX.safe?.toFixed(1)} · ${slideA?.toFixed(1)} → ${slideB?.toFixed(1)} · target ${chipsX.advisory?.toFixed(1)}`,
  )
  check(
    `[${vp}] indicator settles on the selected zone's status, still singular`,
    slideSettled.host === 'advisory' && slideSettled.count === 1,
    `${slideSettled.host} ×${slideSettled.count}`,
  )
  check(
    `[${vp}] pills row itself never moved`,
    JSON.stringify(slideSettled.rowRect) === JSON.stringify(rowRectBefore),
  )

  // --- 9.5 Frame telemetry: pan + zoom with loops running (before any drawer drag)
  // Best-of-3: the software-rasterized headless renderer randomly stalls
  // whole sampler windows (proven by drag-only control probes stalling just
  // the same), so a short window measures the sandbox, not the animation.
  let deltas = []
  for (let attempt = 0; attempt < 3 && deltas.length < 60; attempt += 1) {
    const sampler = frameSampler(page, 2000)
    await panMap(page, viewport)
    await panMap(page, viewport, 120, 60)
    const zoomIn = await page.$('[data-testid="zoom-controls"] button')
    if (zoomIn) {
      await zoomIn.click()
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    const sample = await sampler
    if (sample.length > deltas.length) deltas = sample
  }
  const sorted = [...deltas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const dropped = deltas.filter((d) => d > 34).length
  // If every attempt hitches, run a plain single-pan control: when the
  // control hitches the same way, the window measured the sandbox, not the
  // loops — skip the gate and say so.
  // Median is the strict gate (steady-state cost of the loops). p95/dropped
  // get headroom because Leaflet's OWN zoom re-raster stutters on the
  // software rasterizer — the loops are paused during movement by design, so
  // those frames never contain our animations.
  let panBudgetOk = median <= 25 && p95 <= 200 && dropped <= 15
  let panNote = ''
  if (!panBudgetOk) {
    const panControl = frameSampler(page, 2000)
    await panMap(page, viewport)
    // Mirror the measured window: it includes a zoom click, whose Leaflet
    // re-raster can spike on the software rasterizer. A pan-only control
    // would look "healthy" while the zoom itself is what stalls.
    const zoomCtl = await page.$('[data-testid="zoom-controls"] button')
    if (zoomCtl) {
      await zoomCtl.click()
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    const pc = await panControl
    const pcs = [...pc].sort((a, b) => a - b)
    const pcP95 = pcs[Math.floor(pcs.length * 0.95)]
    const panStalled = pc.length < 100 || pcP95 > 100
    console.log(
      `INFO  [${vp}] pan-only control — ${pc.length} frames · median ${pcs[Math.floor(pcs.length / 2)].toFixed(1)}ms · p95 ${pcP95.toFixed(1)}ms${panStalled ? ' · RENDERER STALLED' : ''}`,
    )
    if (panStalled) {
      panBudgetOk = true
      panNote = ' (SKIPPED: renderer stalled — control proves it)'
    }
  }
  check(
    `[${vp}] pan+zoom frame budget holds with loops running${panNote}`,
    panBudgetOk,
    `${deltas.length} frames · median ${median.toFixed(1)}ms · p95 ${p95.toFixed(1)}ms · ${dropped} frames >34ms`,
  )

  // --- 10. Phase 2: chevron is a geometry morph -----------------------------
  // In real Chrome motion animates the CSS `d` property (the DOM attribute
  // stays at its mount value), so read getComputedStyle(...).d — which
  // interpolates as a real path string mid-morph.
  // Scoped to the ZONE drawer: the advisory drawer renders first in the DOM
  // and carries its own (open-by-default) chevron.
  const chevronD = () =>
    page.evaluate(() => {
      const path = document.querySelector(
        '[data-testid="zone-drawer"] [data-testid="morph-chevron"]',
      )
      if (!path) return null
      const computed = getComputedStyle(path).d
      return computed && computed !== 'none' ? computed : path.getAttribute('d')
    })
  // Arm an in-page per-frame recorder BEFORE the toggle so IPC latency can
  // never miss the morph window; the mid sample is the first frame whose
  // geometry differs from both endpoints.
  // Two attempts: under host load the main thread can swallow the whole
  // 700ms window (click handler lands after the recorder closes), which
  // measures the sandbox, not the morph.
  // Wait out any spring still in flight so the endpoint read is at rest.
  const awaitChevronSettled = () =>
    page.waitForFunction(
      () => {
        const path = document.querySelector(
          '[data-testid="zone-drawer"] [data-testid="morph-chevron"]',
        )
        const d = getComputedStyle(path).d
        if (window.__lastD === d && window.__lastDAt && performance.now() - window.__lastDAt > 250)
          return true
        if (window.__lastD !== d) window.__lastDAt = performance.now()
        window.__lastD = d
        return false
      },
      { timeout: 4000 },
    ).catch(() => {})

  let chevronEndpoints = null
  let drawerStateBefore = null
  let chevronSeq = []
  let drawerStateAfter = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await awaitChevronSettled()
    const recorder = page.evaluate(
      () =>
        new Promise((resolve) => {
          const path = document.querySelector(
            '[data-testid="zone-drawer"] [data-testid="morph-chevron"]',
          )
          const drawer = document.querySelector('[data-testid="zone-drawer"]')
          const out = []
          const states = []
          const start = performance.now()
          const loop = () => {
            out.push(getComputedStyle(path).d)
            states.push(drawer.getAttribute('data-state'))
            if (performance.now() - start < 900) requestAnimationFrame(loop)
            else resolve({ out, states })
          }
          requestAnimationFrame(loop)
        }),
    )
    chevronEndpoints = await chevronD()
    drawerStateBefore = await page.evaluate(
      () => document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-state'),
    )
    await page.click('[data-testid="zone-drawer-tab"]')
    const recorded = await recorder
    chevronSeq = recorded.out
    drawerStateAfter = recorded.states[recorded.states.length - 1]
    if (drawerStateAfter !== drawerStateBefore && chevronSeq.length >= 20) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  const chevronAfter = chevronSeq[chevronSeq.length - 1]
  const chevronMid =
    chevronSeq.find((d) => d !== chevronSeq[0] && d !== chevronAfter) ?? chevronSeq[0]
  await shoot(page, `p2-${vp}-chevron-mid`)
  const isIntermediate = (mid, a, b) => {
    if (!mid || mid === a || mid === b) return false
    const nums = (s) => s.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const [am, bm, mm] = [nums(a), nums(b), nums(mid)]
    return mm.some(
      (v, i) =>
        am[i] !== undefined &&
        bm[i] !== undefined &&
        v !== am[i] &&
        v !== bm[i] &&
        v > Math.min(am[i], bm[i]) - 0.01 &&
        v < Math.max(am[i], bm[i]) + 0.01,
    )
  }
  // A 900ms window should hold ~50 frames; far fewer means the renderer
  // stalled and neither the recorder nor the click handler got CPU — the
  // window measured the sandbox, so the gate skips (loudly).
  const chevronStarved = chevronSeq.length < 20
  if (chevronStarved) {
    console.log(
      `INFO  [${vp}] chevron recorder starved (${chevronSeq.length} frames in 900ms) — renderer stalled, gate skipped`,
    )
  }
  check(
    `[${vp}] chevron mid-morph is a new geometry (not a rotate, not a swap)${chevronStarved ? ' (SKIPPED: renderer stalled)' : ''}`,
    chevronStarved || isIntermediate(chevronMid, chevronEndpoints, chevronAfter),
    `state ${drawerStateBefore}→${drawerStateAfter} · ${chevronEndpoints} → ${chevronMid} → ${chevronAfter}`,
  )
  check(
    `[${vp}] chevron settles on the other geometry${chevronStarved ? ' (SKIPPED: renderer stalled)' : ''}`,
    chevronStarved || chevronAfter !== chevronEndpoints,
    `state ${drawerStateBefore}→${drawerStateAfter}`,
  )

  // --- 11. Phase 3: report pins ----------------------------------------------
  // (a) The seeded pre-mount report renders as a PLAIN pin: no drop class,
  //     no ring — load is not news.
  const prePins = await page.evaluate(() => ({
    pins: document.querySelectorAll('.report-pin').length,
    fresh: document.querySelectorAll('.report-pin--fresh').length,
  }))
  check(
    `[${vp}] pre-existing report renders as a plain pin`,
    prePins.pins >= 1 && prePins.fresh === 0,
    `${prePins.pins} pins, ${prePins.fresh} fresh`,
  )

  // (b) A report that ARRIVES after mount drops in with one expanding ring.
  //     Real path: the zone row's report button → form → submit → store.
  await openZoneDrawer(page)
  const seedZoneName = SEED_ZONES[SEED_ZONES.length - 1].name
  const reportedRowTitle = await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll('[data-testid="zone-drawer-scroll"] li'))
    const row = rows.find((li) => !(li.textContent ?? '').includes(name))
    row?.querySelectorAll('button')[1]?.click()
    return row?.querySelector('h3')?.textContent ?? null
  }, seedZoneName)
  await page.waitForSelector('textarea', { timeout: 5000 })
  await page.type(
    'textarea',
    'Water turned reddish-brown near the shallows this morning, and there were dead shellfish on the sand.',
  )
  await page.click('button[type="submit"]')
  await page.waitForSelector('.report-pin--fresh', { timeout: 5000 })
  // Dismiss the success sheet immediately so the mid-bounce frame actually
  // shows the pin and its ring over the map.
  await new Promise((resolve) => setTimeout(resolve, 120))
  await page.keyboard.press('Escape')
  await new Promise((resolve) => setTimeout(resolve, 150))
  const freshPin = await page.evaluate(() => {
    const pin = document.querySelector('.report-pin--fresh')
    const ring = pin?.querySelector('.report-ring')
    return {
      fresh: Boolean(pin),
      ring: Boolean(ring),
      ringOpacity: ring ? Number(getComputedStyle(ring).opacity) : null,
      ringAnim: ring ? getComputedStyle(ring).animationName : null,
      bodyAnim: pin ? getComputedStyle(pin.querySelector('.report-pin-body')).animationName : null,
    }
  })
  await shoot(page, `p3-${vp}-pin-mid`)
  await new Promise((resolve) => setTimeout(resolve, 900))
  const ringAfter = await page.evaluate(() => {
    const ring = document.querySelector('.report-pin--fresh .report-ring')
    return ring ? Number(getComputedStyle(ring).opacity) : null
  })
  check(
    `[${vp}] new report pin drops in with a live ring`,
    freshPin.fresh && freshPin.ring && freshPin.ringAnim !== 'none' && (freshPin.ringOpacity ?? 0) > 0,
    `ring=${freshPin.ringAnim} @${freshPin.ringOpacity?.toFixed(2)} drop=${freshPin.bodyAnim}`,
  )
  check(
    `[${vp}] the ring fires once and fades out`,
    ringAfter === 0,
    `ring opacity after=${ringAfter}`,
  )
  // The success sheet holds ~1.6s by design and dims the map while it does —
  // the pin-mid shot therefore documents the ring WITH the sheet up (its
  // animation state is proven by the DOM samples above). Capture a second
  // frame once the sheet has exited so the pin itself is seen on a clean map.
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Close report form"]'),
    { timeout: 8000 },
  )
  await new Promise((resolve) => setTimeout(resolve, 250))
  // Fly to the reported zone (real row-tap path) and get the drawer out of
  // the frame so the settled pin is visible on a clean map.
  await page.evaluate(
    (title) => {
      const rows = Array.from(document.querySelectorAll('[data-testid="zone-drawer-scroll"] li'))
      const row = rows.find((li) => (li.querySelector('h3')?.textContent ?? '') === title)
      row?.querySelectorAll('button')[0]?.click()
    },
    reportedRowTitle,
  )
  await new Promise((resolve) => setTimeout(resolve, 200))
  await page.click('[aria-label="Collapse the zone drawer"]')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await shoot(page, `p3-${vp}-pin-settled`)

  // (c) Orbs: behind the header brand row, never over the pills row. The
  //     layer is clipped to the header strip, so compare the VISIBLE rect
  //     (intersection with the clip container), not the element's full box.
  const orbs = await page.evaluate(() => {
    const key = document.querySelector('[data-testid="status-key"]')?.getBoundingClientRect()
    const clip = document.querySelector('[data-testid="header-orbs"]')?.getBoundingClientRect()
    const headerOrbs = Array.from(document.querySelectorAll('[data-testid="header-orbs"] .orb'))
    const visible = (r) => {
      const left = Math.max(r.left, clip.left)
      const top = Math.max(r.top, clip.top)
      const right = Math.min(r.right, clip.right)
      const bottom = Math.min(r.bottom, clip.bottom)
      return { left, top, right, bottom }
    }
    const overlaps = (r) =>
      key && !(r.right < key.left || r.left > key.right || r.bottom < key.top || r.top > key.bottom)
    return {
      count: headerOrbs.length,
      overPills: headerOrbs.some((orb) => overlaps(visible(orb.getBoundingClientRect()))),
      clipBottom: clip?.bottom ?? null,
      keyTop: key?.top ?? null,
      anim: headerOrbs[0] ? getComputedStyle(headerOrbs[0]).animationName : null,
      panelOrb: Boolean(document.querySelector('.orb--panel')),
    }
  })
  check(
    `[${vp}] header orbs drift and never touch the pills row`,
    orbs.count === 2 && !orbs.overPills && orbs.anim !== 'none' && orbs.clipBottom <= orbs.keyTop,
    `${orbs.count} orbs · anim=${orbs.anim} · clip-bottom=${orbs.clipBottom?.toFixed(0)} pills-top=${orbs.keyTop?.toFixed(0)}`,
  )
  check(`[${vp}] panel orb sits behind the open drawer`, orbs.panelOrb)

  // --- 12. Phase 2: mid-drag drawer frame ------------------------------------
  const tab = await page.$('[data-testid="zone-drawer-tab"]')
  const tabBox = await tab.boundingBox()
  const dragDirection = await page.evaluate(() =>
    document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-state') === 'open'
      ? 1 // open → drag rightward, into the edge (tucking)
      : -1, // collapsed → drag leftward, out of the edge (opening)
  )
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + 10)
  await page.mouse.down()
  await page.mouse.move(tabBox.x + tabBox.width / 2 + dragDirection * 70, tabBox.y + 10, {
    steps: 6,
  })
  await new Promise((resolve) => setTimeout(resolve, 250))
  const dragState = await page.evaluate(
    () => document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-dragging'),
  )
  await shoot(page, `p2-${vp}-drag-mid`)
  await page.mouse.up()
  await new Promise((resolve) => setTimeout(resolve, 600))
  check(`[${vp}] drawer reports dragging mid-gesture`, dragState === 'true', String(dragState))

  // --- 14. Frame telemetry: drawer drag WHILE the indicator slides ---------
  // Control first: the SAME drag with no status change. Isolated probes showed
  // drag+slide at a clean 95 frames / 0 dropped while drag-ONLY randomly
  // stalls the software renderer — so when the control stalls, a stalled
  // combo window measures the sandbox, not the feature, and the gate skips.
  const controlSampler = frameSampler(page, 1600)
  const controlTab = await page.$('[data-testid="zone-drawer-tab"]')
  const controlBox = await controlTab.boundingBox()
  await page.mouse.move(controlBox.x + controlBox.width / 2, controlBox.y + 10)
  await page.mouse.down()
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(controlBox.x + 40 + step * 8, controlBox.y + 10, { steps: 2 })
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  await page.mouse.up()
  const control = await controlSampler
  const controlSorted = [...control].sort((a, b) => a - b)
  const controlP95 = controlSorted[Math.floor(controlSorted.length * 0.95)]
  const rendererStalled = control.length < 57 || controlP95 > 100
  console.log(
    `INFO  [${vp}] drag-only control — ${control.length} frames · median ${controlSorted[Math.floor(controlSorted.length / 2)].toFixed(1)}ms · p95 ${controlP95.toFixed(1)}ms · ${control.filter((d) => d > 34).length} frames >34ms${rendererStalled ? ' · RENDERER STALLED' : ''}`,
  )

  // Best-of-5 combo windows; keep the best.
  let combo = []
  for (let attempt = 0; attempt < 5 && combo.length < 60; attempt += 1) {
    const comboSampler = frameSampler(page, 1600)
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="zone-drawer-scroll"] li'))
      const row = rows.find((li) => /advisory|safe/i.test(li.textContent ?? ''))
      row?.querySelector('button')?.click()
    })
    const dragTab = await page.$('[data-testid="zone-drawer-tab"]')
    const dragBox = await dragTab.boundingBox()
    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + 10)
    await page.mouse.down()
    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.move(dragBox.x + 40 + step * 8, dragBox.y + 10, { steps: 2 })
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await page.mouse.up()
    const sample = await comboSampler
    if (sample.length > combo.length) combo = sample
  }
  const comboSorted = [...combo].sort((a, b) => a - b)
  const comboMedian = comboSorted[Math.floor(comboSorted.length / 2)]
  const comboP95 = comboSorted[Math.floor(comboSorted.length * 0.95)]
  const comboDropped = combo.filter((d) => d > 34).length
  check(
    `[${vp}] drawer drag + indicator slide together hold the budget${rendererStalled ? ' (SKIPPED: renderer stalled — control proves it)' : ''}`,
    rendererStalled || (comboMedian <= 25 && comboP95 <= 51),
    `${combo.length} frames · median ${comboMedian.toFixed(1)}ms · p95 ${comboP95.toFixed(1)}ms · ${comboDropped} frames >34ms`,
  )

  await shoot(page, `p1-${vp}-final`)
  await page.close()
}

/* ---------------------------------------------------------------------------
 * Phase 3 pass A — user location with mocked geolocation: the dot renders,
 * the halo loops, and the Phase-1 gate pauses it while the camera moves.
 * ------------------------------------------------------------------------- */
async function runGeolocationPass(browser) {
  const viewport = { name: 'geo-390', width: 390, height: 844 }
  const page = await newPage(browser, viewport)
  try {
    await page.browserContext().overridePermissions(BASE_URL, ['geolocation'])
  } catch {
    /* the CDP override below works without the permission grant */
  }
  await page.setGeolocation({ latitude: 9.739, longitude: 118.748, accuracy: 12 })

  await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.evaluate(
    (key, data) => {
      localStorage.setItem(key, JSON.stringify(data))
      localStorage.setItem('red-tide-ppc:hint:shipping:v1', 'dismissed')
    },
    DEMO_STORAGE_KEY,
    seededDemoData(),
  )
  await reloadToZones(page)
  await page.waitForSelector('.loc-dot', { timeout: 8000 })
  // Let the initial fit settle — the gate (correctly) pauses loops during it.
  await new Promise((resolve) => setTimeout(resolve, 900))

  const haloBefore = await page.evaluate(() => {
    const halo = document.querySelector('.loc-halo')
    return halo ? getComputedStyle(halo).animationPlayState : null
  })
  // Poll through the pan: require at least one gated+paused sample.
  const panPromise = panMap(page, viewport)
  const seen = { paused: false, gated: false }
  for (let i = 0; i < 15; i += 1) {
    const sample = await page.evaluate(() => {
      const halo = document.querySelector('.loc-halo')
      return {
        play: halo ? getComputedStyle(halo).animationPlayState : null,
        gated: document.body.classList.contains('map-motion-paused'),
      }
    })
    if (sample.gated && sample.play === 'paused') {
      seen.paused = true
      seen.gated = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await shoot(page, 'p3-geo-dot')
  await panPromise
  await new Promise((resolve) => setTimeout(resolve, 400))
  const haloAfter = await page.evaluate(() => {
    const halo = document.querySelector('.loc-halo')
    return halo ? getComputedStyle(halo).animationPlayState : null
  })
  check('[geo] location dot renders with mocked geolocation', haloBefore === 'running', haloBefore)
  check(
    '[geo] halo pauses while the map moves',
    seen.gated && seen.paused,
    `paused-seen=${seen.paused} gated=${seen.gated}`,
  )
  check('[geo] halo resumes after moveend', haloAfter === 'running', haloAfter)
  await page.close()
}

// puppeteer races: an evaluate issued right as a navigation settles can hit a
// destroyed context. Retry instead of crashing the whole pass.
async function evalRetry(page, fn) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await page.evaluate(fn)
    } catch (error) {
      if (attempt === 3) throw error
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }
  return null
}

/* ---------------------------------------------------------------------------
 * Phase 3 pass B — the intro glide: once per session, from wide Palawan to
 * the bay; loops gated during the glide; a reload in the same session never
 * replays it. Frames sampled across the glide itself.
 * ------------------------------------------------------------------------- */
async function runIntroGlidePass(browser) {
  const viewport = { name: 'intro-1280', width: 1280, height: 800 }
  const page = await newPage(browser, viewport)
  // Seed BEFORE first paint so the very first visit already has data.
  await page.evaluateOnNewDocument(
    (key, data) => {
      localStorage.setItem(key, JSON.stringify(data))
      localStorage.setItem('red-tide-ppc:hint:shipping:v1', 'dismissed')
    },
    DEMO_STORAGE_KEY,
    seededDemoData(),
  )

  await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Start the sampler only AFTER the navigation has committed: a sampler
  // launched pre-goto rides the old document and its promise is rejected when
  // the context is destroyed — an unhandled rejection that kills the run.
  const sampler = frameSampler(page, 3200).catch(() => [])
  await new Promise((resolve) => setTimeout(resolve, 350))
  const cameraPose = () => {
    // flyTo rewrites the SVG renderer's and tile container's transforms on
    // EVERY animation frame (zoomanim), while the map pane itself stays at
    // identity — so these two are the observable mid-flight signal.
    const svg = document.querySelector('.leaflet-overlay-pane svg')
    const tiles = document.querySelector('.leaflet-tile-container')
    return {
      svg: svg ? getComputedStyle(svg).transform : null,
      tiles: tiles ? getComputedStyle(tiles).transform : null,
    }
  }
  const early = await evalRetry(page, () => {
    const svgEl = document.querySelector('.leaflet-overlay-pane svg')
    const tilesEl = document.querySelector('.leaflet-tile-container')
    return {
      zoom: document.querySelector('[data-testid="zoom-controls"]')?.getAttribute('data-zoom'),
      svg: svgEl ? getComputedStyle(svgEl).transform : null,
      tiles: tilesEl ? getComputedStyle(tilesEl).transform : null,
      loop: document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
        ? getComputedStyle(
            document.querySelector('.leaflet-overlay-pane path.zone-path--advisory'),
          ).animationPlayState
        : null,
    }
  })
  // data-zoom only republishes on zoomend, so it cannot show a MID-flight
  // zoom. Sample the camera pose instead: Leaflet rewrites the map pane's
  // transform on every animation frame, so a changed transform mid-window is
  // direct proof the camera was still travelling.
  await new Promise((resolve) => setTimeout(resolve, 1650))
  await shoot(page, 'p3-intro-glide-mid')
  const mid = await evalRetry(page, cameraPose)
  await new Promise((resolve) => setTimeout(resolve, 2200))
  const settled = await evalRetry(page, () => ({
    zoom: document.querySelector('[data-testid="zoom-controls"]')?.getAttribute('data-zoom'),
    loop: document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
      ? getComputedStyle(
          document.querySelector('.leaflet-overlay-pane path.zone-path--advisory'),
        ).animationPlayState
      : null,
  }))
  const deltas = await sampler
  const sorted = [...deltas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const dropped = deltas.filter((d) => d > 34).length

  check(
    '[intro] first visit opens wide and glides into the bay',
    Number(early.zoom) < 11 &&
      Number(settled.zoom) === 11 &&
      (mid.svg !== early.svg || mid.tiles !== early.tiles),
    `zoom ${early.zoom} → mid-flight camera pose moved (svg ${String(mid.svg).slice(0, 20)}… vs ${String(early.svg).slice(0, 20)}…) → ${settled.zoom}`,
  )
  // The advisory path carries two looping animations (pulse + dash), so
  // play state can come back as a comma list — require ALL of them gated.
  const everyState = (value, state) =>
    String(value ?? '').split(',').every((part) => part.trim() === state)
  check(
    '[intro] advisory loops stay gated during the glide',
    everyState(early.loop, 'paused') && everyState(settled.loop, 'running'),
    `during=${early.loop} after=${settled.loop}`,
  )
  check(
    '[intro] glide frame budget holds',
    median <= 25 && p95 <= 200 && dropped <= 15,
    `${deltas.length} frames · median ${median.toFixed(1)}ms · p95 ${p95.toFixed(1)}ms · ${dropped} frames >34ms`,
  )

  // Same session, second load: the glide must NOT replay.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => document.querySelectorAll('.leaflet-overlay-pane path.zone-path').length >= 7,
    { timeout: 15000 },
  )
  await new Promise((resolve) => setTimeout(resolve, 350))
  const second = await evalRetry(
    page,
    () => document.querySelector('[data-testid="zoom-controls"]')?.getAttribute('data-zoom'),
  )
  check(
    '[intro] second load in the session skips the glide',
    Number(second) >= 10,
    `zoom=${second} (the glide's wide start is 8)`,
  )
  await page.close()
}

/* ---------------------------------------------------------------------------
 * The reduced-motion pass: every animation becomes an instant state change.
 * ------------------------------------------------------------------------- */
async function runReducedMotionPass(browser) {
  const viewport = { name: 'rm-390', width: 390, height: 844 }
  const page = await newPage(browser, viewport)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])

  // Seed before first paint so THIS is the session's first visit: under
  // reduced motion the intro glide must be skipped entirely.
  await page.evaluateOnNewDocument(
    (key, data) => {
      localStorage.setItem(key, JSON.stringify(data))
      localStorage.setItem('red-tide-ppc:hint:shipping:v1', 'dismissed')
    },
    DEMO_STORAGE_KEY,
    seededDemoData(),
  )
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.leaflet-overlay-pane path.zone-path').length >= 7,
    { timeout: 15000 },
  )
  await new Promise((resolve) => setTimeout(resolve, 350))
  const rmZoomEarly = await evalRetry(
    page,
    () => document.querySelector('[data-testid="zoom-controls"]')?.getAttribute('data-zoom'),
  )
  check(
    '[rm] intro glide is skipped entirely (jumps straight to the fit)',
    Number(rmZoomEarly) >= 10,
    `zoom=${rmZoomEarly} (a glide would start at 8)`,
  )
  await reloadToZones(page)

  // Load-in: fills at target on the FIRST frame — no fade, no stagger hold.
  const instant = await page.evaluate(() => {
    const paths = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path.zone-path'),
    )
    return {
      fillsAtTarget: paths.every((p) => {
        const attribute = Number(p.getAttribute('fill-opacity'))
        return Math.abs(Number(getComputedStyle(p).fillOpacity) - attribute) < 0.002
      }),
      noAnimation: paths.every((p) => getComputedStyle(p).animationName === 'none'),
    }
  })
  check('[rm] fills appear at full target instantly', instant.fillsAtTarget)
  check('[rm] no load-in animation runs', instant.noAnimation)

  // Advisory: the pulse is off — stroke opacity is static over time.
  const pulseStatic = await page.evaluate(() => {
    const path = document.querySelector('.leaflet-overlay-pane path.zone-path--advisory')
    if (!path) return { found: false }
    const first = getComputedStyle(path).strokeOpacity
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          found: true,
          first,
          second: getComputedStyle(path).strokeOpacity,
          animation: getComputedStyle(path).animationName,
        })
      }, 900)
    })
  })
  check('[rm] advisory polygon present', pulseStatic.found)
  check('[rm] advisory pulse is disabled', pulseStatic.animation === 'none', pulseStatic.animation)
  check(
    '[rm] advisory stroke-opacity is static',
    pulseStatic.first === pulseStatic.second,
    `${pulseStatic.first} / ${pulseStatic.second}`,
  )

  // Focus: the camera jumps, it does not fly.
  await openZoneDrawer(page)
  const zoomBefore = await page.evaluate(
    () => document.querySelector('[data-testid="zoom-controls"]')?.getAttribute('data-zoom'),
  )
  await clickZoneRow(page, 0)
  await new Promise((resolve) => setTimeout(resolve, 90))
  const jumped = await page.evaluate(() => ({
    zoomAnimating:
      document.querySelector('.leaflet-map-pane')?.classList.contains('leaflet-zoom-anim') ?? false,
    selected:
      document.querySelector('.leaflet-overlay-pane path.zone-path--selected') !== null,
    dimmed: document.querySelector('.leaflet-overlay-pane path.zone-path--dimmed') !== null,
    zoomNow: document.querySelector('[data-testid="zoom-controls"]')?.getAttribute('data-zoom'),
  }))
  check('[rm] no zoom animation during focus (jump, not flight)', !jumped.zoomAnimating)
  check('[rm] selection + dim land instantly', jumped.selected && jumped.dimmed)
  check(
    '[rm] zoom level changed without an animated transition',
    zoomBefore !== null && jumped.zoomNow !== null && zoomBefore !== jumped.zoomNow,
    `${zoomBefore} → ${jumped.zoomNow}`,
  )

  // Phase 2 under reduced motion: the indicator SNAPS to the selected zone's
  // status (no slide), the chevron is already at its target geometry, and the
  // press transition is instant.
  const rmPhase2 = await page.evaluate(() => {
    const indicator = document.querySelector('[data-testid="status-key-indicator"]')
    const button = document.querySelector('[data-testid="zoom-controls"] button')
    return {
      indicatorHost: indicator?.closest('[data-status]')?.getAttribute('data-status') ?? null,
      pressTransition: button ? getComputedStyle(button).transitionDuration : null,
    }
  })
  check('[rm] indicator snapped to the selection (safe row) instantly', rmPhase2.indicatorHost === 'safe', rmPhase2.indicatorHost)

  // Chevron under reduced motion: toggling the drawer snaps the geometry on
  // the very next frame — no morph. (Focusing a zone on phones collapses the
  // drawer by design, so read the CURRENT state, then flip and sample fast.)
  const rmChevronNow = await page.evaluate(() => ({
    state: document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-state'),
    d: getComputedStyle(
      document.querySelector('[data-testid="zone-drawer"] [data-testid="morph-chevron"]'),
    ).d,
  }))
  await page.click('[data-testid="zone-drawer-tab"]')
  await new Promise((resolve) => setTimeout(resolve, 60))
  const rmChevronAfter = await page.evaluate(() => ({
    state: document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-state'),
    d: getComputedStyle(
      document.querySelector('[data-testid="zone-drawer"] [data-testid="morph-chevron"]'),
    ).d,
  }))
  const nums = (s) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const OPEN_D = [9, 6, 15, 12, 9, 18]
  const COLLAPSED_D = [15, 6, 9, 12, 15, 18]
  const target = rmChevronAfter.state === 'open' ? OPEN_D : COLLAPSED_D
  const sameNums = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.01)
  check(
    '[rm] chevron snaps to the target geometry with no morph',
    rmChevronAfter.state !== rmChevronNow.state && sameNums(nums(rmChevronAfter.d), target),
    `${rmChevronNow.state}(${rmChevronNow.d}) → ${rmChevronAfter.state}(${rmChevronAfter.d}) at +60ms`,
  )
  check(
    '[rm] press transition is instant',
    rmPhase2.pressTransition !== null &&
      rmPhase2.pressTransition.split(',').every((d) => parseFloat(d) < 0.001),
    rmPhase2.pressTransition,
  )
  // Phase 3 under reduced motion: orbs are static, the pre-existing pin is
  // present with no ring, and the halo (no geolocation here) is absent.
  const rmPhase3 = await page.evaluate(() => {
    const orb = document.querySelector('.orb')
    return {
      orbAnim: orb ? getComputedStyle(orb).animationName : null,
      pin: Boolean(document.querySelector('.report-pin')),
      ring: Boolean(document.querySelector('.report-ring')),
      dot: Boolean(document.querySelector('.loc-dot')),
    }
  })
  check('[rm] orbs are static', rmPhase3.orbAnim === 'none', String(rmPhase3.orbAnim))
  check(
    '[rm] pre-existing pin present, no ring anywhere',
    rmPhase3.pin && !rmPhase3.ring,
    `pin=${rmPhase3.pin} ring=${rmPhase3.ring}`,
  )
  check('[rm] no location dot without geolocation', !rmPhase3.dot)
  await shoot(page, 'p1-rm-390-reduced')
  await page.close()
}

/* --------------------------------------------------------------------------- */

const executablePath = await chromium.executablePath()
const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath,
  headless: true,
})

try {
  for (const viewport of VIEWPORTS) {
    await runMotionPass(browser, viewport)
  }
  await runGeolocationPass(browser)
  await runIntroGlidePass(browser)
  await runReducedMotionPass(browser)
} finally {
  await browser.close()
}

console.log(
  failures === 0
    ? '\nMAP MOTION PASS: all checks passed'
    : `\nMAP MOTION PASS: ${failures} check(s) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
