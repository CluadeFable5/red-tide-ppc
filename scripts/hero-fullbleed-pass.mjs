#!/usr/bin/env node
/**
 * hero-fullbleed-pass.mjs — real-browser verification of the full-bleed hero
 * backdrop fix (docs/design-references.md §20).
 *
 * Runs against the PRODUCTION build (`npm run build` && `npm run preview`) in
 * real Chromium (@sparticuz/chromium + puppeteer-core, installed OUTSIDE the
 * repo so it is not a project dependency — same harness as §16).
 *
 * The bug being pinned: `HeroBackdrop` used to be a child of the hero's
 * *content* section, so its `absolute inset-0` was sized by that section —
 * the left grid column inside the centered `max-w-*` container. The texture
 * stopped in a rectangle around the headline/text/CTA block and the rest of
 * the hero band (the live-overview column, the page margins) was flat black.
 *
 * Items:
 *   1. The backdrop spans the full width of the hero band (= the viewport;
 *      the band is a full-bleed sibling of the content column, not inside it).
 *   2. The backdrop spans the band's full height, both columns included.
 *   3. The content (headline, CTAs, live overview) still sits on top of the
 *      backdrop: hit-testing at the CTA centre returns the link, not the
 *      backdrop, and the two-column / stacked layout is byte-for-byte what
 *      landing-responsive-pass.mjs asserts.
 *   4. No horizontal scroll and no content pushed outside the viewport by the
 *      now full-bleed absolutely-positioned layer.
 *   5. Pixel evidence, not just DOM rects: a horizontal luminance scan
 *      through the headline band — texture must reach the left and right
 *      edges of the viewport, not only the content column.
 *   6. Reduced motion: no canvas at all, static gradient still full-bleed.
 *
 * Usage:
 *   npm run build && npm run preview   # :4173
 *   node scripts/hero-fullbleed-pass.mjs [baseURL] [outDir]
 *
 * The Chromium deps are not project dependencies. Install them outside the
 * repo (see docs §16.1):
 *   mkdir -p ~/qa-tools && cd ~/qa-tools && npm init -y && npm i @sparticuz/chromium puppeteer-core
 * If the system is missing libnss3/libnspr4 this script extracts the copies
 * @sparticuz/chromium ships (al2023.tar.br) and prepends them to
 * LD_LIBRARY_PATH before launching, so a plain `node scripts/…` just works.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { decodePNG } from './png-analyse.mjs'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const OUT = process.argv[3] ?? new URL('../docs/hero-fullbleed-shots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// ESM ignores NODE_PATH, so resolve the out-of-repo harness explicitly and
// fall back to a plain specifier (if someone linked it into the repo anyway).
const QA = process.env.QA_TOOLS ?? join(homedir(), 'qa-tools')
const load = async (name) => {
  try {
    return await import(name)
  } catch {
    // A directory URL is not a valid ESM specifier; resolve the package entry
    // (exports["."].import | .default | main) out of its package.json instead.
    const dir = join(QA, 'node_modules', name)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const dot = pkg.exports?.['.']
    const entry =
      (typeof dot === 'object' && (dot.import ?? dot.default)) ??
      (typeof dot === 'string' ? dot : undefined) ??
      pkg.main ??
      'index.js'
    return await import(pathToFileURL(join(dir, entry)).href)
  }
}
const { default: chromium } = await load('@sparticuz/chromium')
const { default: puppeteer } = await load('puppeteer-core')

// The sandbox distro lacks libnss3/libnspr4; @sparticuz/chromium ships them
// (it only auto-extracts them on Amazon Linux 2023). Extract once, then make
// sure the loader can see them for the browser process we are about to spawn.
{
  const libDir = '/tmp/al2023/lib'
  const marker = join(libDir, 'libnspr4.so')
  if (!existsSync(marker)) {
    const { inflate } = await load('@sparticuz/chromium')
    const bin = join(QA, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br')
    if (existsSync(bin)) await inflate(bin)
  }
  if (existsSync(marker) && !(process.env.LD_LIBRARY_PATH ?? '').includes(libDir)) {
    process.env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  }
}

chromium.graphicsMode = true // real WebGL via SwiftShader, not --disable-gpu

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
]

const results = []
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass })
  const tag = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'WARN'
  console.log(`\n[${tag}] ${id} · ${name}`)
  const lines = Array.isArray(detail) ? detail : [detail]
  for (const line of lines) console.log(`       ${line}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const close = (a, b, tol = 1) => Math.abs(a - b) <= tol

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'],
  headless: 'shell',
})

async function newPage({ reducedMotion = false, width, height } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  }
  await page.evaluateOnNewDocument(() => {
    // Count real GL draws, so "the shader is actually painting" is measured
    // rather than inferred from a canvas element existing.
    window.__draws = 0
    for (const proto of [
      window.WebGLRenderingContext && window.WebGLRenderingContext.prototype,
      window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype,
    ]) {
      if (!proto) continue
      for (const m of ['drawArrays', 'drawElements']) {
        const orig = proto[m]
        if (!orig) continue
        proto[m] = function (...a) {
          window.__draws++
          return orig.apply(this, a)
        }
      }
    }
  })
  return page
}

/**
 * Everything the pass needs, measured in one evaluate so the numbers are from
 * a single frame of layout.
 *
 * Selectors are deliberately the ones landing-responsive-pass.mjs already
 * owns (`section[aria-label="Introduction"]`, the Figures panel's parent) so
 * the two scripts cannot drift apart on what "the hero" is.
 */
async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const { x, y, width, height, right, bottom } = el.getBoundingClientRect()
      return { x, y, width, height, right, bottom }
    }
    const intro = document.querySelector('section[aria-label="Introduction"]')
    const band = intro?.parentElement // the grid: intro column + live overview
    const overview = document.querySelector('section[aria-label="Figures"]')?.parentElement
    const backdrop = document.querySelector('[data-testid="hero-backdrop"]')
    const staticBackdrop = document.querySelector('[data-testid="hero-static-backdrop"]')
    const canvas = backdrop ? backdrop.querySelector('canvas') : null
    // The two CTAs (not the header's "Map" link, which shares the href).
    const ctas = [...document.querySelectorAll('a[href="/map"]')].filter(
      (a) => !a.closest('header'),
    )
    // Anything that escaped the viewport horizontally — the classic way a
    // full-bleed layer breaks a page.
    const overflow = [...document.querySelectorAll('body *')].filter((e) => {
      if (e.closest('[aria-hidden="true"]')) return false // decorative layers
      const r = e.getBoundingClientRect()
      return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)
    })
    const ctaHit = ctas.map((a) => {
      const r = a.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 12))
      return hit ? (hit === a || a.contains(hit) ? 'link' : hit.tagName) : 'nothing'
    })
    return {
      vw: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      intro: rect(intro),
      band: rect(band),
      overview: rect(overview),
      backdrop: rect(backdrop),
      backdropExists: !!backdrop,
      staticBackdrop: rect(staticBackdrop),
      canvas: canvas ? { ...rect(canvas), w: canvas.width, h: canvas.height } : null,
      ctas: ctas.map(rect),
      ctaHit,
      overflow: overflow.map((e) => e.tagName + '.' + String(e.className).slice(0, 60)),
    }
  })
}

/**
 * Pixel evidence: average a horizontal strip through the headline and report
 * luminance stats for the outer margins vs the centre. The clipped-backdrop
 * failure mode is *exactly* flat black out there (measured: mean 8.0, max
 * 8.0, sd 0.00 — the page ground, nothing else), so the bar is a lift of
 * 10/255 plus any variation at all: the StaticBackdrop's edge sheen alone
 * clears it, and the Ferrofluid's drifting rims add more whenever they pass.
 * The page ground is #080808 (luma ≈ 8).
 */
function scanStrip(png, y0, y1) {
  const { width, height, channels, data } = decodePNG(png)
  const yStart = Math.max(0, Math.round(y0))
  const yEnd = Math.min(height, Math.round(y1))
  const colMax = new Array(width).fill(0)
  let colMean = new Array(width).fill(0)
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width * channels + x * channels
      const r = data[i]
      const g = channels >= 3 ? data[i + 1] : r
      const b = channels >= 3 ? data[i + 2] : r
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      colMean[x] += l / (yEnd - yStart)
      if (l > colMax[x]) colMax[x] = l
    }
  }
  const stats = (from, to) => {
    const seg = colMean.slice(from, to)
    const mean = seg.reduce((a, b) => a + b, 0) / seg.length
    const max = colMax.slice(from, to).reduce((a, b) => Math.max(a, b), 0)
    const sd = Math.sqrt(seg.reduce((a, b) => a + (b - mean) ** 2, 0) / seg.length)
    return { mean, max, sd }
  }
  return {
    width,
    left: stats(2, 42),
    centre: stats(Math.round(width / 2) - 100, Math.round(width / 2) + 100),
    right: stats(width - 42, width - 2),
  }
}

// ---------------------------------------------------------------------------
// 1–5 · the four widths, motion allowed (the canvas path)
// ---------------------------------------------------------------------------
for (const { width, height } of VIEWPORTS) {
  const tag = `${width}px`
  const page = await newPage({ width, height })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await page.evaluate(() => document.fonts.ready)

  // The canvas is idle-gated (requestIdleCallback, 1.2 s timeout fallback),
  // lazy-chunked, and must actually draw before there is anything to see.
  let canvasLive = false
  for (let i = 0; i < 40 && !canvasLive; i++) {
    await sleep(250)
    canvasLive = (await page.evaluate(() => window.__draws > 0)) === true
  }
  await sleep(600) // a few more frames of texture

  const m = await measure(page)
  const l = {} // layout numbers, prettified
  for (const k of ['intro', 'band', 'overview', 'backdrop'])
    l[k] = { x: Math.round(m[k].x), y: Math.round(m[k].y), w: Math.round(m[k].width), h: Math.round(m[k].height) }

  record(`1-${tag}`, 'backdrop spans the full width of the hero band', close(m.backdrop.x, 0) && close(m.backdrop.width, m.vw), [
    `viewport ${m.vw}px · backdrop x=${l.backdrop.x} w=${l.backdrop.w}`,
    `band (intro + overview grid) x=${l.band.x} w=${l.band.w}`,
    canvasLive ? 'Ferrofluid draws observed: yes' : 'Ferrofluid draws observed: NO (canvas never painted)',
  ])

  record(`2-${tag}`, 'backdrop spans the band top-to-bottom, both columns', m.backdrop.y <= m.band.y + 1 && m.backdrop.bottom >= m.band.bottom - 1, [
    `band y=${l.band.y} h=${l.band.h} · backdrop y=${l.backdrop.y} h=${l.backdrop.h}`,
    `intro column ${Math.round(m.intro.width)}px · overview column ${Math.round(m.overview.width)}px`,
  ])

  const hitOk = m.ctaHit.length === 2 && m.ctaHit.every((h) => h === 'link')
  record(`3-${tag}`, 'CTA/content still layered on top of the backdrop', hitOk, [
    `hit-test at CTA centres: ${m.ctaHit.join(', ')}`,
    `CTAs inside the band: ${m.ctas.every((c) => c.y >= m.band.y - 1 && c.bottom <= m.band.bottom + 1)}`,
  ])

  const layoutOk =
    m.scrollWidth <= m.vw &&
    m.overflow.length === 0 &&
    (width >= 1024
      ? m.overview.x >= m.intro.right + 40 && m.overview.y < m.intro.bottom && m.overview.bottom > m.intro.y
      : m.overview.y >= m.intro.bottom + 50)
  record(`4-${tag}`, 'no horizontal scroll; hero/status layout unchanged', layoutOk, [
    `scrollWidth ${m.scrollWidth} vs viewport ${m.vw}`,
    `elements outside viewport: ${m.overflow.length ? m.overflow.join(' | ') : 'none'}`,
    width >= 1024 ? 'desktop: live overview beside the intro column' : 'narrow: live overview stacked after the intro column',
  ])

  // Screenshot the whole hero band: header down past the band bottom, so the
  // flat margins (before) or full-bleed texture (after) are both in frame.
  const shot = `${OUT}/hero-${width}.png`
  await page.screenshot({
    path: shot,
    clip: { x: 0, y: 0, width: m.vw, height: Math.min(m.band.bottom + 120, (await page.evaluate(() => document.documentElement.scrollHeight))) },
  })

  // 5 · pixel scan through the headline area (page coords == shot coords:
  // scrolled to top, clip starts at y=0).
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: m.vw, height: Math.min(m.band.bottom + 120, 4000) } })
  const stripY = m.intro.y + m.intro.height * 0.45
  const scan = scanStrip(png, stripY - 20, stripY + 20)
  // Both edges must clear the bar independently — a clipped backdrop leaves
  // one side lit (where the content column was) and the other exactly black.
  const liftL = scan.left.max - 8 // vs #080808 ground
  const liftR = scan.right.max - 8
  record(`5-${tag}`, 'texture reaches both viewport edges (pixel scan of the headline strip)', liftL >= 10 && liftR >= 10, [
    `strip y≈${Math.round(stripY)}px · left 40px: mean ${scan.left.mean.toFixed(1)} max ${scan.left.max.toFixed(1)} sd ${scan.left.sd.toFixed(2)}`,
    `centre 200px:          mean ${scan.centre.mean.toFixed(1)} max ${scan.centre.max.toFixed(1)} sd ${scan.centre.sd.toFixed(2)}`,
    `right 40px: mean ${scan.right.mean.toFixed(1)} max ${scan.right.max.toFixed(1)} sd ${scan.right.sd.toFixed(2)}`,
    `lift above page ground — left ${liftL.toFixed(1)}/255, right ${liftR.toFixed(1)}/255 (clipped state measured 0.0 on the dark side)`,
  ])

  if (m.canvas) {
    record(`6-${tag}`, 'canvas backing store matches the band at dpr=1', close(m.canvas.w, m.backdrop.width, 2) && close(m.canvas.h, m.backdrop.height, 2), [
      `canvas CSS ${Math.round(m.canvas.width)}×${Math.round(m.canvas.height)} · backing ${m.canvas.w}×${m.canvas.h} · draws ${await page.evaluate(() => window.__draws)}`,
    ])
  }

  await page.close()
  console.log(`\n       shot: ${shot}`)
}

// ---------------------------------------------------------------------------
// 7 · reduced motion: no canvas, static gradient still full-bleed
// ---------------------------------------------------------------------------
{
  const { width, height } = VIEWPORTS[2] // 1280
  const page = await newPage({ reducedMotion: true, width, height })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(1600) // past the idle-gate timeout, in case anything tried
  const m = await measure(page)
  const shot = `${OUT}/hero-1280-reduced.png`
  await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: m.vw, height: Math.min(m.band.bottom + 120, 4000) } })
  record('7-1280px', 'reduced motion: no WebGL at all; static gradient full-bleed', m.canvas === null && close(m.backdrop.x, 0) && close(m.backdrop.width, m.vw), [
    `canvas present: ${m.canvas !== null} · backdrop x=${Math.round(m.backdrop.x)} w=${Math.round(m.backdrop.width)}`,
    `static gradient present: ${m.backdropExists && m.backdrop.width > 0}`,
  ])
  await page.close()
  console.log(`\n       shot: ${shot}`)
}

await browser.close()

const failed = results.filter((r) => r.pass === false)
console.log(`\n${'='.repeat(72)}`)
console.log(`${results.filter((r) => r.pass).length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map((f) => f.id).join(', ')}` : ''}`)
process.exit(failed.length ? 1 : 0)
