#!/usr/bin/env node
import puppeteer from 'puppeteer-core'
const BASE_URL = 'http://localhost:4173'
const libPath = '/tmp/chromium-libs/lib'
process.env.LD_LIBRARY_PATH = libPath + ':' + (process.env.LD_LIBRARY_PATH || '')

async function settleAt(page, anchor) {
  await page.waitForSelector(`[data-anchor="${anchor}"]`, { timeout: 8000 })
  await new Promise(r => setTimeout(r, 900))
}

async function getHeader(page) {
  return await page.evaluate(() => {
    const h = document.querySelector('[data-testid="header-chrome"]')
    if (!h) return null
    const cs = getComputedStyle(h)
    return {
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      text: h.textContent?.slice(0,200),
      html: h.innerHTML.slice(0,500)
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
console.log('peek header', await getHeader(page))

// go to mid via dot
await page.click('button[aria-label="Go to mid view"]')
await settleAt(page, 'mid')
let mid = await getHeader(page)
console.log('mid header', mid)
console.log('mid screenshot check — should show DEMO chip/Admin/reset fully visible')
await page.screenshot({ path: 'docs/bottom-sheet-pass-real/header-mid-375.png' })

// go to full
await page.click('button[aria-label="Go to full view"]')
await settleAt(page, 'full')
let full = await getHeader(page)
console.log('full header', full)
await page.screenshot({ path: 'docs/bottom-sheet-pass-real/header-full-375.png' })

// drag down 30% from full to mid and check intermediate
const box = await page.$eval('[role="region"][aria-label="Advisory and zone list"]', el => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
})
const handle = { x: box.x + box.width/2, y: box.y + 24 }
const h = 667
const midOffset = h * (1-0.5)
const fullOffset = h * (1-0.88)
const dragDist = (midOffset - fullOffset)

await page.mouse.move(handle.x, handle.y)
await page.mouse.down()
await page.mouse.move(handle.x, handle.y + dragDist*0.3, { steps: 10 })
await new Promise(r => setTimeout(r, 300))
let intermediate = await getHeader(page)
console.log('intermediate 30% down from full', intermediate)
await page.mouse.move(handle.x, handle.y + dragDist, { steps: 10 })
await new Promise(r => setTimeout(r, 300))
await page.mouse.up()
await settleAt(page, 'mid')
let after = await getHeader(page)
console.log('after drag full→mid header', after)
await page.screenshot({ path: 'docs/bottom-sheet-pass-real/header-mid-after-drag-375.png' })

await browser.close()
console.log('DONE')
