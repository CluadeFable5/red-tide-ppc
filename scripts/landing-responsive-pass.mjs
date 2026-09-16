#!/usr/bin/env node
/**
 * Real-browser layout regression checks (not just an overflow smoke test).
 * Run against a demo-mode production build:
 *   npm run build && npm run preview
 *   npx playwright install chromium
 *   node scripts/landing-responsive-pass.mjs [BASE_URL]
 * Optional CHROMIUM_EXECUTABLE_PATH for an already installed browser.
 * Screenshots/measurements go to ignored .cache/landing-responsive by default;
 * set RESPONSIVE_OUTPUT_DIR to keep them outside the repository if desired.
 * No reports or live data are modified. Admin inspection uses only a local
 * demo browser session, without configuring or submitting a passcode.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.argv[2] ?? 'http://localhost:4173'
const output = resolve(process.env.RESPONSIVE_OUTPUT_DIR ?? '.cache/landing-responsive')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const results = []
const close = (a, b) => Math.abs(a - b) <= 1

try {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    for (const width of [375, 768, 1280, 1920]) {
      const height = width === 375 ? 812 : width === 1920 ? 1080 : 900
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion, deviceScaleFactor: 1 })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      const resources = []
      page.on('request', (request) => resources.push(request.url()))
      await page.goto(baseURL, { waitUntil: 'networkidle' })
      await page.locator('section[aria-label="Figures"]').waitFor()
      await page.evaluate(() => document.fonts.ready)
      // Resolve every scroll-triggered reveal before taking the full-page shot.
      // (The hero band left <main> when it went full-bleed — §20 — so this
      // walks every labelled section, hero included, not just main's.)
      for (const section of await page.locator('section[aria-label]').all()) {
        await section.evaluate((element) => element.scrollIntoView({ block: 'center' }))
        await page.waitForTimeout(reducedMotion === 'reduce' ? 50 : 1200)
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(reducedMotion === 'reduce' ? 100 : 1800)

      const layout = await page.evaluate(() => {
        const rect = (element) => {
          const { x, y, width, height, right, bottom } = element.getBoundingClientRect()
          return { x, y, width, height, right, bottom }
        }
        const section = (label) => document.querySelector(`section[aria-label="${label}"]`)
        const main = document.querySelector('main')
        const css = getComputedStyle(main)
        const stats = section('Figures')
        const overview = stats.parentElement
        const footer = document.querySelector('footer')
        const overflow = [...document.querySelectorAll('main *, header a')].filter((e) => {
          if (e.closest('[aria-hidden="true"]')) return false // decorative canvas / reveal layers
          const r = e.getBoundingClientRect()
          return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)
        }).map((e) => e.tagName + '.' + String(e.className).slice(0, 80))
        return {
          main: rect(main),
          contentWidth: main.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
          contentLeft: main.getBoundingClientRect().left + parseFloat(css.paddingLeft),
          header: rect(document.querySelector('header > div')),
          hero: rect(section('Introduction')), overview: rect(overview),
          live: rect(section('Live status')), figures: rect(stats),
          cards: [...stats.children].map(rect),
          how: rect(section('How it works')), primer: rect(section('What is red tide')),
          banner: rect(footer.previousElementSibling), footer: rect(footer),
          footerDirection: getComputedStyle(footer).flexDirection,
          // The hero band is a sibling of <main> since it went full-bleed
          // (§20), so scope by "not in the header" rather than by <main>.
          ctas: [...document.querySelectorAll('a[href="/map"]')]
            .filter((a) => !a.closest('header'))
            .map(rect),
          overflow, scrollWidth: document.documentElement.scrollWidth,
          loadedFonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
        }
      })

      const tag = `${width}px / ${reducedMotion}`
      assert.deepEqual(errors, [], `${tag}: browser errors`)
      assert.deepEqual(layout.overflow, [], `${tag}: content outside viewport`)
      assert.ok(layout.scrollWidth <= width, `${tag}: horizontal scrolling`)
      assert.ok(close(layout.main.x, (width - layout.main.width) / 2), `${tag}: balanced container`)
      assert.ok(layout.contentWidth >= width * 0.75, `${tag}: content actually uses available width`)
      assert.ok(close(layout.header.x, layout.main.x) && close(layout.header.width, layout.main.width), `${tag}: header aligns with main`)
      assert.equal(layout.cards.length, 3)
      for (const card of layout.cards) {
        assert.ok(close(card.y, layout.cards[0].y) && close(card.width, layout.cards[0].width), `${tag}: equal three-card stats row`)
      }
      assert.ok(close(layout.cards[0].x, layout.figures.x) && close(layout.cards[2].right, layout.figures.right), `${tag}: stats fill their column`)
      if (width >= 1024) {
        assert.ok(layout.overview.x >= layout.hero.right + 40, `${tag}: status occupies the right column`)
        assert.ok(layout.overview.width >= layout.contentWidth * 0.4, `${tag}: right column has real weight`)
        assert.ok(layout.overview.y < layout.hero.bottom && layout.overview.bottom > layout.hero.y, `${tag}: hero and status are beside one another`)
      } else {
        assert.ok(layout.overview.y >= layout.hero.bottom + 50, `${tag}: mobile/tablet status stacks after hero`)
        assert.ok(close(layout.figures.width, layout.contentWidth), `${tag}: stacked stats use full width`)
      }
      if (width >= 768) {
        assert.ok(close(layout.how.y, layout.primer.y), `${tag}: educational sections share a row`)
        assert.ok(layout.primer.x > layout.how.right, `${tag}: educational sections do not overlap`)
        assert.ok(layout.how.width >= layout.contentWidth * 0.4, `${tag}: useful educational column widths`)
      } else {
        assert.ok(layout.primer.y >= layout.how.bottom + 50, `${tag}: phone educational sections stack`)
      }
      for (const box of [layout.banner, layout.footer]) {
        assert.ok(close(box.x, layout.contentLeft) && close(box.width, layout.contentWidth), `${tag}: banner/footer fill shell`)
      }
      assert.ok(layout.banner.y >= Math.max(layout.how.bottom, layout.primer.bottom), `${tag}: banner follows both columns`)
      assert.equal(layout.footerDirection, width < 640 ? 'column' : 'row')
      assert.equal(layout.ctas.length, 2)
      for (const cta of layout.ctas) assert.ok(cta.width > 0 && cta.y >= layout.hero.y && cta.bottom <= layout.hero.bottom + 1)
      assert.ok(!resources.some((url) => /\/MapPage-[^/]+\.js/.test(url)), `${tag}: landing still defers map bundle`)
      if (reducedMotion === 'reduce') {
        assert.equal(await page.locator('[data-testid="hero-backdrop"] canvas').count(), 0)
      }
      await page.screenshot({ path: resolve(output, `landing-${width}-${reducedMotion}.png`), fullPage: true })
      results.push({ route: '/', width, reducedMotion, ...layout })
      console.log(`PASS ${tag}: ${Math.round(layout.contentWidth)}px content; ${width >= 1024 ? 'split hero/status' : 'stacked hero/status'}; ${width >= 768 ? 'two-column' : 'stacked'} education`)

      // Adjacent-route layout audit, once per width. Map tiles may be unavailable
      // offline; the Leaflet surface and responsive sheet geometry still work.
      if (reducedMotion === 'reduce') {
        assert.equal(await page.getByText('Demo mode', { exact: true }).count(), 1, 'Adjacent admin audit requires demo mode')
        await page.goto(`${baseURL}/map`, { waitUntil: 'networkidle' })
        const map = page.locator('.leaflet-container')
        await map.waitFor()
        const mapBox = await map.boundingBox()
        assert.ok(close(mapBox.width, width) && close(mapBox.height, height), `${width}px: map fills viewport`)
        results.push({ route: '/map', width, map: mapBox })
        await page.screenshot({ path: resolve(output, `map-${width}.png`) })

        await page.goto(`${baseURL}/admin`, { waitUntil: 'networkidle' })
        await page.getByLabel('Passcode', { exact: true }).waitFor()
        results.push({ route: '/admin (gate)', width, main: await page.locator('main').boundingBox() })
        await page.evaluate(() => sessionStorage.setItem('red-tide-ppc:admin-unlocked', '1'))
        await page.reload({ waitUntil: 'networkidle' })
        await page.getByRole('tab', { name: 'Zones', exact: true }).click()
        await page.getByRole('region', { name: 'Zone status control' }).waitFor()
        const adminBox = await page.locator('main').boundingBox()
        assert.ok(adminBox.width <= width && close(adminBox.x, (width - adminBox.width) / 2), `${width}px: admin remains centered`)
        results.push({ route: '/admin (zones)', width, main: adminBox, note: 'Responsive dashboard; see admin-responsive-pass.mjs for card-grid checks.' })
        await page.screenshot({ path: resolve(output, `admin-${width}.png`), fullPage: true })
      }
      await context.close()
    }
  }
} finally {
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(results, null, 2) + '\n')
  await browser.close()
}
console.log(`Screenshots and measurements: ${output}`)
