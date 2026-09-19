#!/usr/bin/env node
/**
 * Real-browser verification for the drawer layout — the pass that replaces
 * the bottom-sheet scripts of record (those stay in the repo, unwired, per
 * the deletion hold).
 *
 * Drives /map in headless Chromium (puppeteer; the binary comes from
 * @sparticuz/chromium because the Google binary CDNs are unreachable from
 * this sandbox — verification tooling only, `npm i --no-save`, NOT a project
 * dependency) and checks, at 320 / 375 / 390 / 768 / 1280:
 *
 *   1. The bottom strip is absent — no sheet anchors — and the zone drawer
 *      renders on the right edge of the top-right control column, under the
 *      advisory tab, under the zoom buttons.
 *   2. Both drawers clip STRUCTURALLY at every sampled drag position — the
 *      clip window's width equals the visible remainder derived from the
 *      track's position, its right edge stays pinned, `overflow` computes
 *      to hidden, and the window never exceeds the panel nor drops below 0.
 *      This is the "never renders outside clipped bounds at any drag state"
 *      guarantee, extended to the zone drawer.
 *   3. Drag cycles open → mid-drag → collapsed → open for BOTH drawers,
 *      including a fast flick; taps toggle after drags (the tap-after-drag
 *      regression); ArrowRight/ArrowLeft drive both; reduced-motion toggles
 *      land instantly.
 *   4. No backdrop-blur anywhere inside either translated track.
 *   5. Attribution: the persistent pill is present, visible and ON TOP in
 *      both drawer states (elementFromPoint through the open drawer).
 *   6. No overlap between the pills row, zoom group, tabs, drawer windows
 *      and the attribution pill; zoom buttons and tabs are ≥44px; collapsed
 *      tabs sit flush with the zoom group's right edge (±0.5px).
 *   7. Initial states: zone drawer collapsed below 768, open at ≥768;
 *      advisory drawer always open.
 *   8. The zoom buttons really drive the map (data-zoom moves).
 *   9. Screenshots for human review: both-open, each drawer mid-drag-held,
 *      both-collapsed, final state, per viewport.
 *
 * OSM tiles are unreachable from the sandbox and are aborted on purpose —
 * geometry, clipping, controls and gesture behaviour are what is verified
 * here, not the external tile service.
 *
 * Usage:
 *   BASE_URL=http://localhost:4173 node scripts/map-drawers-pass.mjs
 *
 * Env:
 *   BASE_URL   preview/dev server base (default http://localhost:4173)
 *   OUT_DIR    screenshot dir (default docs/map-drawers-shots)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)
const chromiumModule = require('@sparticuz/chromium')
const chromium = chromiumModule.default ?? chromiumModule
const inflate = chromiumModule.inflate ?? chromium.inflate

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT_DIR = process.env.OUT_DIR ?? 'docs/map-drawers-shots'
fs.mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '375', width: 375, height: 667 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
]

let failures = 0
function check(item, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}${detail ? `  — ${detail}` : ''}`)
}

/** Intersection area of two rects. */
function overlap(a, b) {
  const x = Math.min(a.right, b.right) - Math.max(a.x, b.x)
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)
  return x > 0.5 && y > 0.5
}

async function state(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
    }
    const grab = (sel) => document.querySelector(sel)
    const out = { missing: [] }
    for (const [key, sel] of Object.entries({
      key: '[data-testid="status-key"]',
      column: '[data-testid="map-control-column"]',
      zoom: '[data-testid="zoom-controls"]',
      advisory: '[data-testid="advisory-drawer"]',
      advisoryWindow: '[data-testid="advisory-drawer-window"]',
      advisoryTab: '[data-testid="advisory-drawer-tab"]',
      gauge: '[data-testid="advisory-gauge"]',
      zone: '[data-testid="zone-drawer"]',
      zoneWindow: '[data-testid="zone-drawer-window"]',
      zoneTab: '[data-testid="zone-drawer-tab"]',
      zonePanel: '[data-testid="zone-drawer-panel"]',
      attribution: '[data-testid="map-attribution"]',
    })) {
      const el = grab(sel)
      if (!el) {
        out.missing.push(key)
        continue
      }
      out[key] = rect(el)
    }
    const advTrack = document.getElementById('advisory-drawer-body')
    const zoneTrack = document.getElementById('zone-drawer-body')
    if (advTrack) {
      out.advisoryTrack = rect(advTrack)
      out.advisoryTrackTransform = getComputedStyle(advTrack).transform
    }
    if (zoneTrack) {
      out.zoneTrack = rect(zoneTrack)
      out.zoneTrackTransform = getComputedStyle(zoneTrack).transform
    }
    const zw = grab('[data-testid="zone-drawer-window"]')
    const aw = grab('[data-testid="advisory-drawer-window"]')
    out.zoneWindowOverflow = zw ? getComputedStyle(zw).overflowX : null
    out.advisoryWindowOverflow = aw ? getComputedStyle(aw).overflowX : null
    out.zoneState = grab('[data-testid="zone-drawer"]')?.dataset.state ?? null
    out.advisoryState = grab('[data-testid="advisory-drawer"]')?.dataset.state ?? null
    out.zoomLevel = grab('[data-testid="zoom-controls"]')?.dataset.zoom ?? null
    out.sheetAnchorPresent = document.querySelector('[data-anchor]') !== null
    out.attributionVisible = grab('[data-testid="map-attribution"]')?.checkVisibility() ?? false
    // Any backdrop-filter inside either translated track subtree?
    let blurredInTracks = 0
    for (const track of [advTrack, zoneTrack]) {
      if (!track) continue
      for (const el of [track, ...track.querySelectorAll('*')]) {
        const bf = getComputedStyle(el).backdropFilter
        if (bf && bf !== 'none') blurredInTracks += 1
      }
    }
    out.blurredInTracks = blurredInTracks
    // Is the attribution pill actually on top where it sits?
    const pill = grab('[data-testid="map-attribution"]')
    if (pill) {
      const r = pill.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      out.attributionOnTop = top === pill || pill.contains(top)
    }
    return out
  })
}

async function settle(page, ms = 650) {
  await new Promise((r) => setTimeout(r, ms))
}

async function gotoMap(page) {
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[data-testid="zone-drawer"]', { timeout: 15000 })
  await page.waitForSelector('[data-testid="advisory-drawer"]', { timeout: 15000 })
  await page.waitForSelector('[data-testid="map-attribution"]', { timeout: 15000 })
  // Wait for seeded zones (demo backend resolves async).
  await page.waitForFunction(
    () => document.body.textContent?.includes('6 zones · No advisories'),
    { timeout: 15000 },
  )
  await settle(page)
}

/**
 * Drag a right-edge drawer's tab horizontally, sampling geometry each step.
 * Returns the samples and the release point — the mouse is left DOWN.
 */
async function dragTab(page, tabTestId, dx, steps = 8, stepDelay = 55) {
  const tab = await page.$(`[data-testid="${tabTestId}"]`)
  const box = await tab.boundingBox()
  const fromX = box.x + box.width / 2
  const fromY = box.y + box.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  const samples = []
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + (dx * i) / steps, fromY, { steps: 2 })
    if (stepDelay) await new Promise((r) => setTimeout(r, stepDelay))
    samples.push(await state(page))
  }
  return { samples, endX: fromX + dx, endY: fromY }
}

/** A fast flick: few steps, no dwell — velocity carries the release. */
async function flickTab(page, tabTestId, dx) {
  const tab = await page.$(`[data-testid="${tabTestId}"]`)
  const box = await tab.boundingBox()
  const fromX = box.x + box.width / 2
  const fromY = box.y + box.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(fromX + (dx * i) / 4, fromY, { steps: 1 })
  }
  await page.mouse.up()
}

/**
 * The right-edge clip invariant, checked at every drag sample:
 *  - the window's RIGHT edge stays pinned,
 *  - its width equals clamp(panel − offsetX, 0, panel),
 *  - offsetX measured as track.right − pinnedRight (0 at open).
 */
function clipFailures(samples, trackKey, windowKey, pinnedRight) {
  for (const s of samples) {
    const track = s[trackKey]
    const win = s[windowKey]
    if (!track || !win) return 'missing geometry'
    const offsetX = track.right - pinnedRight
    const expected = Math.min(Math.max(track.w - offsetX, 0), track.w)
    if (Math.abs(win.right - pinnedRight) > 1.5) {
      return `window not pinned: right=${win.right.toFixed(1)} pinned=${pinnedRight.toFixed(1)}`
    }
    if (Math.abs(win.w - expected) > 1.5) {
      return `win.w=${win.w.toFixed(1)} expected=${expected.toFixed(1)} (track.w=${track.w.toFixed(1)} offsetX=${offsetX.toFixed(1)})`
    }
    if (win.w < -0.5 || win.w > track.w + 0.5) {
      return `window out of range: ${win.w.toFixed(1)} vs track ${track.w.toFixed(1)}`
    }
  }
  return null
}

/** Overlap audit across the fixed chrome at rest. */
function auditOverlaps(s, vpName) {
  const pairs = [
    ['pills × zoom group', s.key, s.zoom],
    ['pills × advisory window', s.key, s.advisoryWindow],
    ['pills × zone window', s.key, s.zoneWindow],
    ['pills × attribution', s.key, s.attribution],
    ['zoom × advisory tab', s.zoom, s.advisoryTab],
    ['zoom × advisory window', s.zoom, s.advisoryWindow],
    ['zoom × zone tab', s.zoom, s.zoneTab],
    ['advisory tab × zone tab', s.advisoryTab, s.zoneTab],
    ['advisory tab × zone window', s.advisoryTab, s.zoneWindow],
    ['advisory window × zone tab', s.advisoryWindow, s.zoneTab],
    ['advisory window × zone window', s.advisoryWindow, s.zoneWindow],
    ['zone tab × zone window', s.zoneTab, s.zoneWindow],
  ]
  for (const [label, a, b] of pairs) {
    check(`${vpName} no overlap: ${label}`, !a || !b || !overlap(a, b),
      a && b ? `a(${a.x.toFixed(0)},${a.y.toFixed(0)},${a.right.toFixed(0)},${a.bottom.toFixed(0)}) b(${b.x.toFixed(0)},${b.y.toFixed(0)},${b.right.toFixed(0)},${b.bottom.toFixed(0)})` : 'missing')
  }
}

// --------------------------------------------------------------------------

const executablePath = await chromium.executablePath()
// The AL2023 shared libs are only inflated on Amazon Linux by default; this
// sandbox is not, so inflate them by hand and point the loader at them.
let libDir = '/tmp/al2023/lib'
try {
  if (!fs.existsSync(libDir)) {
    const inflated = await inflate('node_modules/@sparticuz/chromium/bin/al2023.tar.br')
    libDir = path.join(inflated, 'lib')
  }
} catch {
  // best effort — the launch will fail loudly below if libs are missing
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${libDir}:${process.env.LD_LIBRARY_PATH ?? ''}`,
  },
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--font-render-hinting=none',
  ],
})

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 })
    // External tiles are unreachable from the sandbox; abort them so the
    // geometry pass never waits on retries.
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (req.url().includes('tile.openstreetmap.org')) req.abort()
      else req.continue()
    })
    await gotoMap(page)
    const tag = (n) => path.join(OUT_DIR, `${vp.name}-${n}.png`)

    // ---- 0. resting state ------------------------------------------------
    const initial = await state(page)
    check(`${vp.name} bottom strip absent (no sheet anchors)`, !initial.sheetAnchorPresent, '')
    check(`${vp.name} zone drawer starts ${vp.width < 768 ? 'collapsed' : 'open'} below/above 768`,
      initial.zoneState === (vp.width < 768 ? 'collapsed' : 'open'), initial.zoneState)
    check(`${vp.name} advisory drawer starts open`, initial.advisoryState === 'open', initial.advisoryState)

    // Open the zone drawer if needed so the full column is visible.
    if (initial.zoneState !== 'open') {
      await page.click('[data-testid="zone-drawer-tab"]')
      await settle(page)
    }
    const open = await state(page)
    check(`${vp.name} zone drawer opens from the tab`, open.zoneState === 'open', open.zoneState)

    // The window's pinned right edge, sampled at open (offset 0).
    const advisoryPinnedRight = open.advisoryWindow.right
    const zonePinnedRight = open.zoneWindow.right

    // ---- overlap audit, both drawers open --------------------------------
    auditOverlaps(open, vp.name)
    check(`${vp.name} zoom buttons meet 44px hit areas`,
      open.zoom.w >= 44 && open.zoom.h / 2 >= 43.5, `group ${open.zoom.w.toFixed(1)}×${open.zoom.h.toFixed(1)}`)
    check(`${vp.name} drawer tabs meet 44px hit areas`,
      open.advisoryTab.w >= 44 && open.zoneTab.w >= 44 &&
      open.advisoryTab.h >= 44 && open.zoneTab.h >= 44,
      `adv ${open.advisoryTab.w.toFixed(1)}×${open.advisoryTab.h.toFixed(1)} zone ${open.zoneTab.w.toFixed(1)}×${open.zoneTab.h.toFixed(1)}`)
    await page.screenshot({ path: tag('both-open') })

    // ---- 1. zone drawer: drag right to ~50%, hold, clip at every sample --
    const zoneHalf = await dragTab(page, 'zone-drawer-tab', open.zonePanel.w / 2, 7)
    await page.screenshot({ path: tag('zone-mid-drag-held') })
    const zoneClipFail = clipFailures(zoneHalf.samples, 'zoneTrack', 'zoneWindow', zonePinnedRight)
    check(`${vp.name} zone clip window tracks the drag at every sample`, !zoneClipFail, zoneClipFail ?? '')
    const zoneMid = zoneHalf.samples[zoneHalf.samples.length - 1]
    check(`${vp.name} zone mid-drag is genuinely partial`,
      zoneMid.zoneWindow.w > 10 && zoneMid.zoneWindow.w < zoneMid.zoneTrack.w - 10,
      `win.w=${zoneMid.zoneWindow.w.toFixed(1)} track=${zoneMid.zoneTrack.w.toFixed(1)}`)
    check(`${vp.name} advisory untouched during zone drag`,
      Math.abs(zoneMid.advisoryWindow.right - advisoryPinnedRight) < 1.5 &&
      Math.abs(zoneMid.advisoryWindow.w - open.advisoryWindow.w) < 1.5, '')
    await page.mouse.up()
    await settle(page)

    // ---- 2. flick the zone drawer into the edge --------------------------
    await flickTab(page, 'zone-drawer-tab', open.zonePanel.w + 60)
    await settle(page)
    const zoneCollapsed = await state(page)
    check(`${vp.name} flick tucks the zone drawer`, zoneCollapsed.zoneState === 'collapsed', zoneCollapsed.zoneState)
    check(`${vp.name} zone collapsed window is 0 wide`, Math.abs(zoneCollapsed.zoneWindow.w) < 0.6,
      `win.w=${zoneCollapsed.zoneWindow.w.toFixed(2)}`)
    check(`${vp.name} zone collapsed: track fully out of the window`,
      zoneCollapsed.zoneTrack.x >= zonePinnedRight - 0.6,
      `track.x=${zoneCollapsed.zoneTrack.x.toFixed(1)} pinned=${zonePinnedRight.toFixed(1)}`)
    check(`${vp.name} zone tab still visible when collapsed`,
      zoneCollapsed.zoneTab.w >= 44 && zoneCollapsed.zoneTab.h >= 44, '')

    // ---- 3. tap-after-drag on the zone tab (the historical bug) ----------
    await flickTab(page, 'zone-drawer-tab', open.zonePanel.w + 60) // another drag
    await settle(page)
    await page.click('[data-testid="zone-drawer-tab"]')
    await settle(page)
    const afterTapDrag = await state(page)
    check(`${vp.name} zone tap works right after a drag`, afterTapDrag.zoneState === 'open', afterTapDrag.zoneState)

    // ---- 4. drag the zone drawer back open -------------------------------
    const zoneBack = await dragTab(page, 'zone-drawer-tab', -(open.zonePanel.w + 60), 6)
    const zoneBackClipFail = clipFailures(zoneBack.samples, 'zoneTrack', 'zoneWindow', zonePinnedRight)
    check(`${vp.name} zone clip window tracks the re-open drag`, !zoneBackClipFail, zoneBackClipFail ?? '')
    await page.mouse.up()
    await settle(page)
    const zoneReopened = await state(page)
    check(`${vp.name} zone drag re-opens the drawer`, zoneReopened.zoneState === 'open', zoneReopened.zoneState)
    check(`${vp.name} zone reopened window fits the panel`,
      Math.abs(zoneReopened.zoneWindow.w - zoneReopened.zoneTrack.w) < 1.5,
      `win.w=${zoneReopened.zoneWindow.w.toFixed(1)} track=${zoneReopened.zoneTrack.w.toFixed(1)}`)

    // ---- 5. zone header strip drags too ----------------------------------
    const stripBox = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="zone-drawer-panel"] > div:nth-child(2)')
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width }
    })
    await page.mouse.move(stripBox.x + stripBox.w / 2, stripBox.y + 8)
    await page.mouse.down()
    await page.mouse.move(stripBox.x + stripBox.w / 2 + open.zonePanel.w + 60, stripBox.y + 8, { steps: 6 })
    await page.mouse.up()
    await settle(page)
    const stripDragged = await state(page)
    check(`${vp.name} zone header strip is a drag surface`, stripDragged.zoneState === 'collapsed', stripDragged.zoneState)
    // reopen for the next checks
    await page.click('[data-testid="zone-drawer-tab"]')
    await settle(page)

    // ---- 6. advisory drawer: drag right to ~50%, clip at every sample ----
    const advHalf = await dragTab(page, 'advisory-drawer-tab', open.gauge.w / 2, 6)
    await page.screenshot({ path: tag('advisory-mid-drag-held') })
    const advClipFail = clipFailures(advHalf.samples, 'advisoryTrack', 'advisoryWindow', advisoryPinnedRight)
    check(`${vp.name} advisory clip window tracks the drag at every sample`, !advClipFail, advClipFail ?? '')
    const advMid = advHalf.samples[advHalf.samples.length - 1]
    check(`${vp.name} advisory mid-drag is genuinely partial`,
      advMid.advisoryWindow.w > 10 && advMid.advisoryWindow.w < advMid.advisoryTrack.w - 10,
      `win.w=${advMid.advisoryWindow.w.toFixed(1)} track=${advMid.advisoryTrack.w.toFixed(1)}`)
    // The pills row must not have moved during the drag.
    check(`${vp.name} pills row fixed during advisory drag`,
      Math.abs(advMid.key.x - open.key.x) < 0.5 && Math.abs(advMid.key.y - open.key.y) < 0.5, '')
    await page.mouse.up()
    await settle(page)

    // ---- 7. flick the advisory drawer into the edge ----------------------
    await flickTab(page, 'advisory-drawer-tab', open.gauge.w + 40)
    await settle(page)
    const advCollapsed = await state(page)
    check(`${vp.name} flick tucks the advisory drawer`, advCollapsed.advisoryState === 'collapsed', advCollapsed.advisoryState)
    check(`${vp.name} advisory collapsed window is 0 wide`, Math.abs(advCollapsed.advisoryWindow.w) < 0.6,
      `win.w=${advCollapsed.advisoryWindow.w.toFixed(2)}`)

    // ---- 8. tap-after-drag on the advisory tab ---------------------------
    await page.click('[data-testid="advisory-drawer-tab"]')
    await settle(page)
    const advAfterTap = await state(page)
    check(`${vp.name} advisory tap works right after a drag`, advAfterTap.advisoryState === 'open', advAfterTap.advisoryState)

    // ---- 9. keyboard paths, both drawers ---------------------------------
    await page.focus('[data-testid="advisory-drawer-tab"]')
    await page.keyboard.press('ArrowRight')
    await settle(page, 500)
    const kbCollapsed = await state(page)
    check(`${vp.name} advisory ArrowRight collapses`, kbCollapsed.advisoryState === 'collapsed', kbCollapsed.advisoryState)
    await page.keyboard.press('ArrowLeft')
    await settle(page, 500)
    const kbOpen = await state(page)
    check(`${vp.name} advisory ArrowLeft expands`, kbOpen.advisoryState === 'open', kbOpen.advisoryState)

    await page.focus('[data-testid="zone-drawer-tab"]')
    await page.keyboard.press('ArrowRight')
    await settle(page, 500)
    const kbZoneCollapsed = await state(page)
    check(`${vp.name} zone ArrowRight collapses`, kbZoneCollapsed.zoneState === 'collapsed', kbZoneCollapsed.zoneState)
    await page.keyboard.press('ArrowLeft')
    await settle(page, 500)
    const kbZoneOpen = await state(page)
    check(`${vp.name} zone ArrowLeft expands`, kbZoneOpen.zoneState === 'open', kbZoneOpen.zoneState)

    // ---- 10. blur rule + attribution + zoom drive ------------------------
    check(`${vp.name} no backdrop-filter inside either drag track`, kbZoneOpen.blurredInTracks === 0,
      `blurred=${kbZoneOpen.blurredInTracks}`)
    check(`${vp.name} zone window overflow computes to hidden`,
      kbZoneOpen.zoneWindowOverflow === 'hidden', kbZoneOpen.zoneWindowOverflow ?? '')
    check(`${vp.name} advisory window overflow computes to hidden`,
      kbZoneOpen.advisoryWindowOverflow === 'hidden', kbZoneOpen.advisoryWindowOverflow ?? '')

    // Attribution: visible and on top with the zone drawer OPEN…
    check(`${vp.name} attribution visible + on top (zone open)`,
      kbZoneOpen.attributionVisible && kbZoneOpen.attributionOnTop,
      `visible=${kbZoneOpen.attributionVisible} onTop=${kbZoneOpen.attributionOnTop}`)
    // … and COLLAPSED (state before the ArrowLeft above; re-tuck to sample).
    await page.focus('[data-testid="zone-drawer-tab"]')
    await page.keyboard.press('ArrowRight')
    await settle(page, 500)
    const attrCollapsed = await state(page)
    check(`${vp.name} attribution visible + on top (zone collapsed)`,
      attrCollapsed.attributionVisible && attrCollapsed.attributionOnTop, '')
    await page.screenshot({ path: tag('both-collapsed') })

    // ---- 10b. collapsed tab / zoom right-edge alignment -------------------
    // Both drawers tucked: each tab's right edge must equal the zoom group's
    // right edge (±0.5px). The tab gap is margin-driven from the clip-window
    // motion value (0 when collapsed), so unlike a static row `gap` it
    // cannot hold the collapsed tab off the column edge. ArrowRight is
    // directional and idempotent — a no-op if a drawer is already tucked.
    await page.focus('[data-testid="advisory-drawer-tab"]')
    await page.keyboard.press('ArrowRight')
    await settle(page, 500)
    const bothCollapsed = await state(page)
    const advAlignDelta = Math.abs(bothCollapsed.advisoryTab.right - bothCollapsed.zoom.right)
    const zoneAlignDelta = Math.abs(bothCollapsed.zoneTab.right - bothCollapsed.zoom.right)
    check(`${vp.name} collapsed tabs flush with zoom buttons`,
      bothCollapsed.advisoryState === 'collapsed' &&
      bothCollapsed.zoneState === 'collapsed' &&
      advAlignDelta <= 0.5 && zoneAlignDelta <= 0.5,
      `adv ${bothCollapsed.advisoryState} Δ=${advAlignDelta.toFixed(2)} zone ${bothCollapsed.zoneState} Δ=${zoneAlignDelta.toFixed(2)}`)

    // Zoom really drives the map.
    const z0 = parseFloat(attrCollapsed.zoomLevel ?? 'nan')
    await page.click('[data-testid="zoom-controls"] button[aria-label="Zoom in"]')
    await settle(page, 700)
    const z1 = await state(page)
    await page.click('[data-testid="zoom-controls"] button[aria-label="Zoom out"]')
    await settle(page, 700)
    const z2 = await state(page)
    check(`${vp.name} zoom buttons drive the map`,
      Number.isFinite(z0) && parseFloat(z1.zoomLevel) > z0 && parseFloat(z2.zoomLevel) < parseFloat(z1.zoomLevel),
      `z ${attrCollapsed.zoomLevel} → ${z1.zoomLevel} → ${z2.zoomLevel}`)

    await page.screenshot({ path: tag('final') })
    await page.close()
  }

  // ---- reduced-motion: instant toggles, windows follow --------------------
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (req.url().includes('tile.openstreetmap.org')) req.abort()
      else req.continue()
    })
    await gotoMap(page)
    await settle(page, 200)
    await page.click('[data-testid="zone-drawer-tab"]')
    await settle(page, 200)
    const rm = await state(page)
    check('reduced-motion zone tap opens instantly', rm.zoneState === 'open', rm.zoneState)
    check('reduced-motion zone window follows instantly',
      Math.abs(rm.zoneWindow.w - rm.zoneTrack.w) < 1.5,
      `win.w=${rm.zoneWindow.w.toFixed(1)} track=${rm.zoneTrack.w.toFixed(1)}`)
    await page.screenshot({ path: path.join(OUT_DIR, '375-reduced-open.png') })
    await page.click('[data-testid="advisory-drawer-tab"]')
    await settle(page, 200)
    const rmAdv = await state(page)
    check('reduced-motion advisory tap collapses instantly', rmAdv.advisoryState === 'collapsed', rmAdv.advisoryState)
    check('reduced-motion advisory window follows instantly', Math.abs(rmAdv.advisoryWindow.w) < 0.6,
      `win.w=${rmAdv.advisoryWindow.w.toFixed(2)}`)
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(failures === 0 ? '\nALL MAP-DRAWER CHECKS PASSED' : `\n${failures} MAP-DRAWER CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
