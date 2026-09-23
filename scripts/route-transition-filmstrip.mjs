#!/usr/bin/env node
/**
 * route-transition-filmstrip.mjs — a before/after contact sheet of the `/` ⇄
 * `/map` dissolve, for the docs folder.
 *
 *   LD_LIBRARY_PATH=/tmp/chromium-libs/lib node scripts/route-transition-filmstrip.mjs
 *
 * Chromium is not a project dependency; the setup (a Chromium build plus the
 * `@sparticuz`/`puppeteer-core` symlinks) is documented at the top of
 * `route-transition-pass.mjs`. This script is the picture version of that one:
 * the pass measures, this shows.
 *
 * HOW THE FRAMES ARE TAKEN
 * ------------------------
 * Every frame is a *real* screenshot of the live transition, frozen at an exact
 * point in it. `motion` drives the route frame's opacity through the Web
 * Animations API, so the animation can be paused and scrubbed from the page
 * (`anim.pause(); anim.currentTime = duration × fraction`) — which is why the
 * labels carry both the fraction and the milliseconds, plus the opacity the
 * browser actually computed while that frame was on screen. The transform (the
 * rise on the way in, the scale/rise on the pre-change build) is driven by
 * motion's own frame loop and is not scrubbable, so a frozen frame shows it
 * wherever the live loop left it; that is a few pixels at most, and it is the
 * only thing on the sheet that is not exact.
 *
 * Each animation is paused the instant `motion` creates it (every one of them
 * arrives through `Element.prototype.animate`), and only resumed once its
 * frames have been taken. That is not a stylistic choice: the pre-change exit
 * is 120ms, which is *shorter than one frame interval* on a machine busy
 * compiling the map chunk — this sandbox drops to ~4fps there — and an exit
 * that finishes is also an exit whose frame has already been unmounted, so a
 * missed one can never be recovered. Held paused, the same animation waits for
 * the shutter instead of racing it.
 *
 * A leg is captured twice over: the click and the first lookup share one
 * evaluate (a 120ms exit cannot slip between two round trips), and a leg that
 * did not photograph both halves is retried on a fresh page rather than being
 * published with an empty cell.
 *
 * Frames are captured from two builds: whatever is serving `--before` (the
 * pre-change build) and `--after` (the current one), and composited into one
 * image per direction by drawing them into a canvas in the browser itself, which
 * is also where the labels get drawn.
 *
 *   node scripts/route-transition-filmstrip.mjs \
 *     --before=http://localhost:4174 --after=http://localhost:4173
 */
import { mkdirSync } from 'node:fs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback

const BEFORE = arg('before', 'http://localhost:4174')
const AFTER = arg('after', 'http://localhost:4173')
const OUT = new URL('../docs/route-transition-shots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'],
  headless: 'shell',
  protocolTimeout: 600000,
})

/**
 * Pause-and-scrub controls for whichever route frame is animating.
 *
 * Installed before any app script runs, because it wraps
 * `Element.prototype.animate`: that is the single funnel every `motion`
 * animation goes through, and wrapping it means an animation can be caught at
 * creation and held — see the note at the top of this file for why holding it
 * matters.
 */
const SCRUB = () => {
  window.__anims = []
  const orig = Element.prototype.animate
  Element.prototype.animate = function (keyframes, options) {
    const anim = orig.call(this, keyframes, options)
    if (this.hasAttribute?.('data-route-frame')) {
      // Pause before it paints: the element keeps the first keyframe until
      // __scrub moves it, however long that takes.
      try {
        anim.pause()
      } catch {
        /* nothing to hold */
      }
      window.__anims.push({ el: this, anim })
    }
    return anim
  }

  const keyframesOf = (rec) => {
    try {
      return rec.anim.effect.getKeyframes() ?? []
    } catch {
      return []
    }
  }
  const find = (which) =>
    window.__anims.find((rec) => {
      const keys = keyframesOf(rec)
      const first = Number(keys[0]?.opacity)
      const last = Number(keys[keys.length - 1]?.opacity)
      return which === 'exit' ? first === 1 && last === 0 : last === 1
    })

  /** Resolves true once the named half of the dissolve has been created. */
  window.__waitForAnim = (which, timeout = 20000) =>
    new Promise((resolve) => {
      const deadline = performance.now() + timeout
      const attempt = () => {
        if (find(which)) return resolve(true)
        if (performance.now() > deadline) return resolve(false)
        setTimeout(attempt, 50)
      }
      attempt()
    })
  window.__scrub = (which, fraction) => {
    const rec = find(which)
    if (!rec) return { ok: false }
    const duration = rec.anim.effect.getComputedTiming().duration
    rec.anim.pause()
    rec.anim.currentTime = duration * fraction
    const cs = getComputedStyle(rec.el)
    // What the fade is actually revealing — the whole point of the
    // comparison. The pre-change build mounts the Suspense fallback straight
    // away, so its enter animates the spinner in; this build holds the frame
    // blank until the map chunk has resolved.
    //
    // Selected by aria-label, not by role: the app has several `role="status"`
    // live regions (`LiveDataStatus` is an sr-only one on every page), and
    // matching those would report a spinner on pages that have none.
    const fallbacks = [...rec.el.querySelectorAll('[aria-label="Loading map"]')].map((node) => ({
      opacity: Number(getComputedStyle(node).opacity),
      svg: node.querySelectorAll('svg').length,
      text: (node.textContent ?? '').trim().length,
    }))
    const visible = fallbacks.filter((f) => f.opacity > 0.01 || f.svg > 0 || f.text > 0)
    return {
      ok: true,
      ms: Math.round(duration * fraction),
      duration: Math.round(duration),
      opacity: Number(cs.opacity).toFixed(3),
      transform: cs.transform === 'none' ? 'none' : cs.transform,
      fallbacks,
      suspended: visible.length > 0,
      textLength: (rec.el.textContent ?? '').trim().length,
    }
  }
  window.__resume = () => window.__anims.forEach((rec) => rec.anim.play())
  /** Forget the previous leg, so a lookup cannot match the last one's frames. */
  window.__reset = () => {
    window.__anims = []
  }
}

async function shootOnce(base, direction) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await page.setRequestInterception(true)
  page.on('request', (req) => req.continue())
  await page.evaluateOnNewDocument(SCRUB)

  const forward = direction === 'forward'
  const from = forward ? '/' : '/map'
  const to = forward ? '/map' : '/'
  const cta = forward ? 'open the map' : 'red tide'

  await page.goto(base + from, { waitUntil: 'networkidle2' })
  await sleep(3000)

  const shots = {}
  const freeze = async (key, label, which, fraction) => {
    const info = await page.evaluate(
      async (w, f) => {
        const found = await window.__waitForAnim(w)
        return found ? window.__scrub(w, f) : { ok: false, why: 'animation not found' }
      },
      which,
      fraction,
    )
    if (!info.ok) {
      shots[key] = { label, note: info.why ?? 'not captured', warn: info.why ?? '', png: null }
      return
    }
    shots[key] = {
      label,
      note: `${info.ms}ms of ${info.duration}ms · opacity ${info.opacity}`,
      ...(info.suspended
        ? { warn: '⚠ fading in the spinner, not the map' }
        : {}),
      png: await page.screenshot({ encoding: 'base64' }),
    }
  }

  shots.rest = { label: 'at rest', note: '', png: await page.screenshot({ encoding: 'base64' }) }

  // The click, so the transition this leg photographs starts here — and the
  // flag that says whether the click was a client-side route change at all (a
  // full page load has no transition to photograph).
  const clicked = await page.evaluate((re) => {
    const link = [...document.querySelectorAll('a')].find((a) =>
      new RegExp(re, 'i').test(a.textContent ?? ''),
    )
    if (!link) return false
    window.__reset()
    window.__noReload = true
    link.click()
    return true
  }, cta)

  await freeze('exit-50', 'leaving · 50%', 'exit', 0.5)
  const clientSide = await page.evaluate(() => window.__noReload === true)
  await freeze('exit-97', 'leaving · 97% (the dark beat)', 'exit', 0.97)
  // Let the held exit finish, so the incoming frame mounts and animates.
  await page.evaluate(() => window.__resume())
  await freeze('enter-30', 'arriving · 30%', 'enter', 0.3)
  await freeze('enter-70', 'arriving · 70%', 'enter', 0.7)
  await page.evaluate(() => window.__resume())
  await sleep(2500)
  shots.settled = { label: 'settled', note: '', png: await page.screenshot({ encoding: 'base64' }) }

  const path = await page.evaluate(() => location.pathname)
  await page.close()

  return {
    shots,
    captured: !!(shots['exit-50'].png && shots['enter-30'].png),
    clientSide: clientSide && clicked,
    path,
    to,
  }
}

/**
 * Retry wrapper.
 *
 * A leg is only trustworthy if it photographed both halves of the dissolve and
 * the click really was a client-side route change (a full page load never runs
 * the transition at all). An empty cell must never reach a published contact
 * sheet, so an incomplete leg is retried on a fresh page — and if it still
 * fails the script exits non-zero instead of quietly shipping the gap.
 */
async function shoot(base, direction, attempts = 3) {
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await shootOnce(base, direction)
    if (last.captured && last.clientSide && last.path === last.to) return last.shots
    console.warn(
      `  ! ${direction} ${base}: no transition captured (attempt ${attempt}/${attempts})` +
        ` — clientSide=${last.clientSide} path=${last.path} (want ${last.to})` +
        ` exit=${!!last.shots['exit-50'].png} enter=${!!last.shots['enter-30'].png}`,
    )
  }
  process.exitCode = 1
  console.warn(`  !! ${direction} ${base}: giving up — this row will have empty cells`)
  return last.shots
}

/**
 * Compose the sheet in the browser: two rows (before/after) of the same six
 * moments, drawn into a canvas and screenshotted.
 */
async function compose({ direction, title, before, after, beforeNote, afterNote }) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 })
  const image = await page.evaluate(
    async ({ title, before, after, beforeNote, afterNote, direction }) => {
      const ORDER = ['rest', 'exit-50', 'exit-97', 'enter-30', 'enter-70', 'settled']
      const SCALE = 0.3
      const FW = 1280 * SCALE
      const FH = 800 * SCALE
      const GAP = 12
      // Room for two label lines: the moment, then the measurement (and, when
      // it applies, the warning that this frame is fading in a spinner).
      const LABEL = 62
      const HEAD = 62
      const ROW = 30
      const width = GAP + ORDER.length * (FW + GAP)
      const height = HEAD + 2 * (ROW + FH + LABEL + GAP) + ROW
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      document.body.style.margin = '0'
      document.body.style.background = '#0a0a0a'
      document.body.appendChild(canvas)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Labels are drawn under their own column; a long one must be clipped to
      // that column or it reads as belonging to the frame beside it.
      const fit = (text, max) => {
        if (ctx.measureText(text).width <= max) return text
        let t = text
        while (t.length > 4 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
        return t + '…'
      }

      const draw = async (rowY, shots, rowTitle) => {
        ctx.fillStyle = '#f0a500'
        ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif'
        ctx.fillText(rowTitle, GAP, rowY + 20)
        for (const [i, key] of ORDER.entries()) {
          const shot = shots[key]
          const x = GAP + i * (FW + GAP)
          const y = rowY + ROW - 6
          if (shot?.png) {
            const bitmap = await createImageBitmap(
              await (await fetch(`data:image/png;base64,${shot.png}`)).blob(),
            )
            ctx.drawImage(bitmap, x, y, FW, FH)
            ctx.strokeStyle = '#2a2a2a'
            ctx.strokeRect(x + 0.5, y + 0.5, FW - 1, FH - 1)
          } else {
            ctx.strokeStyle = '#2a2a2a'
            ctx.strokeRect(x + 0.5, y + 0.5, FW - 1, FH - 1)
          }
          ctx.fillStyle = shot?.warn ? '#d98b2b' : '#9d9d9d'
          ctx.font = '500 13px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.fillText(fit(shot?.label ?? key, FW), x, y + FH + 17)
          if (shot?.note) {
            ctx.fillStyle = shot.warn ? '#d98b2b' : '#6e6e6e'
            ctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace'
            ctx.fillText(fit(shot.note, FW), x, y + FH + 32)
          }
          if (shot?.warn) {
            ctx.fillStyle = '#d98b2b'
            ctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace'
            ctx.fillText(fit(shot.warn, FW), x, y + FH + 47)
          }
        }
      }

      ctx.fillStyle = '#eaeaea'
      ctx.font = '600 24px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(title, GAP, 34)
      ctx.fillStyle = '#6e6e6e'
      ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(
        'each frame is a real screenshot, frozen mid-animation; labels carry the measurement',
        GAP,
        54,
      )
      await draw(HEAD, before, `BEFORE — ${beforeNote}`)
      await draw(HEAD + ROW + FH + LABEL + GAP, after, `AFTER — ${afterNote}`)

      const data = canvas.toDataURL('image/png')
      const box = { width, height }
      return { data, box, direction }
    },
    { title, before, after, beforeNote, afterNote, direction },
  )
  await page.close()
  return image
}

const results = []
for (const direction of ['forward', 'reverse']) {
  const before = await shoot(BEFORE, direction)
  const after = await shoot(AFTER, direction)
  const { data } = await compose({
    direction,
    title:
      direction === 'forward'
        ? 'Landing → Map  ·  the route dissolve, before and after'
        : 'Map → Landing  ·  the route dissolve, back, before and after',
    before,
    after,
    beforeNote: 'shared frame, 120ms exit every way + 300ms enter with scale/rise',
    afterNote: '350ms ease-in exit, then dark, then 400ms ease-out enter with an 8px rise',
  })
  const file = `${OUT}filmstrip-${direction}.png`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
  console.log(`wrote ${file}`)
  results.push({ direction, file })
}

await browser.close()
console.log(JSON.stringify(results, null, 1))
