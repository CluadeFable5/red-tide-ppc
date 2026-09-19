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
 * - the tile grid is read through a STABILITY GATE (two identical reads):
 *   freshly zoomed/panned views hold mixed tile sets while new tiles load,
 *   and a naive read drifts the frame kilometres off-target;
 * - each zoom level is done as pan-target-to-centre FIRST (cheap at low z,
 *   capped 250 px drags so endpoints stay in-viewport) and only then ONE
 *   wheel tick AT THE CENTRE — centre-zooming pins the target no matter how
 *   many levels one tick jumps, immune to tick-size variance between builds;
 * - every framing ends in an ASSERT (right tile-z, target within 60 px of
 *   the centre) so a misframe fails loudly instead of committing lies.
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
 * Stability gate: two identical grid reads 600 ms apart (same mode-z, same
 * tile count, same tile keys). Fresh views hold mixed tile generations while
 * new tiles arrive; navigating on a mid-transition grid drifts kilometres.
 */
async function stableGrid(page, tries = 14) {
  const key = (g) => `${g[0]?.z}:${g.length}:` + g.map((t) => `${t.x}/${t.y}`).sort().join(',')
  let prev = await tileGrid(page)
  await sleep(600)
  for (let i = 0; i < tries; i++) {
    const cur = await tileGrid(page)
    if (cur.length && key(cur) === key(prev)) return cur
    prev = cur
    await sleep(600)
  }
  if (!prev.length) throw new Error('tile grid vanished')
  return prev // best effort after ~9 s; the framing assert guards us
}

/** Project lat/lng to viewport pixels from a tile-grid anchor (Web-Mercator). */
function project(grid, lat, lng) {
  const t = grid[0]
  const n = 2 ** t.z
  const wx = ((lng + 180) / 360) * n
  const latR = (lat * Math.PI) / 180
  const wy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n
  return { x: t.px + (wx - t.x) * 256, y: t.py + (wy - t.y) * 256, z: t.z }
}

const CX = 640
const CY = 400

/** One capped drag-pan of the content by (dx, dy) px (slow: kills inertia). */
async function dragPan(page, dx, dy) {
  await page.mouse.move(CX, CY)
  await page.mouse.down()
  await page.mouse.move(CX + dx, CY + dy, { steps: 12 })
  await page.mouse.up()
  await sleep(1300) // inertia glide + tile reload
}

/** Pan until (lat, lng) sits within `tol` px of the centre (capped drags). */
async function panTo(page, lat, lng, tol = 30, maxPans = 12) {
  for (let i = 0; i < maxPans; i++) {
    const p = project(await stableGrid(page), lat, lng)
    const dx = CX - p.x
    const dy = CY - p.y
    if (Math.hypot(dx, dy) <= tol) return p
    const cap = 250 / Math.max(250, Math.hypot(dx, dy))
    await dragPan(page, dx * cap * 0.95, dy * cap * 0.95)
  }
  const p = project(await stableGrid(page), lat, lng)
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
 * the target stays pinned whatever a tick jumps. Ends in an assert.
 */
async function frameTarget(page, lat, lng, targetZ) {
  for (let i = 0; i < 12; i++) {
    let p = await panTo(page, lat, lng)
    if (p.z === targetZ) break
    await page.mouse.move(CX, CY)
    await page.mouse.wheel({ deltaY: p.z < targetZ ? -50 : 90 })
    await sleep(1400)
  }
  const done = await panTo(page, lat, lng, 30)
  console.log(
    `framed (${lat}, ${lng}): tile-z ${done.z} (want ${targetZ}), pixel (${done.x.toFixed(0)}, ${done.y.toFixed(0)})`,
  )
  if (done.z !== targetZ || Math.hypot(CX - done.x, CY - done.y) > 60) {
    throw new Error(
      `misframe: (${lat}, ${lng}) @z${targetZ} landed @z${done.z} pixel (${done.x.toFixed(0)}, ${done.y.toFixed(0)})`,
    )
  }
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
    const grid = await stableGrid(page)
    const marks = WAYPOINTS.map(([label, la, ln]) => ({ label, ...project(grid, la, ln) }))
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
