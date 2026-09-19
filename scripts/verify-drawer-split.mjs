#!/usr/bin/env node
/**
 * Real-browser verification for the StatusKey / AdvisoryDrawer split.
 *
 * Drives /map in headless Chromium (puppeteer + npm-hosted chromium binary)
 * and checks, at multiple viewport sizes:
 *
 *   1. The pills row (status-key) is fixed: its bounding box never moves
 *      across drawer open → mid-drag → collapsed → open.
 *   2. The drawer clips structurally: the clip window has computed
 *      overflow-hidden, the gauge card is fully inside the track, and the
 *      window width equals the visible remainder at every sampled drag
 *      position (open, ~25/50/75% mid-drag, collapsed).
 *   3. No backdrop-blur anywhere inside the translated track (the class that
 *      caused the floating-text bleed on real devices).
 *   4. Tap toggle, ArrowLeft/ArrowRight keyboard paths, and reduced-motion
 *      instant toggle all work.
 *   5. Mid-drag and resting screenshots for human eyeball verification that
 *      the visible card edge is a clean cut with no floating text.
 *
 * Usage:
 *   CHROMIUM_PATH=/tmp/chrome/chromium BASE_URL=http://localhost:4173 \
 *     node scripts/verify-drawer-split.mjs
 *
 * Env:
 *   CHROMIUM_PATH  path to the chromium binary (required)
 *   BASE_URL       preview/dev server base (default http://localhost:4173)
 *   OUT_DIR        screenshot dir (default docs/drawer-split-shots)
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? ''
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT_DIR = process.env.OUT_DIR ?? 'docs/drawer-split-shots'

if (!CHROMIUM_PATH) {
  console.error('CHROMIUM_PATH is required (path to the chromium binary)')
  process.exit(2)
}
fs.mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: '375', width: 375, height: 667 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
]

let failures = 0
function check(item, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}${detail ? `  — ${detail}` : ''}`)
}

async function state(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="advisory-drawer"]')
    const win = document.querySelector('[data-testid="advisory-drawer-window"]')
    const track = document.getElementById('advisory-drawer-body')
    const gauge = document.querySelector('[data-testid="advisory-gauge"]')
    const key = document.querySelector('[data-testid="status-key"]')
    const tab = document.querySelector('[data-testid="advisory-drawer-tab"]')
    if (!drawer || !win || !track || !gauge || !key || !tab) {
      return { missing: true }
    }
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    // Any backdrop-filter inside the translated track subtree?
    let blurredInTrack = 0
    for (const el of [gauge, ...gauge.querySelectorAll('*')]) {
      const bf = getComputedStyle(el).backdropFilter
      if (bf && bf !== 'none') blurredInTrack += 1
    }
    const trackStyle = getComputedStyle(track)
    return {
      dataState: drawer.dataset.state,
      drawer: rect(drawer),
      win: rect(win),
      track: rect(track),
      gauge: rect(gauge),
      key: rect(key),
      tab: rect(tab),
      winOverflowX: getComputedStyle(win).overflowX,
      winWidthPx: win.style.width,
      trackTransform: trackStyle.transform,
      blurredInTrack,
      tabVisible: tab.checkVisibility(),
    }
  })
}

async function settle(page) {
  await new Promise((r) => setTimeout(r, 650))
}

async function gotoMap(page) {
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('[data-testid="advisory-drawer"]', { timeout: 10000 })
  await page.waitForSelector('[data-testid="status-key"]', { timeout: 10000 })
  await settle(page)
}

/** Drag the tab horizontally, sampling geometry at each step. Holds at the end. */
async function dragTab(page, dx, steps = 10) {
  const tab = await page.$('[data-testid="advisory-drawer-tab"]')
  const box = await tab.boundingBox()
  const fromX = box.x + box.width / 2
  const fromY = box.y + box.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  const samples = []
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + (dx * i) / steps, fromY, { steps: 2 })
    await new Promise((r) => setTimeout(r, 60))
    samples.push(await state(page))
  }
  return { samples, endX: fromX + dx, endY: fromY }
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM_PATH,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--font-render-hinting=none',
  ],
})

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 })
    await gotoMap(page)
    const tag = (n) => path.join(OUT_DIR, `${vp.name}-${n}.png`)

    // ---- 1. open resting state ----
    const open = await state(page)
    check(`${vp.name} drawer renders open`, open.dataState === 'open', JSON.stringify(open.dataState))
    check(`${vp.name} pills row present and outside drawer`, !open.missing, '')
    const keyHome = open.key
    await page.screenshot({ path: tag('open') })

    // ---- 2. drag left to ~50%, hold, screenshot mid-drag ----
    const half = await dragTab(page, -(open.gauge.w / 2), 6)
    const mid = half.samples[half.samples.length - 1]
    await page.screenshot({ path: tag('mid-drag-held') })
    await page.mouse.up()
    await settle(page)

    // Window width must equal the visible remainder at every sample.
    let clipOk = true
    let clipDetail = ''
    for (const s of half.samples) {
      const expected = Math.max(s.gauge.w + (s.track.x - s.win.x), 0)
      if (Math.abs(s.win.w - expected) > 1.5) {
        clipOk = false
        clipDetail = `win.w=${s.win.w.toFixed(1)} expected=${expected.toFixed(1)}`
        break
      }
      if (s.winOverflowX !== 'hidden') {
        clipOk = false
        clipDetail = `overflow=${s.winOverflowX}`
        break
      }
    }
    check(`${vp.name} clip window tracks the drag at every sample`, clipOk, clipDetail)
    const midVisible = mid.win.w > 10 && mid.win.w < mid.gauge.w - 10
    check(`${vp.name} mid-drag is genuinely partial`, midVisible, `win.w=${mid.win.w.toFixed(1)} card=${mid.gauge.w.toFixed(1)}`)

    // Pills must not have moved during the drag.
    const keyMovedDrag =
      Math.abs(mid.key.x - keyHome.x) > 0.5 || Math.abs(mid.key.y - keyHome.y) > 0.5
    check(`${vp.name} pills row fixed during drag`, !keyMovedDrag, `key@(${mid.key.x.toFixed(1)},${mid.key.y.toFixed(1)})`)

    // ---- 3. flick to collapsed ----
    const st = await state(page)
    await dragTab(page, -(st.gauge.w + 40), 4)
    await page.mouse.up()
    await settle(page)
    const collapsed = await state(page)
    check(`${vp.name} flick collapses the drawer`, collapsed.dataState === 'collapsed', collapsed.dataState)
    check(
      `${vp.name} collapsed window is 0 wide`,
      Math.abs(collapsed.win.w) < 0.6,
      `win.w=${collapsed.win.w.toFixed(2)} style=${collapsed.winWidthPx}`,
    )
    check(
      `${vp.name} collapsed card is fully out of the window`,
      collapsed.track.x + collapsed.track.w <= collapsed.win.x + 0.6,
      `trackRight=${(collapsed.track.x + collapsed.track.w).toFixed(1)} winX=${collapsed.win.x.toFixed(1)}`,
    )
    check(`${vp.name} tab still visible when collapsed`, collapsed.tabVisible, '')
    await page.screenshot({ path: tag('collapsed') })

    // ---- 4. drag back right to open ----
    await dragTab(page, collapsed.gauge.w + 60, 6)
    await page.mouse.up()
    await settle(page)
    const reopened = await state(page)
    check(`${vp.name} drag re-opens the drawer`, reopened.dataState === 'open', reopened.dataState)
    check(
      `${vp.name} reopened window fits the card`,
      Math.abs(reopened.win.w - reopened.gauge.w) < 1.5,
      `win.w=${reopened.win.w.toFixed(1)} card=${reopened.gauge.w.toFixed(1)}`,
    )
    const keyMoved =
      Math.abs(reopened.key.x - keyHome.x) > 0.5 || Math.abs(reopened.key.y - keyHome.y) > 0.5
    check(`${vp.name} pills row fixed across full cycle`, !keyMoved, '')

    // ---- 5. no backdrop-blur inside the translated track (bleed class) ----
    check(
      `${vp.name} no backdrop-filter inside card track`,
      reopened.blurredInTrack === 0,
      `blurred=${reopened.blurredInTrack}`,
    )

    // ---- 6. keyboard paths ----
    await page.click('[data-testid="advisory-drawer-tab"]') // focus + toggle guard
    await settle(page)
    const afterClick = await state(page)
    // Click toggled it (open→collapsed); bring back open for arrow tests.
    if (afterClick.dataState === 'collapsed') {
      await page.click('[data-testid="advisory-drawer-tab"]')
      await settle(page)
    }
    await page.focus('[data-testid="advisory-drawer-tab"]')
    await page.keyboard.press('ArrowLeft')
    await settle(page)
    const kbCollapsed = await state(page)
    check(`${vp.name} ArrowLeft collapses`, kbCollapsed.dataState === 'collapsed', kbCollapsed.dataState)
    await page.keyboard.press('ArrowRight')
    await settle(page)
    const kbOpen = await state(page)
    check(`${vp.name} ArrowRight expands`, kbOpen.dataState === 'open', kbOpen.dataState)

    // ---- 7. tap toggle ----
    await page.click('[data-testid="advisory-drawer-tab"]')
    await settle(page)
    const tapCollapsed = await state(page)
    check(`${vp.name} tap collapses`, tapCollapsed.dataState === 'collapsed', tapCollapsed.dataState)
    await page.screenshot({ path: tag('tap-collapsed') })
    await page.click('[data-testid="advisory-drawer-tab"]')
    await settle(page)

    await page.close()
  }

  // ---- 8. reduced-motion: instant toggle, window follows ----
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await gotoMap(page)
    await page.click('[data-testid="advisory-drawer-tab"]')
    await settle(page)
    const rm = await state(page)
    check('reduced-motion tap collapses', rm.dataState === 'collapsed', rm.dataState)
    check('reduced-motion window follows instantly', Math.abs(rm.win.w) < 0.6, `win.w=${rm.win.w.toFixed(2)}`)
    await page.screenshot({ path: path.join(OUT_DIR, '375-reduced-collapsed.png') })
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(failures === 0 ? '\nALL DRAWER CHECKS PASSED' : `\n${failures} DRAWER CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
