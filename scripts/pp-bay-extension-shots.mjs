#!/usr/bin/env node
/**
 * Before/after screenshots for the pp-bay northern extension (San Jose
 * shore to the headland apex) against REAL map tiles.
 *
 * Why this exists as a CI job (see .github/workflows/pp-bay-extension-shots.yml):
 * the dev sandbox cannot reach any tile host (egress-blocked), so real-tile
 * screenshots can only be captured on a GitHub runner. The workflow builds
 * the branch (after) and the pre-task base (before) side by side, runs this
 * script against each, and commits the PNGs back to the branch.
 *
 * Framing (real user paths + tile-grid navigation — no map-handle hacks):
 *   1. load /map, open the zone drawer, click the pp-bay zone row → selects
 *      the zone; collapse both drawers, dismiss the hint card;
 *   2. navigate by the tile grid (absolute geography) to each framing and
 *      screenshot it: `<prefix>-focus.png` (z13 whole zone),
 *      `<prefix>-extension.png` (z15 north reach), `<prefix>-apex.png`
 *      (z17 terminus).
 *
 * The before/after framings differ on purpose (the polygons differ — that is
 * the point): before shows the zone ending at the San Jose waterfront, after
 * shows it continuing past the cove and the E-W run to the headland apex.
 *
 * Navigation robustness (learned the hard way against real tiles):
 * - Leaflet moves panes by CSS first and reloads tile srcs after (debounced
 *   + network-slow on CI): a read right after a move sees STALE srcs with
 *   live rects — coherently wrong, so even 3-anchor consensus agrees on a
 *   kilometres-off projection (measured: identical misframes across runs).
 *   Every post-move read therefore goes through a FRESHNESS gate (wait for
 *   the grid to DIFFER from pre-move, then stabilise on srcs AND rects);
 * - each zoom level is done as pan-target-to-centre FIRST (cheap at low z,
 *   capped 200 px drags so endpoints stay in-viewport) and only then ONE
 *   wheel tick AT THE CENTRE — centre-zooming pins the target no matter how
 *   many levels one tick jumps, immune to tick-size variance between builds;
 * - CSS animations are killed (steady-state pixels identical) so panes stop
 *   on a dime; every framing ends in a DOUBLE-READ assert (two consensus
 *   projections 1.5 s apart must agree AND centre the target at the right
 *   tile-z) so a misframe fails loudly instead of committing lies.
 *
 * Usage:
 *   BASE_URL=http://localhost:4173 PREFIX=after REQUIRE_TILES=1 \
 *     node scripts/pp-bay-extension-shots.mjs
 *
 * Env:
 *   BASE_URL      app base (default http://localhost:4173)
 *   OUT_DIR       screenshot dir (default docs/pp-bay-extension-shots)
 *   PREFIX        `before` (pre-task base) or `after` (this branch)
 *   REQUIRE_TILES fail loudly when zero tiles loaded (set in CI; sandbox
 *                 smoke runs leave it unset — tiles are blocked there)
 *   MARK_TRUTH    `1` overlays labelled land/water waypoint markers computed
 *                 from a fresh tile grid at screenshot time (debug forensics)
 *
 * Chromium: puppeteer's bundled browser when present (CI runners download
 * it on `npm ci`), falling back to @sparticuz/chromium when installed
 * (sandbox smoke runs: `npm i --no-save @sparticuz/chromium`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT_DIR = process.env.OUT_DIR ?? 'docs/pp-bay-extension-shots'
const PREFIX = process.env.PREFIX ?? 'after'
const REQUIRE_TILES = process.env.REQUIRE_TILES === '1'
fs.mkdirSync(OUT_DIR, { recursive: true })

/** Absolute-geography framing targets per app: [lat, lng, zoom]. */
const TARGETS =
  PREFIX === 'before'
    ? {
        // Pre-extension pp-bay: lighthouse → San Jose waterfront cap.
        focus: [9.739694, 118.74572, 13],
        extension: [9.757, 118.735, 15],
        apex: [9.7611, 118.7338, 17],
      }
    : {
        // Whole zone, then the cove/E-W junction, then the headland apex.
        focus: [9.752996, 118.742617, 13],
        extension: [9.7735, 118.7285, 15],
        apex: [9.7862, 118.7197, 17],
      }

async function launch() {
  try {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  } catch (firstErr) {
    console.log(`bundled Chromium unavailable (${firstErr.message.split('\n')[0]}); trying @sparticuz/chromium`)
    const require = createRequire(import.meta.url)
    const mod = require('@sparticuz/chromium')
    const chromium = mod.default ?? mod
    const inflate = mod.inflate ?? chromium.inflate
    const executablePath = await chromium.executablePath()
    let libDir = '/tmp/al2023/lib'
    try {
      if (!fs.existsSync(libDir)) {
        libDir = path.join(await inflate('node_modules/@sparticuz/chromium/bin/al2023.tar.br'), 'lib')
      }
    } catch { /* launch fails loudly below if libs are missing */ }
    return puppeteer.launch({
      executablePath,
      headless: true,
      env: { ...process.env, LD_LIBRARY_PATH: `${libDir}:${process.env.LD_LIBRARY_PATH ?? ''}` },
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Visible tile grid: [{z, x, y, px, py}] — ground truth for zoom + projection. */
async function tileGrid(page) {
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('img.leaflet-tile')]
      .map((img) => {
        const m = img.src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/)
        if (!m) return null
        const r = img.getBoundingClientRect()
        return { z: +m[1], x: +m[2], y: +m[3], px: r.x, py: r.y }
      })
      .filter(Boolean),
  )
  // During zoom/pan transitions several generations coexist; the mode wins.
  const byZ = new Map()
  for (const t of tiles) byZ.set(t.z, (byZ.get(t.z) ?? 0) + 1)
  const z = [...byZ.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return tiles.filter((t) => t.z === z)
}

/**
 * Full grid signature: srcs AND rounded rects. Leaflet moves panes by CSS
 * first and reloads tile srcs after (debounced + network-slow on CI), so a
 * src-only signature reads "stable" on a stale grid for seconds — every
 * anchor then agrees on a coherently-wrong projection (measured: identical
 * kilometre-scale misframes across runs). Rects in the key force us to wait
 * out animations; srcs in the key force us to wait out reloads.
 */
function gridKey(g) {
  return `${g[0]?.z}:${g.length}:` +
    g.map((t) => `${t.x}/${t.y}@${Math.round(t.px)},${Math.round(t.py)}`).sort().join(',')
}

/** Two identical full-signature reads 700 ms apart. */
async function stableGrid(page, tries = 16) {
  let prev = await tileGrid(page)
  await sleep(700)
  for (let i = 0; i < tries; i++) {
    const cur = await tileGrid(page)
    if (cur.length && gridKey(cur) === gridKey(prev)) return cur
    prev = cur
    await sleep(700)
  }
  if (!prev.length) throw new Error('tile grid vanished')
  return prev // best effort after ~12 s; consensus + assert guard us
}

/**
 * Freshness gate after a move: FIRST wait for the grid to DIFFER from its
 * pre-move signature (proves the reload/animation started — a same-view read
 * right after a move is definitionally stale), THEN wait for stability.
 * Small sub-tile moves may never change the src set; their rects are live,
 * so a timeout here just falls through to the stability wait.
 */
async function freshGrid(page, before) {
  for (let i = 0; i < 8; i++) {
    const cur = await tileGrid(page)
    if (cur.length && gridKey(cur) !== before) break
    await sleep(500)
  }
  return stableGrid(page)
}

/** Project lat/lng to viewport pixels from ONE tile anchor (Web-Mercator). */
function projectFrom(t, lat, lng) {
  const n = 2 ** t.z
  const wx = ((lng + 180) / 360) * n
  const latR = (lat * Math.PI) / 180
  const wy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n
  return { x: t.px + (wx - t.x) * 256, y: t.py + (wy - t.y) * 256, z: t.z }
}

/**
 * Consensus projection: the grid's DOM-first tile is NOT trustworthy — after
 * a zoom, stale placeholder tiles (old zoom, scaled rects, fading) linger in
 * the DOM next to fresh tiles, and projecting from one silently drifts
 * kilometres (measured: identical 3 km misframes on repeat runs). So project
 * from THREE widely spread tiles and require agreement; a mixed grid never
 * reaches consensus and we wait/retry instead of navigating on lies.
 */
async function consensusProject(page, lat, lng, before = null, tries = 10) {
  for (let i = 0; i < tries; i++) {
    // `before` (pre-move signature) forces the freshness wait; without a
    // preceding move a plain stability read is fine.
    const grid = before ? await freshGrid(page, before) : await stableGrid(page)
    // Spread anchors: nearest the centre, then farthest from it, then
    // farthest from both — a stale tile can't hide in all three.
    const byDist = (px, py) => [...grid].sort((a, b) =>
      Math.hypot(a.px - px, a.py - py) - Math.hypot(b.px - px, b.py - py),
    )
    const a = byDist(CX, CY)[0]
    const b = byDist(CX, CY).reverse()[0]
    const c = [...grid].sort((p, q) =>
      Math.min(Math.hypot(p.px - a.px, p.py - a.py), Math.hypot(p.px - b.px, p.py - b.py)) -
      Math.min(Math.hypot(q.px - a.px, q.py - a.py), Math.hypot(q.px - b.px, q.py - b.py)),
    ).reverse()[0]
    const ps = [a, b, c].map((t) => projectFrom(t, lat, lng))
    const zs = new Set(ps.map((p) => p.z))
    const spread = Math.max(
      Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
      Math.hypot(ps[0].x - ps[2].x, ps[0].y - ps[2].y),
      Math.hypot(ps[1].x - ps[2].x, ps[1].y - ps[2].y),
    )
    if (zs.size === 1 && spread <= 8) {
      return {
        x: (ps[0].x + ps[1].x + ps[2].x) / 3,
        y: (ps[0].y + ps[1].y + ps[2].y) / 3,
        z: ps[0].z,
      }
    }
    await sleep(700)
  }
  throw new Error(
    `tile grid never reached projection consensus for (${lat}, ${lng}) — refusing to misframe`,
  )
}

const CX = 640
const CY = 400

/**
 * One capped drag-pan of the content by (dx, dy) px (slow, many steps: kills
 * inertia). Returns the pre-move grid signature for the freshness gate.
 */
async function dragPan(page, dx, dy) {
  const before = gridKey(await tileGrid(page))
  await page.mouse.move(CX, CY)
  await page.mouse.down()
  await page.mouse.move(CX + dx, CY + dy, { steps: 16 })
  await page.mouse.up()
  await sleep(1600) // inertia glide + tile reload
  return before
}

/** Pan until (lat, lng) sits within `tol` px of the centre (capped drags). */
async function panTo(page, lat, lng, before = null, tol = 30, maxPans = 14) {
  for (let i = 0; i < maxPans; i++) {
    const p = await consensusProject(page, lat, lng, before)
    before = null // freshness consumed; subsequent reads settle on their own
    const dx = CX - p.x
    const dy = CY - p.y
    if (Math.hypot(dx, dy) <= tol) return p
    const cap = 200 / Math.max(200, Math.hypot(dx, dy))
    before = await dragPan(page, dx * cap * 0.95, dy * cap * 0.95)
  }
  const p = await consensusProject(page, lat, lng, before)
  if (Math.hypot(CX - p.x, CY - p.y) > 100) {
    throw new Error(
      `pan to (${lat}, ${lng}) stalled at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) — refusing to misframe`,
    )
  }
  return p
}

/**
 * Frame (lat, lng) centred at `targetZ`: per level, pan the target to the
 * centre FIRST (cheap at low z) and only then wheel ONCE at the centre, so
 * the target stays pinned whatever a tick jumps. Ends in a double-read
 * assert: two consensus projections 1.5 s apart (no moves between) must
 * agree with each other AND centre the target — a reload still landing
 * fails the second read instead of committing a stale-framed shot.
 */
async function frameTarget(page, lat, lng, targetZ) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let before = null
    for (let i = 0; i < 12; i++) {
      const p = await panTo(page, lat, lng, before)
      before = null
      if (p.z === targetZ) break
      before = gridKey(await tileGrid(page))
      await page.mouse.move(CX, CY)
      await page.mouse.wheel({ deltaY: p.z < targetZ ? -50 : 90 })
      await sleep(1800)
    }
    const first = await panTo(page, lat, lng, before, 30)
    await sleep(1500) // stillness: any pending reload lands here, not later
    const done = await consensusProject(page, lat, lng)
    const drift = Math.hypot(first.x - done.x, first.y - done.y)
    console.log(
      `framed (${lat}, ${lng}): tile-z ${done.z} (want ${targetZ}), pixel (${done.x.toFixed(0)}, ${done.y.toFixed(0)}), drift ${drift.toFixed(0)} px`,
    )
    if (done.z === targetZ && drift <= 12 && Math.hypot(CX - done.x, CY - done.y) <= 60) return
    console.log(`frame attempt ${attempt + 1} rejected (stale grid?) — retrying`)
  }
  throw new Error(`misframe: (${lat}, ${lng}) @z${targetZ} never settled — refusing to commit lies`)
}

const browser = await launch()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[data-testid="zone-drawer"]', { timeout: 15000 })
  await page.waitForFunction(
    () => document.body.textContent?.includes('6 zones · No advisories'),
    { timeout: 20000 },
  )
  // Kill CSS transitions/animations: Leaflet pans/zooms stop on a dime, so
  // post-move reads settle fast. Steady-state pixels are identical.
  await page.addStyleTag({
    content: '*{transition-duration:0s!important;animation-duration:0s!important}',
  })
  await sleep(1500)

  // Zone drawer open at desktop width; open it if not.
  const zoneState = await page.$eval('[data-testid="zone-drawer"]', (el) => el.dataset.state)
  if (zoneState !== 'open') {
    await page.click('[data-testid="zone-drawer-tab"]')
    await sleep(800)
  }

  // Real user path: click the pp-bay zone row → selects the zone.
  const clicked = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('[data-testid="zone-drawer"] h3')]
    const h = heads.find((el) => el.textContent?.includes('Puerto Princesa Bay'))
    if (!h) return false
    h.closest('button')?.click()
    return true
  })
  if (!clicked) throw new Error('pp-bay zone row not found')
  await sleep(2200)

  // Collapse both drawers for a clean map.
  for (const tab of ['[data-testid="zone-drawer-tab"]', '[data-testid="advisory-drawer-tab"]']) {
    const st = await page
      .$eval(tab.replace('-tab', ''), (el) => el.dataset.state)
      .catch(() => 'open')
    if (st === 'open') {
      await page.click(tab)
      await sleep(700)
    }
  }
  // Dismiss the shipping-lanes hint card (all VISIBLE matches — hidden
  // duplicates in collapsed drawers must not swallow the click).
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      // Button text is `Got it` (CSS uppercase renders it as GOT IT).
      if (!b.textContent?.toLowerCase().includes('got it')) continue
      const r = b.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) b.click()
    }
  })
  await sleep(400)

  // Waypoints (truth) marked on debug shots: [label, lat, lng].
  const WAYPOINTS =
    PREFIX === 'before'
      ? [
          ['cap', 9.7611, 118.7338],
          ['reach', 9.757, 118.735],
          ['cana', 9.7634, 118.7195],
        ]
      : [
          ['apex', 9.7877, 118.7194],
          ['climb-mid', 9.781, 118.7215],
          ['corner', 9.7762, 118.7353],
          ['ew-west', 9.7742, 118.7276],
          ['cove-dip', 9.7689, 118.7265],
          ['cana', 9.7634, 118.7195],
        ]
  /** Fresh-grid waypoint overlay: markers are truth at screenshot time. */
  async function markTruth() {
    if (process.env.MARK_TRUTH !== '1') return
    const marks = []
    for (const [label, la, ln] of WAYPOINTS) marks.push({ label, ...(await consensusProject(page, la, ln)) })
    await page.evaluate((ms) => {
      document.querySelector('#truth-marks')?.remove()
      const d = document.createElement('div')
      d.id = 'truth-marks'
      d.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none'
      d.innerHTML = ms
        .map(
          (m) =>
            `<div title="${m.label}" style="position:absolute;left:${m.x - 6}px;top:${m.y - 6}px;width:12px;height:12px;border-radius:50%;background:#ff0;border:2px solid #f00"></div>` +
            `<div style="position:absolute;left:${m.x + 10}px;top:${m.y - 10}px;color:#ff0;font:700 14px monospace;text-shadow:0 0 3px #000">${m.label}</div>`,
        )
        .join('')
      document.body.appendChild(d)
    }, marks)
    await sleep(250)
  }

  const tag = (n) => path.join(OUT_DIR, `${PREFIX}-${n}.png`)
  await frameTarget(page, ...TARGETS.focus)
  await markTruth()
  await page.screenshot({ path: tag('focus') })
  console.log(`shot ${tag('focus')}`)

  await frameTarget(page, ...TARGETS.extension)
  await markTruth()
  await page.screenshot({ path: tag('extension') })
  console.log(`shot ${tag('extension')}`)

  await frameTarget(page, ...TARGETS.apex)
  await markTruth()
  await page.screenshot({ path: tag('apex') })
  console.log(`shot ${tag('apex')}`)

  // Tile audit: did real tiles actually load?
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('img.leaflet-tile')].filter(
      (img) => img.complete && img.naturalWidth > 0,
    ).length,
  )
  console.log(`${PREFIX}: ${tiles} real tiles loaded`)
  if (REQUIRE_TILES && tiles === 0) {
    throw new Error('REQUIRE_TILES=1 but zero tiles loaded — screenshots show no real shoreline')
  }
  await page.close()
} finally {
  await browser.close()
}
console.log(`${PREFIX} capture done`)
