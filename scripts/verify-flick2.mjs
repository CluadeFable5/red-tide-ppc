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
async function getState(page) {
  return await page.evaluate(() => {
    const h = document.querySelector('[data-testid="header-chrome"]')
    const sheet = document.querySelector('[role="region"][aria-label="Advisory and zone list"]')
    const cs = h ? getComputedStyle(h) : null
    return {
      opacity: cs ? parseFloat(cs.opacity) : null,
      pe: cs ? cs.pointerEvents : null,
      top: sheet?.getBoundingClientRect().top,
      anchor: sheet?.getAttribute('data-anchor'),
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
console.log('peek', await getState(page))

// Now click full dot and capture during spring
console.log('Clicking full dot from peek (spring animation peek->full, skipping mid)')
await page.click('button[aria-label="Go to full view"]')
// capture 20 frames every 40ms
for (let i=0;i<25;i++) {
  await new Promise(r => setTimeout(r, 40))
  const s = await getState(page)
  console.log(`frame ${i}: top=${s.top?.toFixed(1)} anchor=${s.anchor} opacity=${s.opacity?.toFixed(3)} pe=${s.pe}`)
  await page.screenshot({ path: `${OUTPUT_DIR}/peek-to-full-${String(i).padStart(2,'0')}-top${Math.round(s.top||0)}-op${(s.opacity||0).toFixed(2)}.png` })
}
await settleAt(page, 'full')
console.log('full settled', await getState(page))

// Now flick via drag that projects: start at peek, drag up only 150px quickly, release with upward velocity
await page.click('button[aria-label="Go to peek view"]')
await settleAt(page, 'peek')
console.log('\npeek again for drag flick test', await getState(page))

const box = await page.$eval('[role="region"][aria-label="Advisory and zone list"]', el => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
})
let handle = { x: box.x + box.width/2, y: box.y + 24 }
console.log('handle', handle)
// Simulate fast flick: move up 150px in 90ms (velocity ~1666px/s upward, negative)
await page.mouse.move(handle.x, handle.y)
await page.mouse.down()
await page.mouse.move(handle.x, handle.y - 150, { steps: 5 })
await new Promise(r => setTimeout(r, 90))
await page.mouse.up()
console.log('released fast flick up 150px')
// capture frames
for (let i=0;i<20;i++) {
  await new Promise(r => setTimeout(r, 50))
  const s = await getState(page)
  console.log(`drag frame ${i}: top=${s.top?.toFixed(1)} anchor=${s.anchor} opacity=${s.opacity?.toFixed(3)}`)
  await page.screenshot({ path: `${OUTPUT_DIR}/drag-peek-to-full-${String(i).padStart(2,'0')}-op${(s.opacity||0).toFixed(2)}.png` })
}
await settleAt(page, 'full')
console.log('drag full settled', await getState(page))

await browser.close()
console.log('DONE')
