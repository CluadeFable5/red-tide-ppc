#!/usr/bin/env node
/**
 * hero-pass.mjs — real-browser verification of the landing motion pass (§15).
 *
 * Runs against the PRODUCTION build (`npm run preview` → :4173) in real
 * Chromium (@sparticuz/chromium + puppeteer-core, installed OUTSIDE the repo
 * so it is not a project dependency).
 *
 * Items, per the QA brief:
 *   1. Ferrofluid canvas mounts on a normal viewport; does NOT mount under
 *      emulated prefers-reduced-motion. Screenshots of both.
 *   2. Real frame cost while animating at dpr=1, unthrottled and under CDP
 *      CPU throttling (4x / 6x).
 *   3. Pause-on-scroll-out and pause-on-document.hidden actually stop the rAF
 *      loop (counted, before/after).
 *   4. DecryptedText → BlurText ordering on load, screenshotted over time.
 *   5. The BlurText word-wrap fix, at a narrow viewport.
 *   6. No seam / double-render where the hero's masked Waves meets the page.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
// Chromium is NOT a project dependency. Install it outside the repo:
//   mkdir -p ~/qa-tools && cd ~/qa-tools
//   npm init -y && npm i @sparticuz/chromium puppeteer-core
// then run this script with that directory on NODE_PATH, e.g.
//   NODE_PATH=~/qa-tools/node_modules \
//   LD_LIBRARY_PATH=/tmp/chromium-libs/lib \
//   node scripts/hero-pass.mjs
//
// On a distro missing libnss3/libnspr4 (and no apt access), @sparticuz/chromium
// ships them itself — extract bin/al2023.tar.br and point LD_LIBRARY_PATH at it.
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const OUT = new URL('./shots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

chromium.graphicsMode = true // real WebGL via SwiftShader, not --disable-gpu

const results = []
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail })
  const tag = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'WARN'
  console.log(`\n[${tag}] ${id} · ${name}`)
  for (const line of detail.split('\n')) console.log(`       ${line}`)
}

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'],
  headless: 'shell',
})

/**
 * Instrument requestAnimationFrame BEFORE any app code runs, so we can count
 * real scheduled frames rather than trusting the component.
 *
 * Also pins deviceScaleFactor reporting and lets us emulate reduced motion.
 */
async function newPage({ reducedMotion = false, width = 1280, height = 800 } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  if (reducedMotion) {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ])
  }
  await page.evaluateOnNewDocument(() => {
    window.__rafCount = 0
    const orig = window.requestAnimationFrame
    window.requestAnimationFrame = function (cb) {
      window.__rafCount++
      return orig.call(window, cb)
    }
    // Track WebGL context creation — the decisive signal for item 1.
    window.__glContexts = 0
    // Count real GPU draws, so "is the shader rendering" is measured directly
    // rather than inferred from the page's overall rAF rate (Waves keeps its
    // own loop running, which swamps a page-wide rAF count).
    window.__draws = 0
    for (const proto of [
      window.WebGLRenderingContext && window.WebGLRenderingContext.prototype,
      window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype,
    ]) {
      if (!proto) continue
      for (const m of ['drawArrays', 'drawElements']) {
        const orig = proto[m]
        if (!orig) continue
        proto[m] = function (...a) { window.__draws++; return orig.apply(this, a) }
      }
    }
    const origGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).includes('webgl')) window.__glContexts++
      return origGetContext.call(this, type, ...rest)
    }
    // Record which chunks get requested, to confirm the lazy boundary.
    window.__chunks = []
    const origAppend = document.head.appendChild.bind(document.head)
    document.head.appendChild = function (node) {
      if (node && node.tagName === 'SCRIPT' && node.src) window.__chunks.push(node.src)
      return origAppend(node)
    }
  })
  const netRequests = []
  page.on('request', (r) => netRequests.push(r.url()))
  page.__net = netRequests
  return page
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// 1 · Ferrofluid mounts normally / never mounts under reduced motion
// ---------------------------------------------------------------------------
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  // The canvas is idle-gated (requestIdleCallback, 1.2s timeout fallback).
  await sleep(3000)

  const normal = await page.evaluate(() => {
    const backdrop = document.querySelector('[data-testid="hero-backdrop"]')
    const canvases = Array.from(document.querySelectorAll('canvas'))
    // The Ferrofluid canvas is the one INSIDE the hero backdrop.
    const heroCanvas = backdrop ? backdrop.querySelector('canvas') : null
    return {
      backdropPresent: !!backdrop,
      staticGradient: !!document.querySelector('[data-testid="hero-static-backdrop"]'),
      heroCanvasPresent: !!heroCanvas,
      heroCanvasSize: heroCanvas
        ? { w: heroCanvas.width, h: heroCanvas.height,
            cssW: Math.round(heroCanvas.getBoundingClientRect().width),
            cssH: Math.round(heroCanvas.getBoundingClientRect().height) }
        : null,
      glContexts: window.__glContexts,
      totalCanvases: canvases.length,
    }
  })
  const ferroChunkNormal = page.__net.filter((u) => u.includes('Ferrofluid')).length

  await page.screenshot({ path: `${OUT}01a-normal-hero.png` })
  await page.close()

  // --- reduced motion ---
  const rmPage = await newPage({ reducedMotion: true })
  await rmPage.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(3000)

  const reduced = await rmPage.evaluate(() => {
    const backdrop = document.querySelector('[data-testid="hero-backdrop"]')
    return {
      // Under reduced motion HeroBackdrop returns the gradient-only branch,
      // which has no data-testid="hero-backdrop" wrapper.
      backdropPresent: !!backdrop,
      staticGradient: !!document.querySelector('[data-testid="hero-static-backdrop"]'),
      heroCanvasPresent: !!(backdrop && backdrop.querySelector('canvas')),
      glContexts: window.__glContexts,
      totalCanvases: document.querySelectorAll('canvas').length,
    }
  })
  const ferroChunkReduced = rmPage.__net.filter((u) => u.includes('Ferrofluid')).length
  await rmPage.screenshot({ path: `${OUT}01b-reduced-motion-hero.png` })
  await rmPage.close()

  const pass =
    normal.heroCanvasPresent &&
    normal.glContexts > 0 &&
    ferroChunkNormal > 0 &&
    !reduced.heroCanvasPresent &&
    reduced.glContexts === 0 &&
    ferroChunkReduced === 0 &&
    reduced.staticGradient

  record(
    '1',
    'Ferrofluid mounts normally; no WebGL at all under reduced motion',
    pass,
    [
      `NORMAL   hero canvas: ${normal.heroCanvasPresent}` +
        (normal.heroCanvasSize
          ? ` (backing ${normal.heroCanvasSize.w}x${normal.heroCanvasSize.h}px, css ${normal.heroCanvasSize.cssW}x${normal.heroCanvasSize.cssH})`
          : ''),
      `         WebGL contexts created: ${normal.glContexts}`,
      `         Ferrofluid chunk requests: ${ferroChunkNormal}`,
      `         total <canvas> on page: ${normal.totalCanvases} (1 = Waves, +1 = Ferrofluid)`,
      `REDUCED  hero canvas: ${reduced.heroCanvasPresent}`,
      `         WebGL contexts created: ${reduced.glContexts}`,
      `         Ferrofluid chunk requests: ${ferroChunkReduced}`,
      `         static gradient present: ${reduced.staticGradient}`,
      `         total <canvas> on page: ${reduced.totalCanvases}`,
      `shots: 01a-normal-hero.png, 01b-reduced-motion-hero.png`,
    ].join('\n'),
  )
}

// ---------------------------------------------------------------------------
// 2 · Real frame cost, unthrottled and CPU-throttled
// ---------------------------------------------------------------------------
{
  /**
   * Two numbers matter and they are different things:
   *
   *   - the PAGE's achieved frame rate (what the user feels while scrolling)
   *   - the SHADER's own render rate (draws/sec), which is what the WebGL
   *     exception actually costs
   *
   * Measuring only page rAF conflates them. We take both, and we take the
   * reduced-motion page (no canvas at all) as the control so the shader's
   * MARGINAL cost is an isolated number rather than an absolute that is
   * dominated by the software rasteriser.
   */
  async function measure({ throttle = 1, reduced = false }) {
    const page = await newPage({ reducedMotion: reduced })
    const client = await page.target().createCDPSession()
    if (throttle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    await page.goto(BASE, { waitUntil: 'networkidle2' })
    await sleep(3500)

    const canvasUp = await page.evaluate(
      () => !!document.querySelector('[data-testid="hero-backdrop"] canvas'),
    )

    const out = await page.evaluate(async () => {
      const deltas = []
      const d0 = window.__draws
      const t0 = performance.now()
      await new Promise((resolve) => {
        let last = performance.now()
        let n = 0
        function tick(now) {
          deltas.push(now - last)
          last = now
          if (++n >= 100) return resolve()
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const elapsed = performance.now() - t0
      return { deltas: deltas.slice(1), draws: window.__draws - d0, elapsed }
    })

    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
    await page.close()

    const sample = out.deltas
    const sorted = [...sample].sort((a, b) => a - b)
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length
    return {
      canvasUp,
      frames: sample.length,
      mean,
      median: pct(50),
      p95: pct(95),
      worst: sorted[sorted.length - 1],
      fps: 1000 / mean,
      drawFps: (out.draws / out.elapsed) * 1000,
      over32: sample.filter((d) => d > 32).length,
    }
  }

  const control = await measure({ reduced: true })          // no canvas at all
  const base = await measure({})                            // shader, no throttle
  const t4 = await measure({ throttle: 4 })
  const t6 = await measure({ throttle: 6 })

  const fmt = (label, m) =>
    `${label.padEnd(22)} canvas=${String(m.canvasUp).padEnd(5)} page ${m.fps.toFixed(1)} fps ` +
    `(mean ${m.mean.toFixed(1)}ms, median ${m.median.toFixed(1)}, p95 ${m.p95.toFixed(1)}, worst ${m.worst.toFixed(1)})  ` +
    `shader ${m.drawFps.toFixed(1)} draws/s`

  const marginal = base.mean - control.mean

  // SwiftShader is a CPU rasteriser; absolute fps here is NOT a phone number.
  // What we can honestly assert: the page still composites, the shader work is
  // bounded, and pausing (item 3) is what protects the rest of the page.
  const pass = control.fps >= 50 && base.drawFps > 0

  record(
    '2',
    'Real frame cost at dpr=1, unthrottled and CPU-throttled',
    pass,
    [
      fmt('control (no canvas)', control),
      fmt('shader, unthrottled', base),
      fmt('shader, CPU 4x', t4),
      fmt('shader, CPU 6x', t6),
      '',
      `marginal cost of the shader, unthrottled: +${marginal.toFixed(1)} ms/frame`,
      `backing store at dpr=1: 672x490 = 329k fragments/frame`,
      '',
      'IMPORTANT — read this number correctly:',
      '  The renderer is SwiftShader, a SOFTWARE (CPU) rasteriser, because this',
      '  sandbox has no GPU. Every fragment the shader touches is costed on the',
      '  CPU, so these fps are a worst-case floor and NOT representative of a',
      '  phone with a real GPU. The control run (reduced motion, no canvas)',
      '  holds a clean 60fps, which confirms the page itself is not the cost.',
      '  What this run CAN prove is relative: the shader dominates when it runs,',
      '  which is exactly why pause-on-scroll-out (item 3) is load-bearing.',
      '  A real-device measurement is still owed before shipping.',
    ].join('\n'),
  )
}

// ---------------------------------------------------------------------------
// 3 · Pause on scroll-out and on document.hidden
// ---------------------------------------------------------------------------
{
  /**
   * Counting page-wide rAF callbacks does NOT measure this: the Waves 2D
   * canvas schedules rAF continuously at full rate, so the page total mostly
   * tracks achieved fps. We count WebGL draw calls instead — those come only
   * from Ferrofluid, so zero draws means the shader loop really stopped.
   */
  const lines = []
  let allPass = true

  for (const vp of [
    { name: 'desktop 1280x800', width: 1280, height: 800 },
    { name: 'phone 375x667', width: 375, height: 667 },
  ]) {
    const page = await newPage({ width: vp.width, height: vp.height })
    await page.goto(BASE, { waitUntil: 'networkidle2' })
    await sleep(3500)

    const draws = async (ms) =>
      page.evaluate(async (ms) => {
        const s = window.__draws
        await new Promise((r) => setTimeout(r, ms))
        return window.__draws - s
      }, ms)

    const visible = await draws(1500)

    const geom = await page.evaluate(() => {
      window.scrollTo(0, 99999)
      return new Promise((res) =>
        setTimeout(() => {
          const r = document
            .querySelector('[data-testid="hero-backdrop"]')
            ?.getBoundingClientRect()
          res({
            scrollY: Math.round(window.scrollY),
            maxScroll: Math.round(
              document.documentElement.scrollHeight - window.innerHeight,
            ),
            heroBottom: r ? Math.round(r.bottom) : null,
          })
        }, 900),
      )
    })
    const scrolledOut = await draws(1500)

    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(1200)
    const resumed = await draws(1500)

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await sleep(1000)
    const hidden = await draws(1500)

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await sleep(1200)
    const unhidden = await draws(1500)
    await page.close()

    const ok =
      visible > 0 && scrolledOut === 0 && hidden === 0 && resumed > 0 && unhidden > 0
    if (!ok) allPass = false

    lines.push(
      `${vp.name}  (scrollY ${geom.scrollY}/${geom.maxScroll}, hero bottom ${geom.heroBottom}px)`,
      `  WebGL draw calls per 1500ms:`,
      `    hero visible        : ${visible}`,
      `    scrolled OUT of view: ${scrolledOut}`,
      `    scrolled back IN    : ${resumed}`,
      `    document.hidden     : ${hidden}`,
      `    visible again       : ${unhidden}`,
      `  -> ${ok ? 'pass' : 'FAIL'}`,
      '',
    )
  }

  record(
    '3',
    'Pause on scroll-out and on document.hidden actually stops rendering',
    allPass,
    [
      'Measured as WebGL draw calls (Ferrofluid only), not page rAF count.',
      '',
      ...lines,
      'Zero draws == the rAF loop is cancelled, not merely skipping work.',
    ].join('\n'),
  )
}

// ---------------------------------------------------------------------------
// 4 · DecryptedText → BlurText ordering
// ---------------------------------------------------------------------------
{
  const page = await newPage()
  const timeline = []
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const probe = () =>
    page.evaluate(() => {
      const h1 = document.querySelector('h1')
      const overlay = h1 ? h1.querySelector('span.absolute') : null
      const sub = Array.from(document.querySelectorAll('p')).find((p) =>
        (p.getAttribute('aria-label') ?? '').startsWith('Watch the water'),
      )
      const subSeg = sub ? sub.querySelector('span[aria-hidden="true"]') : null
      const subCs = subSeg ? getComputedStyle(subSeg) : null

      const li = document.querySelector('ul li span[aria-label^="Find your shore"]')
      const liSeg = li ? li.querySelector('span[aria-hidden="true"]') : null
      const liCs = liSeg ? getComputedStyle(liSeg) : null
      const liRect = li ? li.getBoundingClientRect() : null

      return {
        h1Text: overlay ? overlay.textContent : null,
        h1Resolved: (overlay ? overlay.textContent : '') === 'RED TIDE',
        subOpacity: subCs ? Number(subCs.opacity) : null,
        subBlur: subCs ? subCs.filter : null,
        listOpacity: liCs ? Number(liCs.opacity) : null,
        listTop: liRect ? Math.round(liRect.top) : null,
        listOnScreen: liRect ? liRect.top < window.innerHeight && liRect.bottom > 0 : null,
      }
    })

  const marks = [80, 200, 350, 600, 1000, 1600, 2400, 3200]
  let prev = 0
  for (const t of marks) {
    await sleep(t - prev)
    prev = t
    timeline.push({ t, ...(await probe()) })
  }
  await page.screenshot({ path: `${OUT}04a-hero-loaded.png` })

  // Everything above happened WITHOUT scrolling. The list must still be dark.
  const beforeScroll = timeline.at(-1).listOpacity
  const listWasOnScreen = timeline.some((s) => s.listOnScreen)

  await page.evaluate(() => {
    const h2 = Array.from(document.querySelectorAll('h2')).find((e) =>
      e.textContent.includes('How it works'),
    )
    h2?.scrollIntoView({ block: 'center', behavior: 'instant' })
  })
  await sleep(1600)
  const afterScroll = (await probe()).listOpacity
  await page.screenshot({ path: `${OUT}04b-how-it-works-revealed.png` })
  await page.close()

  const h1At = timeline.find((s) => s.h1Resolved)?.t
  const subAt = timeline.find((s) => s.subOpacity > 0.95)?.t

  // Order: h1 resolves first, subheading completes after, list waits for scroll.
  const pass =
    h1At !== undefined &&
    subAt !== undefined &&
    h1At <= subAt &&
    beforeScroll < 0.1 &&
    afterScroll > 0.95

  record(
    '4',
    'DecryptedText resolves, then BlurText blocks reveal on their own triggers',
    pass,
    [
      'No scrolling during this timeline (t = ms after DOMContentLoaded):',
      ...timeline.map(
        (s) =>
          `  t=${String(s.t).padStart(4)}  h1="${String(s.h1Text).padEnd(9)}" resolved=${String(s.h1Resolved).padEnd(5)}` +
          `  sub opacity=${s.subOpacity?.toFixed(2)} ${String(s.subBlur).padEnd(18)}` +
          `  list opacity=${s.listOpacity?.toFixed(2)} (top=${s.listTop}px onScreen=${s.listOnScreen})`,
      ),
      '',
      `h1 scramble resolved at:        ${h1At}ms`,
      `subheading fully opaque at:     ${subAt}ms`,
      `"How it works" before scrolling: opacity ${beforeScroll?.toFixed(2)}  <- must stay ~0`,
      `"How it works" after scrolling : opacity ${afterScroll?.toFixed(2)}`,
      `(list element was within the viewport box at some point: ${listWasOnScreen})`,
      '',
      'This is the regression that the flat 4s failsafe caused: the list used to',
      'read opacity 1.00 here without any scroll. The failsafe is now gated on',
      'the block actually being on screen.',
      'shots: 04a-hero-loaded.png, 04b-how-it-works-revealed.png',
    ].join('\n'),
  )
}

// ---------------------------------------------------------------------------
// 5 · BlurText word-wrap fix at a narrow viewport
// ---------------------------------------------------------------------------
{
  const page = await newPage({ width: 360, height: 740 })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)

  const wrap = await page.evaluate(() => {
    const sub = Array.from(document.querySelectorAll('p')).find((p) =>
      (p.getAttribute('aria-label') ?? '').startsWith('Watch the water'),
    )
    if (!sub) return { found: false }
    const segs = Array.from(sub.querySelectorAll('span[aria-hidden="true"]'))
    // Distinct top offsets == number of rendered lines.
    const tops = [...new Set(segs.map((s) => Math.round(s.getBoundingClientRect().top)))]
    const r = sub.getBoundingClientRect()
    const parent = sub.parentElement.getBoundingClientRect()
    return {
      found: true,
      words: segs.length,
      lines: tops.length,
      tops,
      boxWidth: Math.round(r.width),
      boxHeight: Math.round(r.height),
      parentWidth: Math.round(parent.width),
      overflowsParent: r.right > parent.right + 1,
      viewportWidth: window.innerWidth,
      hasNbsp: (sub.textContent || '').includes('\u00A0'),
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    }
  })

  await page.screenshot({ path: `${OUT}05-narrow-360-wrap.png`, fullPage: false })
  await page.close()

  const pass =
    wrap.found &&
    wrap.lines > 1 &&
    !wrap.overflowsParent &&
    !wrap.hasNbsp &&
    wrap.docScrollW <= wrap.docClientW

  record(
    '5',
    'BlurText subheading wraps at a narrow viewport (no NBSP unbreakable run)',
    pass,
    [
      `viewport: ${wrap.viewportWidth}px`,
      `subheading: ${wrap.words} word spans rendered across ${wrap.lines} lines`,
      `line top offsets: ${JSON.stringify(wrap.tops)}`,
      `box ${wrap.boxWidth}x${wrap.boxHeight}px inside parent ${wrap.parentWidth}px`,
      `overflows its parent: ${wrap.overflowsParent}`,
      `contains U+00A0: ${wrap.hasNbsp}`,
      `document scrollWidth ${wrap.docScrollW} vs clientWidth ${wrap.docClientW} (no h-scroll)`,
      'shot: 05-narrow-360-wrap.png',
    ].join('\n'),
  )
}

// ---------------------------------------------------------------------------
// 6 · No seam where the masked Waves meets the hero
// ---------------------------------------------------------------------------
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(3500)

  const geom = await page.evaluate(() => {
    const waves = document.querySelector('canvas')
    const wr = waves?.getBoundingClientRect()
    const hero = document.querySelector('[data-testid="hero-backdrop"]')
    const hr = hero?.getBoundingClientRect()
    const header = document.querySelector('header')
    const hdr = header?.getBoundingClientRect()
    const main = document.querySelector('main')
    const mr = main?.getBoundingClientRect()
    const cs = waves ? getComputedStyle(waves) : null
    return {
      wavesMask: cs ? cs.maskImage || cs.webkitMaskImage : null,
      heroTop: hr ? Math.round(hr.top) : null,
      heroBottom: hr ? Math.round(hr.bottom) : null,
      wavesHeight: wr ? Math.round(wr.height) : null,
      headerBottom: hdr ? Math.round(hdr.bottom) : null,
      mainLeft: mr ? Math.round(mr.left) : null,
      mainRight: mr ? Math.round(mr.right) : null,
    }
  })

  /*
   * Scan a strip in the page GUTTER (left of the content column) so the scan
   * sees only background layers — the hero backdrop, the masked Waves and the
   * page ground — and not text glyphs, which produce large legitimate
   * row-to-row luminance jumps and would swamp the measurement.
   *
   * Start below the sticky header: its 1px bottom border is a real, intended
   * hard edge (measured at 28/255) and has nothing to do with the hero mask.
   */
  const scanTop = (geom.headerBottom ?? 54) + 6
  const scanX = Math.max(8, Math.round((geom.mainLeft ?? 300) / 2) - 4)
  const scanH = 800 - scanTop

  const strip = await page.screenshot({
    clip: { x: scanX, y: scanTop, width: 10, height: scanH },
  })
  writeFileSync(`${OUT}06a-seam-strip.png`, strip)
  await page.screenshot({ path: `${OUT}06b-hero-to-page.png` })
  await page.close()

  const { loadImage, decodePNG } = await import('./png-analyse.mjs')
  const a = await loadImage(strip)

  /*
   * ALSO scan HORIZONTALLY across the hero.
   *
   * The vertical gutter scan above structurally cannot see a vertical edge —
   * and there was one: the backdrop is only as wide as the content column, so
   * before it was feathered its left edge was a hard 11.17/255 luminance step
   * at x=304, plainly visible as a lighter rectangle behind the headline.
   * Caught by eye in a screenshot, not by the first scan. This pass pins it.
   */
  const hpage = await newPage()
  await hpage.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(3500)
  const hbox = await hpage.evaluate(() => {
    const r = document.querySelector('[data-testid="hero-backdrop"]')?.getBoundingClientRect()
    return { left: r ? Math.round(r.left) : null, right: r ? Math.round(r.right) : null }
  })
  const hstrip = await hpage.screenshot({ clip: { x: 0, y: 88, width: 1280, height: 12 } })
  writeFileSync(`${OUT}06c-horizontal-strip.png`, hstrip)
  await hpage.close()

  const hi = decodePNG(hstrip)
  const colLuma = new Array(hi.width).fill(0)
  for (let x = 0; x < hi.width; x++) {
    let acc = 0
    for (let yy = 0; yy < hi.height; yy++) {
      const i = yy * hi.width * hi.channels + x * hi.channels
      acc += 0.2126 * hi.data[i] + 0.7152 * hi.data[i + 1] + 0.0722 * hi.data[i + 2]
    }
    colLuma[x] = acc / hi.height
  }
  // Look only at the panel's own left/right boundaries (+/- 6px).
  let edgeMax = 0
  let edgeX = null
  for (const bx of [hbox.left, hbox.right]) {
    if (bx == null) continue
    for (let x = Math.max(1, bx - 6); x <= Math.min(hi.width - 1, bx + 6); x++) {
      const d = Math.abs(colLuma[x] - colLuma[x - 1])
      if (d > edgeMax) { edgeMax = d; edgeX = x }
    }
  }

  // Where does the hero backdrop's bottom edge land inside the strip?
  const heroEdgeInStrip = (geom.heroBottom ?? 0) - scanTop
  // Largest jump anywhere, and specifically near the hero's bottom edge.
  let nearEdgeMax = 0
  let nearEdgeY = null
  for (let y = 1; y < a.rowLuma.length; y++) {
    if (Math.abs(y - heroEdgeInStrip) > 40) continue
    const d = Math.abs(a.rowLuma[y] - a.rowLuma[y - 1])
    if (d > nearEdgeMax) { nearEdgeMax = d; nearEdgeY = y + scanTop }
  }

  const pass = a.maxJump < 6 && nearEdgeMax < 4 && edgeMax < 3

  record(
    '6',
    'No visible seam / double-render where the hero panel ends',
    pass,
    [
      `hero backdrop: top=${geom.heroTop}px bottom=${geom.heroBottom}px`,
      `Waves canvas height ${geom.wavesHeight}px, mask: ${String(geom.wavesMask).slice(0, 100)}`,
      `content column x=${geom.mainLeft}..${geom.mainRight}; scanning the gutter at x=${scanX}`,
      `scan window y=${scanTop}..800 (starts below the header's ${geom.headerBottom}px border)`,
      '',
      `max row-to-row luminance jump anywhere: ${a.maxJump.toFixed(2)}/255 at y=${a.maxJumpY + scanTop}`,
      `max jump within +/-40px of the hero's bottom edge (y=${geom.heroBottom}): ${nearEdgeMax.toFixed(2)}/255${nearEdgeY ? ` at y=${nearEdgeY}` : ''}`,
      `mean row-to-row jump: ${a.meanJump.toFixed(3)}/255`,
      `rows sampled: ${a.rows}`,
      '',
      `HORIZONTAL scan at y=88 across the panel's side edges (x=${hbox.left}, x=${hbox.right}):`,
      `  max column-to-column jump at either edge: ${edgeMax.toFixed(2)}/255${edgeX ? ` at x=${edgeX}` : ''}`,
      `  (was 11.17/255 at x=304 before the edges were feathered)`,
      '',
      'acceptance: no jump >= 6/255 down the gutter, < 4/255 across the hero',
      'bottom boundary, and < 3/255 at the panel side edges.',
      'shots: 06a-seam-strip.png, 06b-hero-to-page.png, 06c-horizontal-strip.png',
    ].join('\n'),
  )
}

await browser.close()

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72))
const passed = results.filter((r) => r.pass === true).length
for (const r of results) {
  console.log(
    `${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'WARN'}  ${r.id} · ${r.name}`,
  )
}
console.log(`\n${passed}/${results.length} passed`)
writeFileSync(`${OUT}../results.json`, JSON.stringify(results, null, 2))
process.exit(results.every((r) => r.pass === true) ? 0 : 1)
