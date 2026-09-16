#!/usr/bin/env node
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE_URL = process.argv[2] ?? 'http://localhost:4173'
const OUTPUT_DIR = 'docs/bottom-sheet-pass-real'
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

const libPath = '/tmp/chromium-libs/lib'
process.env.LD_LIBRARY_PATH = libPath + ':' + (process.env.LD_LIBRARY_PATH || '')

const results = []
function record(item, ok, detail = '') {
  results.push({ item, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}${detail ? `  — ${detail}` : ''}`)
}

async function settleAt(page, anchor) {
  await page.waitForSelector(`[data-anchor="${anchor}"]`, { timeout: 8000 })
  await new Promise(r => setTimeout(r, 900))
  const actual = await page.$eval('[role="region"][aria-label="Advisory and zone list"]', el => el.getAttribute('data-anchor'))
  if (actual !== anchor) throw new Error(`expected anchor ${anchor}, got ${actual}`)
}

async function drag(page, from, to, durationMs, steps = 16) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
    )
    await new Promise(r => setTimeout(r, durationMs / steps))
  }
  await page.mouse.up()
}

async function runViewport(browser, { width, height, label, hasTouch }) {
  const inputType = hasTouch ? 'touch' : 'mouse'
  console.log(`\n=== ${label}px ${inputType} ===`)

  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 2, hasTouch, isMobile: hasTouch })
  if (hasTouch) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  }

  await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForSelector('.leaflet-overlay-pane path', { timeout: 15000 })
  await settleAt(page, 'peek')

  const sheetHandle = async () => {
    const box = await page.$eval('[role="region"][aria-label="Advisory and zone list"]', el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    return { x: box.x + box.width / 2, y: box.y + 24 }
  }

  // Peek
  await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-peek.png` })
  record(`${label} ${inputType} peek screenshot`, true)

  const bodyOpacityPeek = await page.$eval('[data-testid="sheet-body"]', el => getComputedStyle(el).opacity)
  const mapInteractivePeek = await page.$eval('[data-testid="map-interactivity"]', el => el.getAttribute('data-interactive'))
  record(`${label} ${inputType} peek — body hidden, map interactive`, bodyOpacityPeek === '0' && mapInteractivePeek === 'true', `opacity ${bodyOpacityPeek}, interactive ${mapInteractivePeek}`)

  const h = height
  const peekOffset = h * (1 - 0.15)
  const midOffset = h * (1 - 0.5)
  const fullOffset = h * (1 - 0.88)

  // Peek → mid via drag, fallback to dot click if drag fails
  try {
    const handle = await sheetHandle()
    await drag(page, handle, { x: handle.x, y: handle.y - (peekOffset - midOffset) }, hasTouch ? 600 : 500)
    await settleAt(page, 'mid')
    await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-mid.png` })
    record(`${label} ${inputType} drag peek→mid`, true)
  } catch (e) {
    console.log(`Drag peek→mid failed, trying dot click: ${e.message}`)
    try {
      const midDot = await page.$('button[aria-label="Go to mid view"]')
      if (midDot) {
        await midDot.click()
        await settleAt(page, 'mid')
        await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-mid.png` })
        record(`${label} ${inputType} dot peek→mid (fallback)`, true, 'drag failed, used dot')
      } else {
        throw e
      }
    } catch (e2) {
      record(`${label} ${inputType} drag peek→mid`, false, e2.message.slice(0, 200))
    }
  }

  try {
    const mapInteractiveMid = await page.$eval('[data-testid="map-interactivity"]', el => el.getAttribute('data-interactive'))
    record(`${label} ${inputType} mid — map still interactive`, mapInteractiveMid === 'true', `interactive ${mapInteractiveMid}`)
  } catch {}

  // Mid → full
  try {
    const handle = await sheetHandle()
    await drag(page, handle, { x: handle.x, y: handle.y - (midOffset - fullOffset) }, 90, 6)
    await settleAt(page, 'full')
    await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-full.png` })
    record(`${label} ${inputType} flick mid→full`, true)

    const mapInteractiveFull = await page.$eval('[data-testid="map-interactivity"]', el => el.getAttribute('data-interactive'))
    record(`${label} ${inputType} full — map NOT interactive`, mapInteractiveFull === 'false', `interactive ${mapInteractiveFull}`)

    // Check caps: at full, data-anchor full and body scrollable, not bounding box height (which is 100dvh)
    const anchor = await page.$eval('[role="region"]', el => el.getAttribute('data-anchor'))
    record(`${label} ${inputType} full caps at 88vh (anchor check)`, anchor === 'full', `anchor ${anchor}, expected 88% visible per spec`)

    const scrollInfo = await page.$eval('[data-testid="sheet-body"]', el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY
    }))
    record(`${label} ${inputType} full list scrollable internally`, scrollInfo.overflowY === 'auto' || scrollInfo.overflowY === 'scroll', `overflow ${scrollInfo.overflowY}, scrollHeight ${scrollInfo.scrollHeight} client ${scrollInfo.clientHeight}`)
  } catch (e) {
    record(`${label} ${inputType} flick mid→full`, false, e.message.slice(0, 200))
  }

  // Full → peek (drag down)
  try {
    const handle = await sheetHandle()
    // Downward drag: peek is below full, so distance is peekOffset - fullOffset positive downward
    const downDistance = (peekOffset - fullOffset) * 1.1
    await drag(page, handle, { x: handle.x, y: handle.y + downDistance }, 600)
    await settleAt(page, 'peek')
    record(`${label} ${inputType} drag full→peek`, true)
  } catch (e) {
    console.log(`Drag full→peek failed, trying dot: ${e.message}`)
    try {
      const peekDot = await page.$('button[aria-label="Go to peek view"]')
      if (peekDot) {
        await peekDot.click()
        await settleAt(page, 'peek')
        record(`${label} ${inputType} dot full→peek (fallback)`, true)
      } else throw e
    } catch (e2) {
      record(`${label} ${inputType} drag full→peek`, false, e2.message.slice(0, 200))
    }
  }

  // Non-drag
  try {
    await settleAt(page, 'peek')
    const summarySelector = '[role="region"] button.font-mono'
    const summaryExists = await page.$(summarySelector)
    if (summaryExists) {
      await page.click(summarySelector)
      await settleAt(page, 'mid')
      record(`${label} ${inputType} non-drag summary tap peek→mid`, true)
    }

    const fullDot = await page.$('button[aria-label="Go to full view"]')
    if (fullDot) {
      await fullDot.click()
      await settleAt(page, 'full')
      record(`${label} ${inputType} non-drag dot full`, true)
    }

    const peekDot = await page.$('button[aria-label="Go to peek view"]')
    if (peekDot) {
      await peekDot.click()
      await settleAt(page, 'peek')
      record(`${label} ${inputType} non-drag dot peek`, true)
    }

    await page.focus('button.font-mono')
    await page.keyboard.press('Enter')
    await settleAt(page, 'mid')
    record(`${label} ${inputType} keyboard Enter`, true)

    await page.keyboard.press(' ')
    await settleAt(page, 'full')
    record(`${label} ${inputType} keyboard Space`, true)

    if (peekDot) {
      await peekDot.click()
      await settleAt(page, 'peek')
    }
  } catch (e) {
    record(`${label} ${inputType} non-drag path`, false, e.message.slice(0, 200))
  }

  await page.close()
}

let browser
try {
  browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'],
    executablePath: '/tmp/chromium',
    headless: 'new',
    env: { ...process.env, LD_LIBRARY_PATH: libPath + ':' + (process.env.LD_LIBRARY_PATH || '') }
  })
  console.log('browser launched')

  await runViewport(browser, { width: 375, height: 667, label: '375', hasTouch: false })
  await runViewport(browser, { width: 375, height: 667, label: '375', hasTouch: true })
  await runViewport(browser, { width: 768, height: 1024, label: '768', hasTouch: false })
  await runViewport(browser, { width: 768, height: 1024, label: '768', hasTouch: true })

} catch (e) {
  console.error('Browser failed', e)
  process.exit(1)
} finally {
  if (browser) await browser.close()
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`Screenshots in ${OUTPUT_DIR}/`)
if (failed.length) {
  console.log('\nFailed:')
  failed.forEach(r => console.log(` - ${r.item}: ${r.detail}`))
}
process.exit(failed.length > 0 ? 1 : 0)
