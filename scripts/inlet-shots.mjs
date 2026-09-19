#!/usr/bin/env node
/**
 * Inlet trace-identification captures (round 1).
 *
 * Frames the bay-mouth / apex / gap area on REAL OSM tiles so the
 * hand-traced inlet from the reference image can be identified against
 * rendered shoreline + the pp-bay polygon + offshore islets.
 *
 * Structure + framing stack adapted from scripts/pp-bay-extension-shots.mjs
 * (tile-grid consensus projection, drag-pan framing — no map internals).
 * No zone-row selection (the polygons render regardless) — frame + shoot.
 *
 * Env:
 *   BASE_URL      app base (default http://127.0.0.1:4175)
 *   OUT_DIR       screenshot dir (default docs/inlet-shots)
 *   PREFIX        filename prefix (default "trace-id")
 *   REQUIRE_TILES fail loudly when zero tiles loaded (default 1)
 *   MARK_TRUTH    `1` overlays labelled waypoint markers (default 1 here:
 *                 trace-id needs feature labels on the shots)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4175'
const OUT_DIR = process.env.OUT_DIR ?? 'docs/inlet-shots'
const PREFIX = process.env.PREFIX ?? 'trace-id'
const REQUIRE_TILES = (process.env.REQUIRE_TILES ?? '1') === '1'
const MARK_TRUTH = (process.env.MARK_TRUTH ?? '1') === '1'
fs.mkdirSync(OUT_DIR, { recursive: true })

// Round-1 identification framings: [lat, lng, zoom].
//  - corridor: reference-equivalent z15 (labels corridor + band + Caña + climb + apex)
//  - north:    z15 over the apex + gap (rendered shore N of apex? river mouth?)
//  - wide:     z13 bay-mouth context (far shore + estuary + river + gap)
const TARGETS = {
  corridor: [9.779, 118.7225, 15],
  north: [9.795, 118.71, 15],
  wide: [9.78, 118.715, 13],
}

// Waypoints (truth) marked on debug shots: [label, lat, lng].
const WAYPOINTS = [
  ['apex', 9.7877, 118.7194],
  ['climb', 9.7807, 118.7166],
  ['embay', 9.776, 118.708],
  ['ring134', 9.7736, 118.6993],
  ['cana', 9.7634, 118.7195],
]

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
  const byZ = new Map()
  for (const t of tiles) byZ.set(t.z, (byZ.get(t.z) ?? 0) + 1)
  const z = [...byZ.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return tiles.filter((t) => t.z === z)
}

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
  return prev
}

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

async function consensusProject(page, lat, lng, before = null, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const grid = before ? await freshGrid(page, before) : await stableGrid(page)
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

async function dragPan(page, dx, dy) {
  const before = gridKey(await tileGrid(page))
  await page.mouse.move(CX, CY)
  await page.mouse.down()
  await page.mouse.move(CX + dx, CY + dy, { steps: 16 })
  await page.mouse.up()
  await sleep(1600)
  return before
}

/** Pan until (lat, lng) sits within `tol` px of the centre (capped drags). */
async function panTo(page, lat, lng, before = null, tol = 30, maxPans = 14) {
  for (let i = 0; i < maxPans; i++) {
    const p = await consensusProject(page, lat, lng, before)
    before = null
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
    await sleep(1500)
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
  await page.addStyleTag({
    content: '*{transition-duration:0s!important;animation-duration:0s!important}',
  })
  await sleep(1500)

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
  // Dismiss the shipping-lanes hint card (all VISIBLE matches).
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (!b.textContent?.toLowerCase().includes('got it')) continue
      const r = b.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) b.click()
    }
  })
  await sleep(400)

  /** Fresh-grid waypoint overlay: markers are truth at screenshot time. */
  async function markTruth() {
    if (!MARK_TRUTH) return
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
  await frameTarget(page, ...TARGETS.corridor)
  await markTruth()
  await page.screenshot({ path: tag('corridor') })
  console.log(`shot ${tag('corridor')}`)

  await frameTarget(page, ...TARGETS.north)
  await markTruth()
  await page.screenshot({ path: tag('north') })
  await console.log(`shot ${tag('north')}`)

  await frameTarget(page, ...TARGETS.wide)
  await markTruth()
  await page.screenshot({ path: tag('wide') })
  console.log(`shot ${tag('wide')}`)

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
