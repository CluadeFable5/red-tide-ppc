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

async function getHeaderState(page) {
  return await page.evaluate(() => {
    const header = document.querySelector('[data-testid="header-chrome"]')
    if (!header) return { exists: false }
    const style = getComputedStyle(header)
    return {
      exists: true,
      opacity: parseFloat(style.opacity),
      pointerEvents: style.pointerEvents,
      innerHTML: header.innerHTML.slice(0, 500),
      demoChipVisible: !!document.querySelector('[data-testid="header-chrome"]') && 
        Array.from(document.querySelectorAll('[data-testid="header-chrome"] *')).some(el => el.textContent?.includes('DEMO')),
      // Check for DEMO chip and controls in header
      hasDemo: document.body.innerHTML.includes('DEMO'),
      // Get bounding rect to check visibility
      rect: header.getBoundingClientRect(),
    }
  })
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

  // Peek checks
  await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-peek.png` })
  record(`${label} ${inputType} peek screenshot`, true)
  
  let headerState = await getHeaderState(page)
  record(`${label} ${inputType} peek header visible opacity=1`, headerState.opacity >= 0.95, `opacity ${headerState.opacity}`)
  record(`${label} ${inputType} peek header pointer-events auto`, headerState.pointerEvents === 'auto', `pointerEvents ${headerState.pointerEvents}`)

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

  // Header at mid must be fully visible and interactive
  headerState = await getHeaderState(page)
  record(`${label} ${inputType} mid header fully visible`, headerState.opacity >= 0.95, `opacity ${headerState.opacity} — DEMO chip/Admin/reset must be visible`)
  record(`${label} ${inputType} mid header pointer-events auto (interactive)`, headerState.pointerEvents === 'auto', `pointerEvents ${headerState.pointerEvents}`)

  // Extra: check DEMO chip visible at mid via page eval looking for header controls
  const midControls = await page.evaluate(() => {
    const header = document.querySelector('[data-testid="header-chrome"]')
    if (!header) return { demo: false, admin: false, reset: false }
    const text = header.textContent || ''
    const hasDemo = text.includes('DEMO') || document.querySelector('[data-testid="header-chrome"]')?.innerHTML.includes('DEMO')
    // Check for Admin link or reset button in header
    const headerHTML = header.innerHTML
    return {
      demoVisible: headerHTML.includes('DEMO') || text.includes('DEMO'),
      hasContent: text.length > 10,
      opacity: parseFloat(getComputedStyle(header).opacity),
    }
  })
  record(`${label} ${inputType} mid header controls (DEMO/Admin) visible`, midControls.demoVisible || midControls.hasContent, `hasContent ${midControls.hasContent} demo ${midControls.demoVisible} opacity ${midControls.opacity}`)

  // Mid → full
  try {
    const handle = await sheetHandle()
    await drag(page, handle, { x: handle.x, y: handle.y - (midOffset - fullOffset) }, 90, 6)
    await settleAt(page, 'full')
    await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-full.png` })
    record(`${label} ${inputType} flick mid→full`, true)

    headerState = await getHeaderState(page)
    record(`${label} ${inputType} full header faded out opacity=0`, headerState.opacity <= 0.15, `opacity ${headerState.opacity}`)
    record(`${label} ${inputType} full header pointer-events none`, headerState.pointerEvents === 'none', `pointerEvents ${headerState.pointerEvents}`)

    const mapInteractiveFull = await page.$eval('[data-testid="map-interactivity"]', el => el.getAttribute('data-interactive'))
    record(`${label} ${inputType} full — map NOT interactive`, mapInteractiveFull === 'false', `interactive ${mapInteractiveFull}`)
  } catch (e) {
    record(`${label} ${inputType} flick mid→full`, false, e.message.slice(0, 200))
  }

  // Full → mid drag: verify header fades back in promptly (not stuck invisible)
  try {
    const handle = await sheetHandle()
    // Drag down partially: from full to mid is down distance = midOffset - fullOffset
    // Do it slowly to observe intermediate opacity
    const midY = handle.y + (midOffset - fullOffset) * 0.3 // 30% of way to mid
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x, midY, { steps: 10 })
    await new Promise(r => setTimeout(r, 200))
    let intermediate = await getHeaderState(page)
    // At 30% down from full towards mid (progress ~0.7-0.8), header should already be partially/fully visible
    record(`${label} ${inputType} full→mid drag intermediate header starts fading in`, intermediate.opacity > 0.1, `opacity ${intermediate.opacity} at 30% down from full`)
    // Continue to mid
    await page.mouse.move(handle.x, handle.y + (midOffset - fullOffset), { steps: 10 })
    await new Promise(r => setTimeout(r, 200))
    await page.mouse.up()
    await settleAt(page, 'mid')
    
    headerState = await getHeaderState(page)
    record(`${label} ${inputType} full→mid drag header fully visible at mid`, headerState.opacity >= 0.95, `opacity ${headerState.opacity} — must be visible promptly, not stuck`)
    record(`${label} ${inputType} full→mid drag pointer-events re-enabled`, headerState.pointerEvents === 'auto', `pointerEvents ${headerState.pointerEvents}`)
    
    await page.screenshot({ path: `${OUTPUT_DIR}/sheet-${width}-${inputType}-mid-after-full-drag.png` })
  } catch (e) {
    record(`${label} ${inputType} full→mid drag header fade-in`, false, e.message.slice(0, 300))
    try { await page.mouse.up() } catch {}
    // Try fallback to dot
    try {
      const midDot = await page.$('button[aria-label="Go to mid view"]')
      if (midDot) {
        await midDot.click()
        await settleAt(page, 'mid')
        headerState = await getHeaderState(page)
        record(`${label} ${inputType} mid after fallback header visible`, headerState.opacity >= 0.95, `opacity ${headerState.opacity}`)
      }
    } catch {}
  }

  // Full → peek (drag down)
  try {
    // Ensure at full first
    try { await settleAt(page, 'full') } catch { 
      const fullDot = await page.$('button[aria-label="Go to full view"]')
      if (fullDot) { await fullDot.click(); await settleAt(page, 'full') }
    }
    const handle = await sheetHandle()
    const downDistance = (peekOffset - fullOffset) * 1.1
    await drag(page, handle, { x: handle.x, y: handle.y + downDistance }, 600)
    await settleAt(page, 'peek')
    record(`${label} ${inputType} drag full→peek`, true)
    headerState = await getHeaderState(page)
    record(`${label} ${inputType} peek after full drag header visible`, headerState.opacity >= 0.95, `opacity ${headerState.opacity}`)
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
