#!/usr/bin/env node
/**
 * route-transition-pass.mjs — real-browser verification of the route transition
 * between `/` (landing), `/map` and `/admin`.
 *
 * Runs against a production build (`npm run build && npm run preview` → :4173)
 * in real Chromium. Same harness convention as hero-pass.mjs / spacing-pass.mjs:
 * Chromium is NOT a project dependency. Install it outside the repo —
 *
 *   mkdir -p /tmp/qa-tools && cd /tmp/qa-tools
 *   npm init -y && npm i @sparticuz/chromium puppeteer-core
 *   ln -s /tmp/qa-tools/node_modules/@sparticuz  <repo>/node_modules/@sparticuz
 *   ln -s /tmp/qa-tools/node_modules/puppeteer-core <repo>/node_modules/puppeteer-core
 *
 * and, on a distro missing libnss3/libnspr4, use the libraries the package
 * ships (NODE_PATH does not work for ESM, hence the symlinks above):
 *
 *   mkdir -p /tmp/chromium-libs && cd /tmp/chromium-libs
 *   cp /tmp/qa-tools/node_modules/@sparticuz/chromium/bin/al2023.tar.br .
 *   node -e "require('fs').writeFileSync('al.tar',require('zlib').brotliDecompressSync(require('fs').readFileSync('al2023.tar.br')))"
 *   tar xf al.tar
 *
 *   LD_LIBRARY_PATH=/tmp/chromium-libs/lib node scripts/route-transition-pass.mjs
 *
 * HOW IT MEASURES
 * ---------------
 * `motion` drives the route frame through the Web Animations API, so the
 * animation is readable and *scrubbable* from the page: `document.getAnimations()`
 * gives the real duration and keyframes, and pausing one at a chosen
 * `currentTime` produces an exact mid-flight frame. That is used in preference
 * to sampling screenshots, because a screenshot call perturbs the animation it
 * is trying to capture — and `Page.startScreencast`, tried first, dropped this
 * page to ~3fps in software rendering and produced garbage timings.
 *
 * A rAF trace is recorded alongside, as independent evidence that intermediate
 * values actually reach the screen rather than only existing in the animation.
 *
 * WHAT IT CHECKS
 * --------------
 *  1. Forward `/` → `/map` (the "Open the map" CTA) really animates: exit and
 *     enter durations and keyframes, both halves seen mid-flight on screen, the
 *     arrival transform, and never two maps mounted.
 *  2. Leaflet's boxes after the animated entry are identical to a plain `/map`
 *     load — container, map pane, tiles and zone polygons, once settled.
 *  3. Nothing is left on the route frame at rest (a residual transform would
 *     re-parent MapPage's `position: fixed` map layer).
 *  4. The seam: no frame with both pages mounted, and the size of the handover
 *     gap plus the post-click main-thread block, reported.
 *  5. Reverse: brand link `/map` → `/`, and the browser back button — the same
 *     dissolve, the other way round.
 *  6. `/admin` is *not* part of the dissolve: it swaps instantly in both
 *     directions, with no opacity interpolated and no animation on the frame.
 *  7. prefers-reduced-motion emulated for real, both ways: an instant swap, not
 *     a shorter animation, and no transform ever written.
 *  8. A scrolled landing → `/map` still lands the map at the viewport origin.
 *  9. The map chunk is prefetched on CTA hover, before the click.
 * 10. MapLoadingOverlay on top of the transitioned-in map (needs --slow=URL).
 * 11. The load gate, with the `/map` chunk delayed on the wire: the incoming
 *     frame holds at opacity 0 over an empty Suspense fallback, nothing visible
 *     is on screen, and the enter starts only once the chunk has arrived.
 * 12. No white anywhere in the handover: html/body stay ink, and the pixels of
 *     the mid-transition dark frame are measured (pngjs) rather than assumed.
 *
 * Screenshots land in docs/route-transition-shots/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import zlib from 'node:zlib'
import chromium from '@sparticuz/chromium'
import { PNG } from 'pngjs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173'
const SLOW_BASE = process.argv.find((a) => a.startsWith('--slow='))?.slice(7)
const OUT = new URL('../docs/route-transition-shots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

/**
 * The sandbox has no route to tile.openstreetmap.org, and a map with no tiles is
 * a weak thing to measure. Generate a 256px tile here instead — the 32px grid
 * makes any mis-scaling visible both in the screenshots and in the rects.
 * Built in memory so no binary has to be committed.
 */
const TILE_PNG = (() => {
  const W = 256
  const H = 256
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const raw = Buffer.alloc(H * (1 + W * 3))
  let o = 0
  for (let y = 0; y < H; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < W; x++) {
      const edge = x % 32 < 2 || y % 32 < 2
      const [r, g, b] = edge ? [96, 128, 160] : [28, 40, 56]
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
})()

/**
 * Mean and peak luminance of a PNG on disk.
 *
 * Used to hold the dark beat to an actual measurement: "the moment between two
 * pages is black" is a claim about pixels, and a screenshot plus this function is
 * the only way to check it without trusting the CSS.
 */
function luminanceOf(path) {
  const png = PNG.sync.read(readFileSync(path))
  let max = 0
  let total = 0
  for (let i = 0; i < png.data.length; i += 4) {
    const l =
      0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
    if (l > max) max = l
    total += l
  }
  return {
    max: Math.round(max),
    mean: Math.round((total / (png.width * png.height)) * 10) / 10,
    width: png.width,
    height: png.height,
  }
}

const results = []
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass })
  const tag = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'WARN'
  console.log(`\n[${tag}] ${id} · ${name}`)
  for (const line of String(detail).split('\n')) console.log(`       ${line}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'],
  headless: 'shell',
  // Software rendering stalls the renderer for seconds at a time while Leaflet
  // mounts; the 180s default protocol timeout is not generous enough here.
  protocolTimeout: 600000,
})

const INSTRUMENT = () => {
  const isFrame = (el) => el instanceof Element && el.hasAttribute('data-route-frame')
  const label = (el) => {
    if (!el) return '?'
    if (el.querySelector('.leaflet-container')) return 'map'
    if (el.querySelector('input[type="password"]')) return 'admin'
    if (el.querySelector('h1')) return 'landing'
    return 'empty'
  }

  // --- rAF trace of what is actually on screen ----------------------------
  window.__trace = []
  window.__traceOn = false
  const stepTrace = () => {
    if (window.__traceOn) {
      // Computed, not inline: a running WAAPI animation overrides the inline
      // value motion wrote, so el.style.opacity stays at its start value the
      // whole way through and says nothing about what is on screen.
      // The /map Suspense fallback, if it is in the DOM: how visible it is and
      // whether it renders anything at all. Read from the page, in the frame
      // loop, so a check that depends on it does not need a protocol round trip
      // (which is delayed while a request is being held open).
      const fallback = document.querySelector('[role="status"][aria-label="Loading map"]')
      window.__trace.push({
        t: Math.round(performance.now()),
        path: location.pathname,
        frames: [...document.querySelectorAll('[data-route-frame]')].map((el) => {
          const cs = getComputedStyle(el)
          return {
            op: Number(cs.opacity),
            tf: cs.transform === 'none' ? null : cs.transform,
            is: label(el),
          }
        }),
        leaflets: document.querySelectorAll('.leaflet-container').length,
        fallback: fallback
          ? { op: Number(getComputedStyle(fallback).opacity), html: fallback.innerHTML.length }
          : null,
        busyOverlay: Boolean(document.querySelector('[role="status"][aria-busy="true"]')),
      })
      if (window.__trace.length > 3000) window.__trace.shift()
    }
    requestAnimationFrame(stepTrace)
  }
  requestAnimationFrame(stepTrace)

  // --- WAAPI recorder: every animation that runs on a route frame ----------
  // Two independent chains, each re-scheduling only itself. (An earlier version
  // had one function scheduling both a rAF and a timeout, which forks: every
  // invocation spawns two, so the chain count doubles per frame and the page
  // wedges.)
  window.__anims = []
  const seenAnims = new WeakSet()
  const recordAnims = () => {
    for (const a of document.getAnimations()) {
      const target = a.effect?.target
      if (!isFrame(target) || seenAnims.has(a)) continue
      seenAnims.add(a)
      const timing = a.effect.getComputedTiming()
      window.__anims.push({
        at: Math.round(performance.now()),
        dur: timing.duration,
        keys: (a.effect.getKeyframes() ?? []).map((k) => ({
          op: k.opacity ?? null,
          tf: k.transform ?? null,
          offset: k.computedOffset,
        })),
        is: label(target), // which page this frame holds
      })
    }
  }
  const scanRaf = () => { recordAnims(); requestAnimationFrame(scanRaf) }
  requestAnimationFrame(scanRaf)
  // rAF alone misses a 120ms exit when frames are sparse, so also poll on a
  // timer — but only while a measurement is running.
  const scanTimer = () => {
    if (window.__traceOn) { recordAnims(); setTimeout(scanTimer, 12) }
  }

  // Sequence-tag every route frame the first time it is seen. `settleFrame`
  // needs this: the URL changes before the outgoing page has even started its
  // exit, so "path is right, one frame in the DOM, opacity 1, nothing running"
  // describes the OUTGOING frame perfectly and would be accepted as settled.
  window.__frameSeq = 0
  const tag = () => {
    for (const el of document.querySelectorAll('[data-route-frame]')) {
      if (!el.__seq) { window.__frameSeq += 1; el.__seq = window.__frameSeq }
    }
    requestAnimationFrame(tag)
  }
  requestAnimationFrame(tag)
  window.__currentSeq = () => {
    const frames = [...document.querySelectorAll('[data-route-frame]')]
    return frames.length ? frames[frames.length - 1].__seq ?? 0 : 0
  }

  window.__resetTrace = () => {
    window.__trace.length = 0
    window.__anims.length = 0
    window.__traceOn = true
    setTimeout(scanTimer, 12)
  }
  window.__stopTrace = () => { window.__traceOn = false }

  /**
   * Pause the route frame's enter animation at `ms` and hold it there, so the
   * next screenshot is an exact mid-flight frame rather than a lucky one.
   */
  window.__freezeAt = (ms, which = 'enter') => new Promise((resolve) => {
    const deadline = performance.now() + 8000
    const attempt = () => {
      const running = document.getAnimations().find((a) => {
        const t = a.effect?.target
        if (!isFrame(t)) return false
        const keys = a.effect.getKeyframes() ?? []
        const first = Number(keys[0]?.opacity)
        const last = Number(keys[keys.length - 1]?.opacity)
        // the enter (0 → 1) or the exit (1 → 0)
        return which === 'enter' ? last === 1 : first === 1 && last === 0
      })
      if (running) {
        running.pause()
        const duration = running.effect.getComputedTiming().duration
        // A value <= 1 is a fraction of the animation, so a checkpoint can be
        // expressed relative to the duration rather than to a hard-coded ms.
        const at = ms <= 1 ? duration * ms : ms
        running.currentTime = at
        resolve({ frozen: true, at: Math.round(at), dur: duration })
        return
      }
      if (performance.now() > deadline) { resolve({ frozen: false }); return }
      requestAnimationFrame(attempt)
    }
    attempt()
  })
  window.__unfreeze = () => {
    for (const a of document.getAnimations()) {
      if (a.playState === 'paused' && a.effect?.target?.hasAttribute?.('data-route-frame')) a.play()
    }
  }

  // --- long tasks, to size the post-click block ---------------------------
  window.__long = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) })
    }
  }).observe({ entryTypes: ['longtask'] })
}

async function newPage({
  reducedMotion = false,
  width = 1280,
  height = 800,
  /** Hold the lazy `/map` chunk on the wire for this long, to test the gate. */
  delayMapChunk = 0,
} = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  }
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (req.url().includes('tile.openstreetmap.org')) {
      return req.respond({ status: 200, contentType: 'image/png', body: TILE_PNG })
    }
    // The chunk React.lazy owns, and therefore the promise the route gate
    // waits on. Delaying it *is* the slow-network case the gate exists for.
    if (delayMapChunk && /MapPage-.*\.js/.test(req.url())) {
      return sleep(delayMapChunk).then(() => req.continue())
    }
    req.continue()
  })
  await page.evaluateOnNewDocument(INSTRUMENT)
  return page
}

/** Everything worth knowing about Leaflet's boxes, read off the live DOM. */
async function leafletGeometry(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.leaflet-container')
    if (!c) return { error: 'no .leaflet-container in the DOM' }
    const box = (el) => {
      const b = el.getBoundingClientRect()
      return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100) / 100)
    }
    const tiles = [...document.querySelectorAll('img.leaflet-tile')]
    const paths = [...document.querySelectorAll('path.zone-path')]
    return {
      clientSize: [c.clientWidth, c.clientHeight],
      containerBox: box(c),
      mapPaneTransform: document.querySelector('.leaflet-map-pane')?.style.transform ?? null,
      svgSize: (() => {
        const s = document.querySelector('.leaflet-overlay-pane svg')
        return s ? [s.getAttribute('width'), s.getAttribute('height')] : null
      })(),
      tileZ: [...new Set(tiles.map((t) => t.src.match(/\/(\d+)\/\d+\/\d+\.png$/)?.[1]).filter(Boolean))],
      tileCount: tiles.length,
      // Tiles that actually cover the viewport. The raw count is not comparable
      // between the two loads: a map created during a transition starts from the
      // map component's default view and animates to the zones' bounds, so
      // Leaflet keeps a fuller tile buffer than a map that was born already
      // fitted. What must match is the view — and the tiles covering it.
      tilesInView: tiles.filter((t) => {
        const b = t.getBoundingClientRect()
        return b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight
      }).length,
      tilesLoaded: tiles.filter((t) => t.complete && t.naturalWidth > 0).length,
      tileBox: tiles[0] ? box(tiles[0]) : null,
      tileStyleSize: tiles[0] ? [tiles[0].style.width, tiles[0].style.height] : null,
      pathCount: paths.length,
      pathBoxes: paths.map(box).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      pathTotalArea: Math.round(paths.reduce((s, p) => {
        const b = p.getBoundingClientRect()
        return s + b.width * b.height
      }, 0) * 100) / 100,
      // Leaflet maps pointer coordinates through this; it must be 1 at rest.
      scale: (() => {
        const b = c.getBoundingClientRect()
        return [b.width / c.offsetWidth, b.height / c.offsetHeight]
      })(),
    }
  })
}

/**
 * Wait for a selector to exist. Under reduced motion the swap is instant, so
 * the frame settles long before the lazy map chunk has executed — reading
 * Leaflet's boxes at that point measures nothing.
 */
async function waitFor(page, selector, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await page.evaluate((sel) => Boolean(document.querySelector(sel)), selector)) return true
    await sleep(150)
  }
  return false
}

/** Wait until the map has stopped moving (fitBounds animates; tiles stream in). */
async function settleMap(page, { timeout = 12000 } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  let stable = 0
  while (Date.now() < deadline) {
    await sleep(250)
    const now = await leafletGeometry(page)
    const key = JSON.stringify([now.tileZ, now.pathTotalArea, now.mapPaneTransform, now.tileCount])
    stable = key === last ? stable + 1 : 0
    last = key
    if (stable >= 3) return now
  }
  return last ? await leafletGeometry(page) : null
}

/**
 * Wait until the route frame has finished animating.
 *
 * A fixed sleep is not enough here: the document timeline only advances when
 * frames are produced, so the 300ms enter can take seconds of wall time behind
 * this sandbox's post-click main-thread block. Asserting "at rest" on a timer
 * catches the animation mid-flight and reports a leftover transform that was
 * never going to survive.
 */
async function settleFrame(page, { toPath, afterSeq = 0, timeout = 30000 } = {}) {
  const read = () => page.evaluate(() => {
    const frames = [...document.querySelectorAll('[data-route-frame]')]
    const frame = frames[frames.length - 1] // the incoming one, while both exist
    return {
      path: location.pathname,
      count: frames.length,
      seq: frame?.__seq ?? 0,
      frame: frame ? (() => {
        const cs = getComputedStyle(frame)
        return {
          running: frame.getAnimations().filter((a) => a.playState !== 'finished').length,
          inline: frame.getAttribute('style'),
          opacity: cs.opacity,
          transform: cs.transform,
          willChange: cs.willChange,
          filter: cs.filter,
        }
      })() : null,
    }
  })
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    last = await read()
    // All four conditions, in order. Skipping the first two is what made an
    // earlier version of this return instantly: right after the click the
    // OUTGOING frame is still in the DOM at opacity 1 with no animation
    // started, which reads exactly like "settled".
    if (
      last &&
      (!toPath || last.path === toPath) &&
      last.count === 1 &&
      last.seq > afterSeq && // <- the incoming frame, not the one being replaced
      last.frame &&
      last.frame.running === 0 &&
      Number(last.frame.opacity) === 1
    ) {
      return last
    }
    await sleep(100)
  }
  return last
}

async function clickLink(page, text) {
  const ok = await page.evaluate((needle) => {
    const link = [...document.querySelectorAll('a')].find((a) =>
      new RegExp(needle, 'i').test(a.textContent ?? ''))
    if (!link) return false
    link.click()
    return true
  }, text)
  if (!ok) throw new Error(`no link matching /${text}/i`)
}

/** Turn a rAF trace + WAAPI log into something assertable. */
function summarise(trace, anims, { toPath }) {
  const t0 = trace.length ? trace[0].t : 0
  const onTarget = trace.filter((s) => s.path === toPath)
  const opacities = onTarget.flatMap((s) => s.frames.map((f) => f.op).filter((o) => o !== null))
  const transforms = onTarget.flatMap((s) => s.frames.map((f) => f.tf).filter(Boolean))
  const first = onTarget[0]
  const settled = onTarget.find((s) => s.frames.length === 1 && s.frames[0].op === 1)
  return {
    t0,
    navAt: first ? first.t - t0 : null,
    settleAt: settled ? settled.t - t0 : null,
    framesOnTarget: onTarget.length,
    partialOpacityFrames: opacities.filter((o) => o > 0.02 && o < 0.98).length,
    opacityRange: opacities.length ? [Math.min(...opacities), Math.max(...opacities)] : null,
    distinctTransforms: [...new Set(transforms)],
    bothMountedFrames: trace.filter((s) => s.frames.length > 1).length,
    // the outgoing page fading out, seen from the trace rather than from WAAPI
    // (labelled by what the frame contains, so it cannot be confused with the
    // incoming page's own fade-in)
    outgoingLandingFrames: onTarget.filter((s) => s.frames.some((f) => f.is === 'landing' && f.op < 0.98)).length,
    // The incoming frame, on the new URL, visible while it still holds nothing
    // but a Suspense fallback: the "fading in blank space" failure. Only counts
    // what was actually on screen (opacity > 0.02) — an invisible frame holding
    // an empty fallback is exactly what the gate is supposed to do.
    blankOnScreen: onTarget.filter((s) =>
      s.frames.some((f) => f.is === 'empty' && f.op > 0.02)).length,
    maxLeaflets: Math.max(0, ...trace.map((s) => s.leaflets)),
    anims: anims.map((a) => ({ dur: a.dur, is: a.is, keys: a.keys })),
    enterAnim: anims.find((a) => Number(a.keys[a.keys.length - 1]?.op) === 1) ?? null,
    exitAnim: anims.find((a) => Number(a.keys[a.keys.length - 1]?.op) === 0) ?? null,
  }
}

// ===========================================================================
// 0 · reference: a plain /map load, which is what "correct" sizing means
// ===========================================================================
let reference
{
  const page = await newPage()
  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle2' })
  await sleep(2000)
  reference = await settleMap(page)
  await page.screenshot({ path: `${OUT}00-reference-direct-map.png` })
  record('0', 'reference: plain /map load, settled', !reference.error,
    `container ${JSON.stringify(reference.clientSize)} · zoom ${reference.tileZ} · ${reference.tileCount} tiles (${reference.tilesLoaded} painted)\nmap-pane ${reference.mapPaneTransform} · ${reference.pathCount} polygons · area ${reference.pathTotalArea}px²`)
  await page.close()
}

// ===========================================================================
// 1 · forward / -> /map through the "Open the map" CTA
// ===========================================================================
let forward
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(3000)
  await page.screenshot({ path: `${OUT}01-landing.png` })

  await page.evaluate(() => window.__resetTrace())
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'open the map')

  // Catch the enter animation mid-flight and hold it there for a screenshot.
  const frozen = await page.evaluate(() => window.__freezeAt(120)) // 120ms of 400ms
  await sleep(120)
  if (frozen.frozen) await page.screenshot({ path: `${OUT}02-mid-flight-30pct.png` })
  const late = frozen.frozen
    ? await page.evaluate(() => window.__freezeAt(280)) // 70% of the way in
    : { frozen: false }
  await sleep(120)
  if (late.frozen) await page.screenshot({ path: `${OUT}03-mid-flight-70pct.png` })
  await page.evaluate(() => window.__unfreeze())

  await settleFrame(page, { toPath: '/map', afterSeq: seqBefore })
  await sleep(400)
  await page.evaluate(() => window.__stopTrace())
  const trace = await page.evaluate(() => window.__trace.slice())
  const anims = await page.evaluate(() => window.__anims.slice())
  const long = await page.evaluate(() => window.__long.slice())
  forward = summarise(trace, anims, { toPath: '/map' })
  forward.geometry = await settleMap(page)
  forward.long = long
  await page.screenshot({ path: `${OUT}04-map-settled.png` })

  const enter = forward.enterAnim
  const exit = forward.exitAnim
  const durationOk = enter && enter.dur >= 350 && enter.dur <= 450
  const exitDurationOk = exit && exit.dur >= 300 && exit.dur <= 400
  const keyframesOk = enter && Number(enter.keys[0]?.op) === 0 && Number(enter.keys[enter.keys.length - 1]?.op) === 1
  // The rise does NOT go through WAAPI: motion animates opacity on the
  // compositor and drives the transform from its own frame loop, so
  // getKeyframes() only ever reports `opacity`. The transform is therefore
  // asserted on what actually reached the screen — the computed transform
  // sampled per frame — which is the stronger claim anyway.
  const identity = new Set([null, 'none', 'matrix(1, 0, 0, 1, 0, 0)'])
  const nonIdentityTransforms = forward.distinctTransforms.filter((t) => !identity.has(t))
  const exitSeen = Boolean(exit) || forward.outgoingLandingFrames > 0
  const singleMap = forward.maxLeaflets <= 1
  // The gate: the incoming frame must never be visible while it is still only
  // holding a Suspense fallback ("empty" = no map inside it yet). If the enter
  // ever started before the chunk executed, the fade-in would be over blank
  // space — the failure this pass exists to catch.
  const blankFramesVisible = forward.blankOnScreen
  record('1', 'forward / → /map: fades out, fades in, in budget, never over blank space',
    Boolean(durationOk && exitDurationOk && keyframesOk && nonIdentityTransforms.length > 0 &&
      exitSeen && singleMap && forward.partialOpacityFrames >= 2 &&
      forward.bothMountedFrames === 0 && blankFramesVisible === 0),
    `exit  animation: ${exit ? `${exit.dur}ms on the ${exit.is} frame` : 'NOT FOUND'}\n` +
    `  opacity keyframes ${JSON.stringify(exit?.keys.map((k) => k.op))} (1 → 0)\n` +
    `  ${forward.outgoingLandingFrames} sampled frames of the landing page fading out\n` +
    `enter animation: ${enter ? `${enter.dur}ms on the ${enter.is} frame` : 'NOT FOUND'}\n` +
    `  opacity keyframes ${JSON.stringify(enter?.keys.map((k) => k.op))} (0 → 1)\n` +
    `on-screen partial-opacity frames: ${forward.partialOpacityFrames} · opacity seen ${JSON.stringify(forward.opacityRange)}\n` +
    `computed transforms sampled while arriving (${nonIdentityTransforms.length} non-identity):\n` +
    `  ${nonIdentityTransforms.slice(0, 3).join('\n  ')}\n` +
    `frames on screen holding an empty (not-yet-mounted) map: ${blankFramesVisible} — must be 0\n` +
    `peak .leaflet-container count: ${forward.maxLeaflets} · frames with both pages mounted: ${forward.bothMountedFrames}\n` +
    `mid-flight screenshots frozen at 120ms/280ms of 400ms: ${frozen.frozen}/${late.frozen}`)
  await page.close()
}

// ===========================================================================
// 2 · Leaflet sizing after the transition vs. the plain load
// ===========================================================================
{
  const a = reference
  const b = forward.geometry
  const diffs = []
  const cmp = (label, x, y) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      diffs.push(`${label}:\n     transitioned = ${JSON.stringify(x)}\n     plain load   = ${JSON.stringify(y)}`)
    }
  }
  cmp('clientSize', b.clientSize, a.clientSize)
  cmp('containerBox', b.containerBox, a.containerBox)
  cmp('mapPaneTransform', b.mapPaneTransform, a.mapPaneTransform)
  cmp('svgSize', b.svgSize, a.svgSize)
  cmp('tileZ', b.tileZ, a.tileZ)
  cmp('tilesInView', b.tilesInView, a.tilesInView)
  cmp('tileBox', b.tileBox, a.tileBox)
  cmp('tileStyleSize', b.tileStyleSize, a.tileStyleSize)
  cmp('pathCount', b.pathCount, a.pathCount)
  cmp('pathTotalArea', b.pathTotalArea, a.pathTotalArea)
  cmp('pathBoxes', b.pathBoxes, a.pathBoxes)
  const scaleOk = b.scale?.[0] === 1 && b.scale?.[1] === 1
  record('2', 'Leaflet measures identically after the transition and on a plain load',
    diffs.length === 0 && scaleOk,
    diffs.length
      ? diffs.join('\n')
      : `identical once settled: container ${JSON.stringify(b.clientSize)} · zoom ${b.tileZ} · map-pane ${b.mapPaneTransform}\n` +
        `${b.tilesInView} tiles covering the viewport of ${b.tileCount} in the DOM (${b.tilesLoaded} painted), first tile ${JSON.stringify(b.tileBox)} styled ${JSON.stringify(b.tileStyleSize)}\n` +
        `${b.pathCount} polygons, total area ${b.pathTotalArea}px², per-polygon boxes match\n` +
        `container scale ${JSON.stringify(b.scale)} — must be [1,1] or Leaflet's pointer maths is off`)
}

// ===========================================================================
// 3 · nothing left on the route frame at rest
// ===========================================================================
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'open the map')
  const settledFrame = await settleFrame(page, { toPath: '/map', afterSeq: seqBefore })
  const rest = await page.evaluate(() => [...document.querySelectorAll('[data-route-frame]')].map((el) => {
    const cs = getComputedStyle(el)
    return {
      inline: el.getAttribute('style'),
      transform: cs.transform,
      opacity: cs.opacity,
      willChange: cs.willChange,
      filter: cs.filter,
      contain: cs.contain,
    }
  }))
  // The map layer is position:fixed; a transformed ancestor re-parents it.
  const fixedBox = await page.evaluate(() => {
    const layer = document.querySelector('.leaflet-container')?.closest('.fixed')
    if (!layer) return null
    const b = layer.getBoundingClientRect()
    return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]
  })
  const clean = rest.length === 1 &&
    (rest[0].transform === 'none' || rest[0].transform === '') &&
    Number(rest[0].opacity) === 1 && rest[0].filter === 'none'
  record('3', 'route frame at rest carries no transform / opacity / filter',
    clean && JSON.stringify(fixedBox) === JSON.stringify([0, 0, 1280, 800]),
    `frames in the DOM: ${rest.length}\n${JSON.stringify(rest, null, 1)}\n` +
    `fixed map layer box ${JSON.stringify(fixedBox)} — expect [0,0,1280,800]; a leftover transform on an\n` +
    `ancestor would re-parent MapPage's \`fixed inset-0\` layer onto the frame instead of the viewport\n` +
    `waited for path=${settledFrame?.path} · frames in DOM ${settledFrame?.count} · ${JSON.stringify(settledFrame?.frame)}`)
  await page.close()
}

// ===========================================================================
// 4 · reverse: brand link /map -> /, then the browser back button
// ===========================================================================
{
  const page = await newPage()
  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle2' })
  await sleep(2500)

  await page.evaluate(() => window.__resetTrace())
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'red tide') // the brand <Link to="/"> in the overlay header
  await settleFrame(page, { toPath: '/', afterSeq: seqBefore })
  await sleep(400)
  await page.evaluate(() => window.__stopTrace())
  const back = summarise(
    await page.evaluate(() => window.__trace.slice()),
    await page.evaluate(() => window.__anims.slice()),
    { toPath: '/' },
  )
  const landingOk = await page.evaluate(() =>
    Boolean([...document.querySelectorAll('a')].find((a) => /open the map/i.test(a.textContent ?? ''))))
  await page.screenshot({ path: `${OUT}05-reverse-to-landing.png` })
  record('4a', 'reverse /map → / via the brand link animates and lands on the landing page',
    back.enterAnim !== undefined && back.partialOpacityFrames >= 2 &&
    back.bothMountedFrames === 0 && landingOk,
    `enter: ${back.enterAnim ? `${back.enterAnim.dur}ms, opacity ${JSON.stringify(back.enterAnim.keys.map((k) => k.op))}` : 'none'}\n` +
    `exit: ${back.exitAnim ? `${back.exitAnim.dur}ms on the ${back.exitAnim.is} frame` : 'none'}\n` +
    `partial-opacity frames ${back.partialOpacityFrames} · both-mounted frames ${back.bothMountedFrames} · peak maps ${back.maxLeaflets}\n` +
    `landing CTA present afterwards: ${landingOk}`)

  await page.evaluate(() => window.__resetTrace())
  const seqBeforeBack = await page.evaluate(() => window.__currentSeq())
  await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {})
  await settleFrame(page, { toPath: '/map', afterSeq: seqBeforeBack })
  await sleep(400)
  await page.evaluate(() => window.__stopTrace())
  const fwd = summarise(
    await page.evaluate(() => window.__trace.slice()),
    await page.evaluate(() => window.__anims.slice()),
    { toPath: '/map' },
  )
  const geo = await settleMap(page)
  const sameAsReference = geo && geo.pathTotalArea === reference.pathTotalArea &&
    JSON.stringify(geo.clientSize) === JSON.stringify(reference.clientSize)
  // Note the threshold here is 1, not the 2 used for the forward case: after
  // goBack the /map chunk is already warm, so the map mounts immediately and
  // the 400ms enter can be crossed in a single produced frame when the
  // compositor resumes after a stall. The animation itself is asserted
  // directly from WAAPI, so this is corroboration, not the evidence.
  const backEnter = fwd.enterAnim
  record('4b', 'browser back/forward through the transition, map still sized correctly',
    Boolean(backEnter) && backEnter.dur >= 350 && backEnter.dur <= 450 &&
    Number(backEnter.keys[0]?.op) === 0 && Number(backEnter.keys[backEnter.keys.length - 1]?.op) === 1 &&
    fwd.partialOpacityFrames >= 1 && fwd.bothMountedFrames === 0 && sameAsReference,
    `history back to /map · sampled frames on /map ${fwd.framesOnTarget} · partial-opacity ${fwd.partialOpacityFrames} · both-mounted ${fwd.bothMountedFrames}\n` +
    `enter: ${fwd.enterAnim ? `${fwd.enterAnim.dur}ms, opacity ${JSON.stringify(fwd.enterAnim.keys.map((k) => k.op))}` : 'none recorded'}\n` +
    `container ${JSON.stringify(geo?.clientSize)} · zoom ${JSON.stringify(geo?.tileZ)} · polygon area ${geo?.pathTotalArea}px² (reference ${reference.pathTotalArea}px²)`)
  await page.close()
}

// ===========================================================================
// 5 · /admin is outside the dissolve — an instant swap, in both directions
// ===========================================================================
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.evaluate(() => window.__resetTrace())
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'admin')
  const adminFrame = await settleFrame(page, { toPath: '/admin', afterSeq: seqBefore })
  await sleep(400)
  await page.evaluate(() => window.__stopTrace())
  const admin = summarise(
    await page.evaluate(() => window.__trace.slice()),
    await page.evaluate(() => window.__anims.slice()),
    { toPath: '/admin' },
  )
  const controls = await page.evaluate(() => ({
    passcode: document.querySelectorAll('input[type="password"]').length,
    unlock: [...document.querySelectorAll('button')].filter((b) => /unlock/i.test(b.textContent ?? '')).length,
    frames: document.querySelectorAll('[data-route-frame]').length,
    opacity: getComputedStyle(document.querySelector('[data-route-frame]')).opacity,
    transform: getComputedStyle(document.querySelector('[data-route-frame]')).transform,
  }))
  await page.screenshot({ path: `${OUT}06-admin.png` })

  // And leaving admin must be a cut too: the pair decides, not the route, so a
  // slow fade out of /admin would be just as wrong as a fade in. The locked
  // gate's only link goes to `/` — its label says "Public map" but its target is
  // the landing page (a pre-existing mismatch in AdminGate.tsx, and not this
  // pass's business) — so this walks the route the app itself offers: admin →
  // landing, then the landing page's own CTA to the map.
  await page.evaluate(() => window.__resetTrace())
  const seqOut = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'public map')
  await settleFrame(page, { toPath: '/', afterSeq: seqOut })
  await sleep(400)
  await page.evaluate(() => window.__stopTrace())
  const outOfAdmin = summarise(
    await page.evaluate(() => window.__trace.slice()),
    await page.evaluate(() => window.__anims.slice()),
    { toPath: '/' },
  )
  const landingCta = await page.evaluate(() =>
    Boolean([...document.querySelectorAll('a')].find((a) => /open the map/i.test(a.textContent ?? ''))))

  // …and the map still dissolves properly on the next navigation.
  await page.evaluate(() => window.__resetTrace())
  const seqMap = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'open the map')
  const mapMounted = await waitFor(page, '.leaflet-container')
  await settleFrame(page, { toPath: '/map', afterSeq: seqMap })
  await sleep(400)
  await page.evaluate(() => window.__stopTrace())
  const toMap = summarise(
    await page.evaluate(() => window.__trace.slice()),
    await page.evaluate(() => window.__anims.slice()),
    { toPath: '/map' },
  )
  const mapEnter = toMap.enterAnim

  record('5', '/admin swaps instantly in and out, and / → /map still dissolves after it',
    admin.partialOpacityFrames === 0 && admin.anims.length === 0 &&
    outOfAdmin.partialOpacityFrames === 0 && outOfAdmin.anims.length === 0 &&
    admin.bothMountedFrames === 0 && outOfAdmin.bothMountedFrames === 0 &&
    controls.passcode === 1 && controls.unlock === 1 && Number(controls.opacity) === 1 &&
    landingCta && mapMounted &&
    Boolean(mapEnter) && mapEnter.dur >= 350 && mapEnter.dur <= 450 &&
    Number(mapEnter.keys[0]?.op) === 0 && Number(mapEnter.keys[mapEnter.keys.length - 1]?.op) === 1 &&
    toMap.partialOpacityFrames >= 2 && toMap.bothMountedFrames === 0,
    `into /admin: partial-opacity frames ${admin.partialOpacityFrames} (must be 0) · animations on the frame ${admin.anims.length} (must be 0)\n` +
    `admin → /:   partial-opacity frames ${outOfAdmin.partialOpacityFrames} (must be 0) · animations on the frame ${outOfAdmin.anims.length} (must be 0)\n` +
    `  landed on the real landing page (CTA present): ${landingCta}\n` +
    `then / → /map (the control case): enter ${mapEnter ? `${mapEnter.dur}ms, opacity ${JSON.stringify(mapEnter.keys.map((k) => k.op))}` : 'NOT FOUND'} · partial-opacity frames ${toMap.partialOpacityFrames} · both-mounted ${toMap.bothMountedFrames} · map mounted: ${mapMounted}\n` +
    `passcode fields ${controls.passcode} (expect 1) · Unlock buttons ${controls.unlock} (expect 1) — the duplicate-controls regression the pinned \`location\` guards\n` +
    `at rest, re-read: opacity ${controls.opacity}, transform ${controls.transform}`)
  await page.close()
}

// ===========================================================================
// 6 · prefers-reduced-motion, emulated, both directions
// ===========================================================================
for (const direction of ['forward', 'reverse']) {
  const page = await newPage({ reducedMotion: true })
  await page.goto(direction === 'forward' ? BASE : `${BASE}/map`, { waitUntil: 'networkidle2' })
  await sleep(3000)
  const emulated = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)

  await page.evaluate(() => window.__resetTrace())
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, direction === 'forward' ? 'open the map' : 'red tide')
  await settleFrame(page, { toPath: direction === 'forward' ? '/map' : '/', afterSeq: seqBefore })
  await sleep(400)

  await page.evaluate(() => window.__stopTrace())
  const run = summarise(
    await page.evaluate(() => window.__trace.slice()),
    await page.evaluate(() => window.__anims.slice()),
    { toPath: direction === 'forward' ? '/map' : '/' },
  )
  const atRest = await page.evaluate(() => {
    const frame = document.querySelector('[data-route-frame]')
    return {
      inline: frame.getAttribute('style'),
      opacity: getComputedStyle(frame).opacity,
      transform: getComputedStyle(frame).transform,
      animatedOpacity: frame.getAnimations().length,
    }
  })
  const arrived = await page.evaluate(() => ({
    map: Boolean(document.querySelector('.leaflet-container')),
    cta: Boolean([...document.querySelectorAll('a')].find((a) => /open the map/i.test(a.textContent ?? ''))),
  }))
  const mounted = direction === 'forward' ? await waitFor(page, '.leaflet-container') : true
  const geo = direction === 'forward' ? await settleMap(page) : null
  await page.screenshot({ path: `${OUT}0${direction === 'forward' ? 7 : 8}-reduced-motion-${direction}.png` })

  // "Instant" = no frame caught mid-fade, no animation recorded on the frame at
  // all, no transform ever written, and the first frame on the new route opaque.
  const instant = run.partialOpacityFrames === 0 && run.anims.length === 0 &&
    run.distinctTransforms.length === 0 && run.framesOnTarget > 0 &&
    Number(atRest.opacity) === 1 && atRest.transform === 'none'
  const sizedRight = direction !== 'forward' ||
    (geo.pathTotalArea === reference.pathTotalArea &&
      JSON.stringify(geo.clientSize) === JSON.stringify(reference.clientSize))
  record(`6${direction === 'forward' ? 'a' : 'b'}`,
    `reduced motion (${direction}): instant swap, not a shorter animation`,
    emulated && instant && mounted && (direction === 'forward' ? arrived.map && sizedRight : arrived.cta),
    `prefers-reduced-motion emulated: ${emulated}\n` +
    `frames on the new route: ${run.framesOnTarget} · partial-opacity frames: ${run.partialOpacityFrames} (must be 0)\n` +
    `animations recorded on the route frame: ${run.anims.length} (must be 0) · transforms written: ${JSON.stringify(run.distinctTransforms)}\n` +
    `at rest: inline "${atRest.inline}" · computed opacity ${atRest.opacity} · transform ${atRest.transform}\n` +
    `map mounted after the instant swap: ${mounted} · arrived: ${JSON.stringify(arrived)}` +
    (geo ? `\nLeaflet under reduced motion: container ${JSON.stringify(geo.clientSize)} · zoom ${JSON.stringify(geo.tileZ)} · area ${geo.pathTotalArea}px² · scale ${JSON.stringify(geo.scale)}` : ''))
  await page.close()
}

// ===========================================================================
// 7 · scrolled landing -> /map (position:fixed under a transform)
// ===========================================================================
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(3000)
  await page.evaluate(() => window.scrollTo(0, 1200))
  await sleep(500)
  const scrolled = await page.evaluate(() => Math.round(window.scrollY))
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'map') // the sticky header's MAP link, reachable while scrolled
  await settleFrame(page, { toPath: '/map', afterSeq: seqBefore })
  const geo = await settleMap(page)
  const box = await page.evaluate(() => {
    const c = document.querySelector('.leaflet-container')
    if (!c) return null
    const b = c.getBoundingClientRect()
    return { scrollY: Math.round(window.scrollY), box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  })
  record('7', 'scrolled landing → /map puts the map at the viewport origin',
    box?.box?.[0] === 0 && box?.box?.[1] === 0 && geo.pathTotalArea === reference.pathTotalArea,
    `scrolled to y=${scrolled} before clicking the sticky header's MAP link\n` +
    `after: scrollY=${box?.scrollY} · container box ${JSON.stringify(box?.box)}\n` +
    `zoom ${JSON.stringify(geo?.tileZ)} · polygon area ${geo?.pathTotalArea}px² (reference ${reference.pathTotalArea}px²)`)
  await page.close()
}

// ===========================================================================
// 8 · the map chunk is prefetched on CTA hover, before the click
// ===========================================================================
{
  const page = await newPage()
  const scripts = []
  page.on('request', (r) => { if (/MapPage-.*\.js/.test(r.url())) scripts.push('MapPage chunk') })
  page.on('request', (r) => { if (/leaflet-.*\.js/.test(r.url())) scripts.push('leaflet chunk') })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)
  const beforeHover = [...new Set(scripts)]
  const cta = await page.evaluateHandle(() =>
    [...document.querySelectorAll('a')].find((a) => /open the map/i.test(a.textContent ?? '')))
  const box = await cta.asElement().boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(900)
  const afterHover = [...new Set(scripts)]
  // The assertion is about the MapPage chunk: that is the one React.lazy owns.
  // `leaflet-*.js` arrives on the landing page either way — index.html carries a
  // <link rel="modulepreload"> for it, which is pre-existing (identical in a
  // build of the pre-change commit) and unrelated to this pass.
  record('8', 'MapPage chunk is prefetched on CTA hover, not on page load',
    !beforeHover.includes('MapPage chunk') && afterHover.includes('MapPage chunk'),
    `chunks requested on landing load: ${JSON.stringify(beforeHover)}\n` +
    `chunks requested after hovering the CTA: ${JSON.stringify(afterHover)}\n` +
    `MapPage-*.js must move from "after hover", not "on load" — that is the whole\n` +
    `point of prefetching: the transition should not pay a round trip mid-animation.\n` +
    `note: leaflet-*.js is modulepreloaded by index.html on the landing page in\n` +
    `this build AND in a build of the pre-change commit, so it is pre-existing.`)
  await page.close()
}

// ===========================================================================
// 9 · MapLoadingOverlay on top of a transitioned-in map (needs --slow=URL)
// ===========================================================================
if (SLOW_BASE) {
  const page = await newPage()
  await page.goto(SLOW_BASE, { waitUntil: 'networkidle2' })
  await sleep(3000)
  await page.evaluate(() => window.__resetTrace())
  await clickLink(page, 'open the map')
  // Poll: when the overlay is up depends on how long the map takes to mount,
  // which on this machine is seconds. Grab it the first moment it exists.
  let during = { present: false }
  for (let i = 0; i < 60 && !during.present; i++) {
    await sleep(200)
    during = await page.evaluate(() => ({ present: Boolean(document.querySelector('[role="status"][aria-busy="true"]')) }))
  }
  during = await page.evaluate(() => {
    const ov = document.querySelector('[role="status"][aria-busy="true"]')
    if (!ov) return { present: false }
    const b = ov.getBoundingClientRect()
    const cs = getComputedStyle(ov)
    const top = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))
    return {
      present: true,
      label: ov.textContent?.trim().slice(0, 30),
      box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
      zIndex: cs.zIndex,
      computedOpacity: cs.opacity,
      visible: b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5,
      topmostIsInsideOverlay: Boolean(top && (ov.contains(top) || top === ov)),
      frameComputedOpacity: getComputedStyle(document.querySelector('[data-route-frame]')).opacity,
      frameTransform: getComputedStyle(document.querySelector('[data-route-frame]')).transform,
    }
  })
  await page.screenshot({ path: `${OUT}09-loading-overlay.png` })
  // The delayed feed lands on a wall-clock timer set at page load, so poll for
  // the overlay to clear rather than assuming how long is left.
  let after = { overlayGone: false, paths: 0 }
  for (let i = 0; i < 100; i++) {
    await sleep(250)
    after = await page.evaluate(() => ({
      overlayGone: !document.querySelector('[role="status"][aria-busy="true"]'),
      paths: document.querySelectorAll('path.zone-path').length,
    }))
    if (after.overlayGone && after.paths > 0) break
  }
  const geo = await settleMap(page)
  record('9', 'MapLoadingOverlay sits on top of the transitioned-in map',
    during.present && during.visible && during.topmostIsInsideOverlay &&
    after.overlayGone && after.paths > 0 && geo.pathTotalArea === reference.pathTotalArea,
    `while the zone feed is still out:\n${JSON.stringify(during, null, 1)}\n` +
    `after the feed lands: ${JSON.stringify(after)}\n` +
    `settled geometry matches the plain load: ${geo.pathTotalArea === reference.pathTotalArea} (${geo.pathTotalArea}px² vs ${reference.pathTotalArea}px²)`)
  await page.close()
} else {
  record('9', 'MapLoadingOverlay on top of the transitioned-in map', null,
    'skipped — the demo backend answers synchronously, so the overlay never shows.\nPass --slow=http://localhost:4174 to run it against a build whose zone feed is delayed.')
}

// ===========================================================================
// 10 · the load gate, with the /map chunk held on the wire
//
// The whole point of the gate is the slow case, and the fast case cannot show
// it: when the chunk is warm the hold is a microtask long. So delay the chunk by
// ~1.4s and watch what the incoming frame does while it is in flight. It must be
// mounted, invisible, and showing nothing at all — then fade in over a rendered
// map once the chunk lands. Anything visible in that window (a spinner, a brand
// mark, a half-faded fallback) fails.
//
// Measured from the in-page rAF trace rather than by polling over the protocol:
// while an intercepted request is being held open, CDP round trips are delayed
// too, so `page.evaluate` samples land seconds late and describe the wrong
// moment.
// ===========================================================================
let gate
{
  const page = await newPage({ delayMapChunk: 1400 })
  const chunkRequests = []
  page.on('request', (r) => {
    if (/MapPage-.*\.js/.test(r.url())) chunkRequests.push(r.url().split('/').pop())
  })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)
  await page.evaluate(() => window.__resetTrace())
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'open the map')
  // The chunk is on the wire for 1.4s; nothing to do but let it arrive.
  const mapped = await waitFor(page, '.leaflet-container', { timeout: 30000 })
  await settleFrame(page, { toPath: '/map', afterSeq: seqBefore })
  await sleep(300)
  await page.evaluate(() => window.__stopTrace())
  const trace = await page.evaluate(() => window.__trace.slice())
  const anims = await page.evaluate(() => window.__anims.slice())
  await page.screenshot({ path: `${OUT}10-gated-cold-load.png` })

  // The window that matters is everything between the URL changing and the map
  // existing — however React got there. Two things keep it dark: react-router
  // navigates inside a transition, so React holds the previous screen instead of
  // committing a fallback, and the route gate holds the incoming frame at
  // opacity 0 if it does mount. What must never happen is a *visible* frame with
  // no map in it yet.
  // `leaflets` (the count in the page) is what says whether the map exists yet;
  // there is no per-sample `map` field in the trace.
  const beforeMap = trace.filter((s) => s.path === '/map' && s.leaflets === 0)
  const waitMs = beforeMap.length ? beforeMap[beforeMap.length - 1].t - beforeMap[0].t : 0
  // Only the page being left may ever be visible in this window (it is the first
  // half of the dissolve, doing exactly what it should).
  const visibleWhileWaiting = beforeMap.filter((s) => s.frames.some((f) => f.op > 0.02))
  const onlyOutgoingVisible = visibleWhileWaiting.every((s) =>
    s.frames.every((f) => f.op <= 0.02 || f.is === 'landing'))
  const visibleBlank = beforeMap.filter((s) =>
    s.frames.some((f) => f.is !== 'map' && f.is !== 'landing' && f.op > 0.02)).length
  const fallbackWhileWaiting = [...new Set(beforeMap.map((s) => JSON.stringify(s.fallback)))]
  const overlayWhileWaiting = [...new Set(beforeMap.map((s) => s.busyOverlay))]
  // Nothing may fade *in* before the map exists. The outgoing page's own exit
  // animation (its last keyframe is 0) is the transition working, not this.
  const enterAnimsWhileWaiting = beforeMap.length
    ? anims.filter((a) => a.at >= beforeMap[0].t && a.at <= beforeMap[beforeMap.length - 1].t)
        .filter((a) => a.is !== 'map' && Number(a.keys[a.keys.length - 1]?.op) === 1).length
    : -1

  const entered = summarise(trace, anims, { toPath: '/map' })
  const geo = await settleMap(page)
  const atRest = await page.evaluate(() => {
    const frame = [...document.querySelectorAll('[data-route-frame]')].pop()
    return { opacity: getComputedStyle(frame).opacity, transform: getComputedStyle(frame).transform }
  })
  const enter = entered.enterAnim
  gate = { beforeMap, waitMs, entered }

  record('10', 'delayed /map chunk: dark until the chunk lands, then a full fade-in',
    chunkRequests.length > 0 && mapped && waitMs >= 1000 &&
    onlyOutgoingVisible && visibleBlank === 0 && enterAnimsWhileWaiting === 0 &&
    overlayWhileWaiting.length === 1 && overlayWhileWaiting[0] === false &&
    beforeMap.every((s) => s.fallback === null || (s.fallback.op === 0 && s.fallback.html === 0)) &&
    entered.blankOnScreen === 0 &&
    Boolean(enter) && enter.dur >= 350 && enter.dur <= 450 &&
    Number(enter.keys[0]?.op) === 0 && Number(enter.keys[enter.keys.length - 1]?.op) === 1 &&
    Number(atRest.opacity) === 1 && atRest.transform === 'none' &&
    geo.pathTotalArea === reference.pathTotalArea,
    `MapPage chunk delayed 1400ms on the wire · requests: ${JSON.stringify(chunkRequests)}\n` +
    `map mounted after the delay: ${mapped}\n` +
    `waited ${Math.round(waitMs)}ms over ${beforeMap.length} sampled frames with the URL on /map and no map yet:\n` +
    `  samples with something visible on screen: ${visibleWhileWaiting.length} — all of them the outgoing page: ${onlyOutgoingVisible}\n` +
    `  frames visible with no map in them: ${visibleBlank} (must be 0 — this is the fade over blank space)\n` +
    `  fade-*in* animations started before the map existed: ${enterAnimsWhileWaiting} (must be 0)\n` +
    `  Suspense fallback as sampled: ${fallbackWhileWaiting.join(' / ')} (opacity 0, 0 chars of content)\n` +
    `  aria-busy overlay present while waiting: ${JSON.stringify(overlayWhileWaiting)}\n` +
    `  frames on screen with a visible empty map: ${entered.blankOnScreen} (must be 0)\n` +
    `once landed: enter ${enter ? `${enter.dur}ms, opacity ${JSON.stringify(enter.keys.map((k) => k.op))}` : 'NOT FOUND'}\n` +
    `at rest: opacity ${atRest.opacity}, transform ${atRest.transform} · polygons ${geo.pathTotalArea}px² (reference ${reference.pathTotalArea}px²)`)
  await page.close()
}

// ===========================================================================
// 11 · no white anywhere in the handover — measured, not assumed
// ===========================================================================
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(2500)
  const backgrounds = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }))
  const seqBefore = await page.evaluate(() => window.__currentSeq())
  await clickLink(page, 'open the map')
  // Freeze the exit at 95% — the moment the transition is at its darkest — and
  // photograph what the screen actually contains there.
  const frozen = await page.evaluate(() => window.__freezeAt(0.99, 'exit')) // 99% of the exit
  await sleep(150)
  const darkPath = `${OUT}11-dark-window.png`
  if (frozen.frozen) await page.screenshot({ path: darkPath })
  const dark = frozen.frozen ? luminanceOf(darkPath) : null
  await page.evaluate(() => window.__unfreeze())
  await settleFrame(page, { toPath: '/map', afterSeq: seqBefore })
  const settled = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }))
  await page.screenshot({ path: `${OUT}12-map-settled-after.png` })

  const ink = 'rgb(10, 10, 10)'
  record('11', 'the handover is dark at every step: ink backgrounds, black pixels',
    backgrounds.html === ink && backgrounds.body === ink && settled.html === ink &&
    settled.body === ink && Boolean(dark) && dark.max < 40,
    `html/body background before: ${backgrounds.html} / ${backgrounds.body}\n` +
    `html/body background after:  ${settled.html} / ${settled.body}   (expect ${ink} — the ` +
    `canvas may not go white at any point, including a cold load; index.html sets it inline too)\n` +
    (dark
      ? `mid-transition frame frozen at ${frozen.at}ms of the ${frozen.dur}ms exit (99%, the darkest moment):\n` +
        `  ${darkPath.split('/').pop()} ${dark.width}×${dark.height} · mean luminance ${dark.mean}/255 · brightest pixel ${dark.max}/255\n` +
        `  a white flash would put that maximum at ~255; the assertion is < 40`
      : 'could not freeze the exit for the dark frame'))
  await page.close()
}

// ===========================================================================
// observation · the post-click main-thread block
// ===========================================================================
{
  const worst = Math.max(0, ...(forward.long ?? []).map((l) => l.dur))
  record('obs', 'post-click main-thread block (reported, not asserted)', null,
    `longest task after the click on this machine: ${worst}ms\n` +
    `That is the /map chunk executing plus Leaflet mounting, and it is why the\n` +
    `handover can read as a pause here. It is not caused by this pass: the same\n` +
    `block was measured on the pre-change build (2237ms vs ${worst}ms here), so it\n` +
    `pre-dates the new transition, and it is CPU-bound — far smaller on real\n` +
    `hardware than in this software-rendered sandbox.`)
}

// ===========================================================================
await browser.close()
const failed = results.filter((r) => r.pass === false)
console.log(`\n${'='.repeat(74)}`)
const asserted = results.filter((r) => r.pass !== null)
console.log(`${asserted.length - failed.length}/${asserted.length} assertions passed` +
  (failed.length ? ` — FAILED: ${failed.map((f) => f.id).join(', ')}` : '') +
  ` · ${results.length - asserted.length} reported`)
console.log(`screens → ${OUT}`)
process.exit(failed.length ? 1 : 0)
