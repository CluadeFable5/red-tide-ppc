#!/usr/bin/env node
import puppeteer from 'puppeteer-core'
import fs from 'fs'
const BASE_URL = 'http://localhost:4173'
const libPath = '/tmp/chromium-libs/lib'
process.env.LD_LIBRARY_PATH = libPath + ':' + (process.env.LD_LIBRARY_PATH || '')
const OUTPUT_DIR = 'docs/bottom-sheet-pass-real/flick-sequence'
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

async function settleAt(page, anchor) {
  await page.waitForSelector(`[data-anchor="${anchor}"]`, { timeout: 8000 })
  await new Promise(r => setTimeout(r, 900))
}

let browser = await puppeteer.launch({
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote'],
  executablePath: '/tmp/chromium',
  headless: 'new',
  env: { ...process.env, LD_LIBRARY_PATH: libPath + ':' + (process.env.LD_LIBRARY_PATH || '') }
})
let page = await browser.newPage()
await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.leaflet-overlay-pane path', { timeout: 15000 })
await settleAt(page, 'peek')

// Inject observer that logs header opacity every rAF during animation
await page.evaluate(() => {
  window.__log = []
  window.__logging = false
  const header = document.querySelector('[data-testid="header-chrome"]')
  const sheet = document.querySelector('[role="region"][aria-label="Advisory and zone list"]')
  if (!header || !sheet) return
  let lastOpacity = null
  function tick() {
    if (!window.__logging) return
    const cs = getComputedStyle(header)
    const opacity = parseFloat(cs.opacity)
    const top = sheet.getBoundingClientRect().top
    const now = performance.now()
    // only log when opacity changes or top changes significantly
    if (lastOpacity === null || Math.abs(opacity - lastOpacity) > 0.01 || window.__log.length < 2) {
      window.__log.push({ t: now, opacity, top, anchor: sheet.getAttribute('data-anchor') })
      lastOpacity = opacity
    } else {
      // still log top for progress tracking even if opacity same
      window.__log.push({ t: now, opacity, top, anchor: sheet.getAttribute('data-anchor') })
    }
    requestAnimationFrame(tick)
  }
  window.startLog = () => {
    window.__log = []
    window.__logging = true
    lastOpacity = null
    requestAnimationFrame(tick)
  }
  window.stopLog = () => {
    window.__logging = false
    return window.__log
  }
})

console.log('Starting log and clicking full from peek')
await page.evaluate(() => window.startLog())
await page.click('button[aria-label="Go to full view"]')
// wait 1s for animation
await new Promise(r => setTimeout(r, 1000))
let log = await page.evaluate(() => window.stopLog())
console.log('Log frames:', log.length)
log.forEach((entry, i) => {
  if (i<30 || entry.opacity < 1) {
    console.log(`  ${i}: t+${(entry.t - log[0].t).toFixed(1)}ms top=${entry.top.toFixed(1)} opacity=${entry.opacity.toFixed(3)} anchor=${entry.anchor}`)
  }
})

// Analyze jarring: check if opacity goes from 1 to 0 in <50ms without intermediate
let fadeStart = log.findIndex(e => e.opacity < 0.99)
let fadeEnd = log.findIndex(e => e.opacity < 0.01)
if (fadeStart >=0 && fadeEnd >=0) {
  let duration = log[fadeEnd].t - log[fadeStart].t
  console.log(`\nFade duration 1->0: ${duration.toFixed(1)}ms (from frame ${fadeStart} to ${fadeEnd})`)
  let intermediate = log.slice(fadeStart, fadeEnd+1).filter(e => e.opacity > 0.05 && e.opacity < 0.95)
  console.log(`Intermediate frames (0.05-0.95): ${intermediate.length}`)
  if (intermediate.length >= 2) {
    console.log('PASS: fade has intermediate frames, not instant glitch')
  } else {
    console.log('FAIL: fade is abrupt, only 0-1 values, looks like glitch')
  }
}

// Capture screenshots during fade via rAF timing
await page.evaluate(() => {
  window.__log = []
  window.__logging = true
})
await page.click('button[aria-label="Go to peek view"]')
await settleAt(page, 'peek')
await page.evaluate(() => { window.__log = []; window.__logging = true; window.startLog && window.startLog() })
await page.click('button[aria-label="Go to full view"]')
for (let i=0;i<15;i++) {
  await new Promise(r => setTimeout(r, 30))
  const state = await page.evaluate(() => {
    const h = document.querySelector('[data-testid="header-chrome"]')
    const sheet = document.querySelector('[role="region"][aria-label="Advisory and zone list"]')
    return {
      opacity: parseFloat(getComputedStyle(h).opacity),
      top: sheet.getBoundingClientRect().top
    }
  })
  console.log(`screenshot frame ${i}: top=${state.top.toFixed(1)} opacity=${state.opacity.toFixed(3)}`)
  await page.screenshot({ path: `${OUTPUT_DIR}/smooth-peek-to-full-${String(i).padStart(2,'0')}-op${state.opacity.toFixed(2)}.png` })
}
await settleAt(page, 'full')

// Reduced motion test
await page.close()
let page2 = await browser.newPage()
await page2.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
await page2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page2.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('.leaflet-overlay-pane path', { timeout: 15000 })
await settleAt(page2, 'peek')

await page2.evaluate(() => {
  window.__log = []
  window.__logging = false
  const header = document.querySelector('[data-testid="header-chrome"]')
  const sheet = document.querySelector('[role="region"][aria-label="Advisory and zone list"]')
  window.startLog = () => {
    window.__log = []
    window.__logging = true
    let last = null
    function tick() {
      if (!window.__logging) return
      const opacity = parseFloat(getComputedStyle(header).opacity)
      const top = sheet.getBoundingClientRect().top
      window.__log.push({ t: performance.now(), opacity, top, anchor: sheet.getAttribute('data-anchor') })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  window.stopLog = () => { window.__logging = false; return window.__log }
})

console.log('\n--- REDUCED MOTION ---')
await page2.evaluate(() => window.startLog())
await page2.click('button[aria-label="Go to full view"]')
await new Promise(r => setTimeout(r, 500))
let rmLog = await page2.evaluate(() => window.stopLog())
console.log('RM log frames:', rmLog.length)
rmLog.forEach((e,i) => {
  if (i<10) console.log(`  RM ${i}: t+${(e.t-rmLog[0].t).toFixed(1)}ms top=${e.top.toFixed(1)} opacity=${e.opacity.toFixed(3)}`)
})
let rmFadeDuration = rmLog.length>1 ? rmLog[rmLog.length-1].t - rmLog[0].t : 0
let rmHasIntermediate = rmLog.some(e => e.opacity>0.05 && e.opacity<0.95)
console.log(`RM fade intermediate? ${rmHasIntermediate} (should be false for instant swap)`)
if (!rmHasIntermediate && rmLog[0].opacity===1 && rmLog[rmLog.length-1].opacity===0) {
  console.log('PASS: reduced-motion instant swap at threshold, no animated fade')
} else {
  console.log('CHECK: RM has intermediate fade, might need instant')
}

await browser.close()
console.log('DONE')
