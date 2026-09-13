#!/usr/bin/env node
/**
 * final-pass.mjs — the six-item visual pass of record, run against the
 * PRODUCTION build (`npm run preview` → http://localhost:4173).
 *
 *   node scripts/final-pass.mjs [BASE_URL]
 *
 *   BASE_URL          default http://localhost:4173
 *   VITE_ADMIN_PASSCODE   env var, or read from the local (gitignored) .env —
 *                         needed for item 6 only
 *
 * THE CHECKLIST
 * -------------
 *   1. peek row            — the closed sheet shows exactly one line: summary,
 *                            © OSM, anchor readout; the sheet body is fully
 *                            transparent at peek (nothing half-cut at the edge)
 *   2. drag/flick anchors  — peek → mid by drag, mid → full by a fast flick,
 *                            full → peek by drag; the spring settles at each
 *                            anchor without overshoot beyond the elastic band
 *   3. polygon fill ramp   — every polygon path carries `.zone-path` (the
 *                            production regression), a press lifts the fill
 *                            mid-ramp while the button is still down, and a
 *                            selection lands on the selected fill
 *   4. attribution         — the © OSM credit in the peek row is on-screen,
 *                            legible (≥ 9px, not the ground colour), links to
 *                            the OSM copyright; full credit in the sheet
 *                            footer; no Leaflet attribution control in the DOM
 *   5. zoom-control        — desktop only: the top-right zoom control clears
 *                            the header overlay (its margin, not luck)
 *   6. report → approve    — tap a zone on the map → report → submit → /admin
 *                            → unlock → approve → the zone is under advisory
 *                            on the public map
 *
 * Run in real Chromium (desktop 1280×800 + mobile 375×667 with touch). Tiles
 * and webfonts are allowed to fail (offline sandbox): every assertion targets
 * this app's own UI, never the basemap.
 *
 * The DOM/behaviour half of the same six items is covered in CI without a
 * browser by `src/pages/mapPass.test.tsx`; the flick-velocity projection is
 * pure logic in `src/motion/sheetAnchors.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE_URL = new URL(process.argv[2] ?? 'http://localhost:4173')

function readPasscode() {
  if (process.env.VITE_ADMIN_PASSCODE) return process.env.VITE_ADMIN_PASSCODE
  try {
    const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    const match = env.match(/^VITE_ADMIN_PASSCODE=(.*)$/m)
    if (match && match[1].trim()) return match[1].trim()
  } catch {
    /* no .env */
  }
  return null
}
const PASSCODE = readPasscode()

const results = []
function record(item, ok, detail = '') {
  results.push({ item, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}${detail ? `  — ${detail}` : ''}`)
}

/** Wait until the sheet's spring has settled at its anchor. */
async function settleAt(page, anchor) {
  await page.waitForSelector(`[data-anchor="${anchor}"]`, { timeout: 5000 })
  // The spring is ~350ms; give it a full settle window.
  await page.waitForTimeout(700)
  const actual = await page.locator('[role="region"][aria-label="Advisory and zone list"]')
    .getAttribute('data-anchor')
  if (actual !== anchor) throw new Error(`expected anchor ${anchor}, got ${actual}`)
}

function sheetHandleBox(page, sheetBox) {
  // The drag surface is the sheet's top ~62px (ticks + handle bar + row).
  return { x: sheetBox.x + sheetBox.width / 2, y: sheetBox.y + 32 }
}

async function drag(page, from, to, durationMs, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    await page.mouse.move(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
    )
    await page.waitForTimeout(durationMs / steps)
  }
  await page.mouse.up()
}

async function desktopChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  // ------------------------------------------------------------- item 5 —
  await page.goto(`${BASE_URL}map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-overlay-pane path', { timeout: 10000 })
  await settleAt(page, 'peek')

  const zoomBox = await page.locator('.leaflet-top.leaflet-right .leaflet-control-zoom').boundingBox()
  const headerBox = await page.locator('header').first().boundingBox()
  if (!zoomBox || !headerBox) {
    record('5 · zoom-control clearance (desktop)', false, 'zoom control or header not found')
  } else {
    const clearsHeader = zoomBox.y >= headerBox.y + headerBox.height - 1
    const hasMargin = zoomBox.y >= 70 // .leaflet-top.leaflet-right { margin-top: 74px }
    record(
      '5 · zoom-control clearance (desktop)',
      clearsHeader && hasMargin,
      `zoom top ${Math.round(zoomBox.y)}px, header bottom ${Math.round(headerBox.y + headerBox.height)}px`,
    )
  }

  // ------------------------------------------------------------- item 3 —
  // Find a polygon whose centre is on the visible map (above the sheet).
  const paths = page.locator('.leaflet-overlay-pane path')
  const pathCount = await paths.count()
  let pressPath = null
  let pressBox = null
  for (let i = 0; i < pathCount; i += 1) {
    const box = await paths.nth(i).boundingBox()
    if (!box) continue
    const cy = box.y + box.height / 2
    if (cy > 120 && cy < (await page.locator('[data-anchor]').boundingBox()).y - 20) {
      pressPath = paths.nth(i)
      pressBox = box
      break
    }
  }
  const zonePathCount = await page.locator('.leaflet-overlay-pane path.zone-path').count()
  const classApplied = pathCount > 0 && zonePathCount === pathCount

  if (!pressPath) {
    record('3 · polygon fill ramp', false, 'no polygon visible above the sheet')
  } else {
    const restFill = await pressPath.evaluate((el) => getComputedStyle(el).fillOpacity)
    await page.mouse.move(pressBox.x + pressBox.width / 2, pressBox.y + pressBox.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(110) // inside the 200ms ramp
    const pressedClass = await pressPath.evaluate((el) => el.classList.contains('zone-path--pressed'))
    const pressFill = await pressPath.evaluate((el) => getComputedStyle(el).fillOpacity)
    await page.mouse.up()
    await page.waitForTimeout(300)
    const selectedClass = await pressPath.evaluate((el) => el.classList.contains('zone-path--selected'))
    const selectedFill = await pressPath.evaluate((el) => el.getAttribute('fill-opacity'))

    const rampHappened = Number(pressFill) > Number(restFill) && Number(pressFill) <= Number(selectedFill) + 0.001
    record(
      '3 · polygon fill ramp',
      classApplied && pressedClass && rampHappened && selectedClass,
      `${pathCount} paths, .zone-path on ${zonePathCount}; rest ${restFill} → press ${pressFill} → selected ${selectedFill} (class ${selectedClass})`,
    )
  }

  // ------------------------------------------------------------- item 4 —
  const peekLink = page.locator('[role="region"][aria-label="Advisory and zone list"] a[href="https://www.openstreetmap.org/copyright"]').first()
  const linkBox = await peekLink.boundingBox()
  const linkStyle = await peekLink.evaluate((el) => {
    const style = getComputedStyle(el)
    return { fontSize: style.fontSize, color: style.color }
  })
  const footerCredit = page.locator('[role="region"][aria-label="Advisory and zone list"] a:has-text("© OpenStreetMap")')
  const noLeafletAttribution = (await page.locator('.leaflet-control-attribution').count()) === 0
  const ground = 'rgb(8, 8, 8)'
  const legible =
    linkBox &&
    linkBox.width > 0 &&
    Number.parseFloat(linkStyle.fontSize) >= 9 &&
    linkStyle.color.toLowerCase() !== ground
  record(
    '4 · attribution legibility',
    Boolean(legible) && (await footerCredit.count()) > 0 && noLeafletAttribution,
    linkStyle ? `${linkStyle.fontSize}, ${linkStyle.color}, no Leaflet control: ${noLeafletAttribution}` : 'link missing',
  )

  // ------------------------------------------------------------- item 6 —
  if (!PASSCODE) {
    record('6 · report → approve E2E', false, 'VITE_ADMIN_PASSCODE not set (env or .env)')
  } else {
    try {
      // Click the zone polygon (the one we pressed, or any visible one).
      const target = pressPath ?? paths.first()
      const tbox = await target.boundingBox()
      await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2)
      await page.waitForSelector('.zone-popup', { timeout: 5000 })
      await page.getByRole('button', { name: /Report something here/ }).click()

      const dialog = page.getByRole('dialog')
      await dialog.waitFor({ timeout: 5000 })
      await dialog.getByLabel('What did you see?').fill(
        'Water turned reddish-brown near the shallows and there were dead mussels.',
      )
      await dialog.getByRole('button', { name: 'Submit report' }).click()
      await page.getByText(/Salamat!/).waitFor({ timeout: 5000 })

      await page.getByRole('link', { name: 'Admin' }).click()
      const passcodeInput = page.getByLabel('Passcode')
      await passcodeInput.waitFor({ timeout: 5000 })
      await passcodeInput.fill(PASSCODE)
      await page.getByRole('button', { name: 'Unlock' }).click()
      const approve = page.getByRole('button', { name: /Approve → advisory/ })
      await approve.waitFor({ timeout: 5000 })
      await approve.click()
      await page.getByText(/Approved\./).waitFor({ timeout: 5000 })

      // Back on the public map, the peek line must now carry the advisory.
      await page.getByRole('link', { name: 'Public map' }).click()
      await page.waitForSelector('.leaflet-overlay-pane path', { timeout: 10000 })
      await settleAt(page, 'peek')
      const summary = await page
        .locator('[role="region"][aria-label="Advisory and zone list"] p')
        .filter({ hasText: /zones ·/ })
        .first()
        .textContent()
      record(
        '6 · report → approve E2E',
        /under advisory/.test(summary ?? ''),
        `peek line now: “${summary?.trim()}”`,
      )
    } catch (error) {
      record('6 · report → approve E2E', false, error.message.split('\n')[0].slice(0, 160))
    }
  }

  await context.close()
}

async function mobileChecks(browser) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()

  await page.goto(`${BASE_URL}map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-overlay-pane path', { timeout: 10000 })
  await settleAt(page, 'peek')

  // ------------------------------------------------------------- item 1 —
  const sheet = page.locator('[role="region"][aria-label="Advisory and zone list"]')
  const summary = sheet.locator('p').filter({ hasText: /zones ·/ }).first()
  const readout = sheet.getByText('01 / 03')
  const osm = sheet.locator('a[href="https://www.openstreetmap.org/copyright"]').first()
  const body = sheet.locator('[class*="overflow-y-auto"]').first()
  const bodyOpacity = await body.evaluate((el) => getComputedStyle(el).opacity)
  const peekOk =
    (await summary.count()) === 1 &&
    (await readout.count()) === 1 &&
    (await osm.count()) === 1 &&
    bodyOpacity === '0'
  record(
    '1 · peek row',
    peekOk,
    `summary “${(await summary.textContent())?.trim()}”, readout + © OSM present, body opacity ${bodyOpacity} at peek`,
  )

  // ------------------------------------------------------------- item 2 —
  const h = 667
  const peekOffset = h * (1 - 0.14)
  const midOffset = h * (1 - 0.45)
  const fullOffset = h * (1 - 0.85)

  const sheetBox = await sheet.boundingBox()
  let handle = sheetHandleBox(page, sheetBox)
  try {
    // peek → mid: a deliberate slow drag.
    await drag(page, handle, { x: handle.x, y: handle.y - (peekOffset - midOffset) }, 450)
    await settleAt(page, 'mid')
    // mid → full: a fast flick (~2.9 s of px per 0.1s — well over the 480 px/s flick gate).
    handle = sheetHandleBox(page, await sheet.boundingBox())
    await drag(page, handle, { x: handle.x, y: handle.y - (midOffset - fullOffset) }, 90, 6)
    await settleAt(page, 'full')
    // full → peek: a deliberate slow drag back down.
    handle = sheetHandleBox(page, await sheet.boundingBox())
    await drag(page, handle, { x: handle.x, y: handle.y + (fullOffset - peekOffset) }, 450)
    await settleAt(page, 'peek')
    record('2 · drag/flick anchors', true, 'peek → mid (drag) → full (flick) → peek (drag)')
  } catch (error) {
    record('2 · drag/flick anchors', false, error.message.split('\n')[0].slice(0, 160))
  }

  await context.close()
}

// ---------------------------------------------------------------------------
const browser = await chromium.launch()
try {
  await desktopChecks(browser)
  await mobileChecks(browser)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
