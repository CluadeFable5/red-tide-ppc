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

async function getHeaderState(page) {
  return await page.evaluate(() => {
    const h = document.querySelector('[data-testid="header-chrome"]')
    if (!h) return null
    const cs = getComputedStyle(h)
    const progressEl = document.querySelector('[data-testid="map-interactivity"]')
    // try to get progress from sheet transform if available
    const sheet = document.querySelector('[role="region"][aria-label="Advisory and zone list"]')
    const sheetRect = sheet?.getBoundingClientRect()
    return {
      opacity: parseFloat(cs.opacity),
      pointerEvents: cs.pointerEvents,
      sheetTop: sheetRect?.top,
      sheetAnchor: sheet?.getAttribute('data-anchor'),
    }
  })
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
console.log('peek', await getHeaderState(page))
await page.screenshot({ path: `${OUTPUT_DIR}/00-peek.png` })

// Fast flick peek -> full via drag (short duration, few steps, mimicking fast swipe up)
const box = await page.$eval('[role="region"][aria-label="Advisory and zone list"]', el => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
})
const handle = { x: box.x + box.width/2, y: box.y + 24 }
const h = 667
const peekOffset = h * (1-0.15) // 567
const fullOffset = h * (1-0.88) // 80
const distance = peekOffset - fullOffset // ~487 up

console.log(`Flicking up ${distance}px fast (peek->full)`)
await page.mouse.move(handle.x, handle.y)
await page.mouse.down()
// fast flick: 6 steps, 90ms total
for (let i=1; i<=6; i++) {
  const t = i/6
  await page.mouse.move(handle.x, handle.y - distance*t, { steps: 1 })
  await new Promise(r => setTimeout(r, 15))
}
await page.mouse.up()

// Capture intermediate frames during spring settle (every 50ms for 1.2s)
for (let i=0; i<20; i++) {
  await new Promise(r => setTimeout(r, 60))
  const state = await getHeaderState(page)
  console.log(`frame ${i}: anchor=${state.sheetAnchor} top=${Math.round(state.sheetTop)} opacity=${state.opacity.toFixed(3)} pe=${state.pointerEvents}`)
  await page.screenshot({ path: `${OUTPUT_DIR}/frame-${String(i).padStart(2,'0')}-opacity-${state.opacity.toFixed(2)}.png` })
  if (state.sheetAnchor === 'full' && state.opacity === 0) {
    // continue a few more frames to ensure stable
    if (i>8) break
  }
}

await settleAt(page, 'full')
console.log('full settled', await getHeaderState(page))
await page.screenshot({ path: `${OUTPUT_DIR}/99-full.png` })

// Now test reduced-motion: emulate prefers-reduced-motion
await page.close()

let page2 = await browser.newPage()
await page2.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
await page2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page2.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('.leaflet-overlay-pane path', { timeout: 15000 })
await settleAt(page2, 'peek')
console.log('\n--- REDUCED MOTION ---')
console.log('peek RM', await getHeaderState(page2))
await page2.screenshot({ path: `${OUTPUT_DIR}/rm-00-peek.png` })

// Go to mid via dot (should be instant jump, opacity stays 1)
await page2.click('button[aria-label="Go to mid view"]')
await settleAt(page2, 'mid')
let midRM = await getHeaderState(page2)
console.log('mid RM', midRM)
await page2.screenshot({ path: `${OUTPUT_DIR}/rm-01-mid.png` })

// Go to full via dot (instant jump, opacity 0 instantly, no fade animation)
await page2.click('button[aria-label="Go to full view"]')
// Capture immediately after click, before settle timeout, to see instant swap
await new Promise(r => setTimeout(r, 50))
let immediateFull = await getHeaderState(page2)
console.log('full RM immediate (50ms after click)', immediateFull)
await page2.screenshot({ path: `${OUTPUT_DIR}/rm-02-full-immediate.png` })
await settleAt(page2, 'full')
let fullRM = await getHeaderState(page2)
console.log('full RM settled', fullRM)
await page2.screenshot({ path: `${OUTPUT_DIR}/rm-03-full.png` })

// Full -> mid instant
await page2.click('button[aria-label="Go to mid view"]')
await new Promise(r => setTimeout(r, 50))
let immediateMid = await getHeaderState(page2)
console.log('mid RM immediate after full->mid (50ms)', immediateMid)
await page2.screenshot({ path: `${OUTPUT_DIR}/rm-04-mid-immediate.png` })
await settleAt(page2, 'mid')
console.log('mid RM settled', await getHeaderState(page2))

// Peek -> full direct flick skipping mid, with reduced motion
await page2.click('button[aria-label="Go to peek view"]')
await settleAt(page2, 'peek')
console.log('peek RM again', await getHeaderState(page2))
await page2.click('button[aria-label="Go to full view"]')
await new Promise(r => setTimeout(r, 50))
let directFull = await getHeaderState(page2)
console.log('direct peek->full RM immediate', directFull)
await page2.screenshot({ path: `${OUTPUT_DIR}/rm-05-peek-to-full-immediate.png` })
await settleAt(page2, 'full')

await browser.close()
console.log('DONE flick sequence')
