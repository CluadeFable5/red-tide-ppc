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
 *   1. load /map, open the zone drawer, click the pp-bay zone row → the app
 *      fitBounds the zone (maxZoom 13); collapse both drawers →
 *      `<prefix>-focus.png`;
 *   2. navigate by the tile grid (absolute geography, closed-loop on tile
 *      z — immune to zoom-readout lag) to the app's north reach at z15 →
 *      `<prefix>-extension.png`;
 *   3. same to the app's terminus at z17 → `<prefix>-apex.png`.
 *
 * The before/after framings differ on purpose (the polygons differ — that is
 * the point): before shows the zone ending at the San Jose waterfront, after
 * shows it continuing past the cove and the E-W corner to the headland apex.
 *
 * Usage:
 *   BASE_URL=http://localhost:4173 OUT_DIR=docs/pp-bay-extension-shots PREFIX=after \
 *     REQUIRE_TILES=1 node scripts/pp-bay-extension-shots.mjs
 *
 * Env:
 *   BASE_URL      app base (default http://localhost:4173)
 *   OUT_DIR       screenshot dir (default docs/pp-bay-extension-shots)
 *   PREFIX        `before` (pre-task base) or `after` (this branch)
 *   REQUIRE_TILES fail loudly when zero tiles loaded (set in CI; sandbox
 *                 smoke runs leave it unset — tiles are blocked there)
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

/** Absolute-geography framing targets per app. [lat, lng, zoom] */
const TARGETS =
  PREFIX === 'before'
    ? {
        // Pre-extension pp-bay ends at the San Jose waterfront (9.7611).
        extension: [9.757, 118.735, 15],
        apex: [9.7611, 118.7338, 17],
      }
    : {
        // Crossover of cove + E-W corner, then the headland apex + cap.
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
  // During zoom animations two zoom levels coexist; the mode wins.
  const byZ = new Map()
  for (const t of tiles) byZ.set(t.z, (byZ.get(t.z) ?? 0) + 1)
  const z = [...byZ.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return tiles.filter((t) => t.z === z)
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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * Frame (lat, lng) centred at `targetZ`: wheel-zoom at the target's current
 * pixel until the tile grid reads targetZ, then drag-pan it to the centre.
 * Closed-loop on the tile grid, so zoom-readout lag cannot overshoot.
 */
async function frameTarget(page, lat, lng, targetZ) {
  for (let i = 0; i < 16; i++) {
    const grid = await tileGrid(page)
    if (!grid.length) throw new Error('tile grid vanished')
    const p = project(grid, lat, lng)
    if (p.z === targetZ) break
    await page.mouse.move(clamp(p.x, 0, 1279), clamp(p.y, 0, 799))
    // One tick can move several levels; small deltas keep it controllable.
    await page.mouse.wheel({ deltaY: p.z < targetZ ? -60 : 80 })
    await sleep(900)
  }
  await sleep(800)
  // Centre the target with up to two drag-pans.
  for (let i = 0; i < 2; i++) {
    const grid = await tileGrid(page)
    const p = project(grid, lat, lng)
    const dx = 640 - p.x
    const dy = 400 - p.y
    if (Math.hypot(dx, dy) < 25) break
    await page.mouse.move(640, 400)
    await page.mouse.down()
    await page.mouse.move(640 + dx * 0.9, 400 + dy * 0.9, { steps: 8 })
    await page.mouse.up()
    await sleep(1100)
  }
  const done = project(await tileGrid(page), lat, lng)
  console.log(
    `framed (${lat}, ${lng}) @z${done.z}: pixel (${done.x.toFixed(0)}, ${done.y.toFixed(0)})`,
  )
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

  // Real user path: click the pp-bay zone row → app focuses the zone.
  const clicked = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('[data-testid="zone-drawer"] h3')]
    const h = heads.find((el) => el.textContent?.includes('Puerto Princesa Bay'))
    if (!h) return false
    h.closest('button')?.click()
    return true
  })
  if (!clicked) throw new Error('pp-bay zone row not found')
  await sleep(2200)

  // Collapse both drawers for a clean map (view already focused).
  for (const tab of ['[data-testid="zone-drawer-tab"]', '[data-testid="advisory-drawer-tab"]']) {
    const st = await page
      .$eval(tab.replace('-tab', ''), (el) => el.dataset.state)
      .catch(() => 'open')
    if (st === 'open') {
      await page.click(tab)
      await sleep(700)
    }
  }
  // Dismiss the shipping-lanes hint card for clean map shots.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('GOT IT'),
    )
    btn?.click()
  })
  await sleep(400)

  // Waypoints (truth) marked on debug shots: [label, lat, lng].
  const WAYPOINTS =
    PREFIX === 'before'
      ? [
          ['cap', 9.7611, 118.7338],
          ['reach', 9.757, 118.735],
        ]
      : [
          ['apex', 9.7877, 118.7194],
          ['climb-mid', 9.781, 118.7215],
          ['corner', 9.776, 118.7358],
          ['ew-west', 9.7742, 118.7276],
          ['cove-dip', 9.7689, 118.7265],
          ['cana', 9.7634, 118.7195],
        ]
  /** Fresh-grid waypoint overlay: markers are truth at screenshot time. */
  async function markTruth() {
    if (process.env.MARK_TRUTH !== '1') return
    const grid = await tileGrid(page)
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
