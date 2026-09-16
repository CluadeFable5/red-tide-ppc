#!/usr/bin/env node
// Production/demo-only browser audit. Run: node scripts/admin-responsive-pass.mjs
// Optional BASE_URL argument, CHROMIUM_EXECUTABLE_PATH, RESPONSIVE_OUTPUT_DIR.
// Uses isolated local fixture data, never a live backend or shared admin session.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tsImport } from 'tsx/esm/api'
import { chromium } from 'playwright'
const { SEED_ZONES } = await tsImport('../src/data/zones.ts', import.meta.url)
const baseURL = process.argv[2] ?? 'http://localhost:4173'
const output = resolve(process.env.RESPONSIVE_OUTPUT_DIR ?? '.cache/admin-responsive')
await mkdir(output, { recursive: true })
const fixture = {
  zones: SEED_ZONES.map((zone, i) => ({ ...zone, status: ['safe', 'advisory', 'unconfirmed'][i % 3], lastUpdated: Date.now() })),
  reports: Array.from({ length: 9 }, (_, i) => ({
    id: `visual-test-${i}`, zoneId: SEED_ZONES[i % SEED_ZONES.length].id,
    description: `Test report ${i + 1}: Water near the shore looks reddish this morning. Please check the shellfish collection area before the next market delivery.`,
    photoUrl: null, submittedAt: Date.now() - i * 60000,
    status: i < 6 ? 'pending' : 'confirmed',
  })),
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = []
try {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    for (const width of [375, 768, 1280, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : width === 1920 ? 1080 : 900 }, reducedMotion })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(baseURL, { waitUntil: 'networkidle' })
      assert.equal(await page.getByText('Demo mode', { exact: true }).count(), 1, 'Audit requires demo backend')
      await page.evaluate((data) => {
        localStorage.setItem('red-tide-ppc:demo:v1', JSON.stringify(data))
        sessionStorage.setItem('red-tide-ppc:admin-unlocked', '1')
      }, fixture)
      await page.goto(`${baseURL}/admin`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      if (process.env.REQUIRE_LOCAL_FONTS === '1') {
        for (const font of ['Bebas Neue', 'Space Grotesk', 'JetBrains Mono']) {
          assert.ok(await page.evaluate((name) => [...document.fonts].some((f) => f.family.replaceAll('"', '') === name && f.status === 'loaded'), font), `${font} loaded`)
        }
      }
      for (const tab of ['Pending', 'Reviewed', 'Zones']) {
        await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
        await page.waitForTimeout(450)
        const m = await page.evaluate(() => {
          const main = document.querySelector('main'), css = getComputedStyle(main)
          const grid = main.querySelector('section ul')
          const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, right: r.right } }
          const overflow = [...main.querySelectorAll('*')].filter((e) => {
            if (e.closest('[aria-hidden="true"]')) return false
            const r = e.getBoundingClientRect()
            return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1)
          }).map((e) => e.tagName)
          return { main: box(main), header: box(document.querySelector('header > div')),
            contentWidth: main.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
            cards: [...grid.children].map(box), columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            overflow, scrollWidth: document.documentElement.scrollWidth }
        })
        const expected = width === 375 ? 1 : (tab === 'Zones' ? width >= 1280 : width >= 1536) ? 3 : 2
        assert.equal(m.columns, expected, `${width}px ${tab} column count`)
        assert.ok(m.contentWidth >= width * .75, 'Uses available width')
        assert.ok(Math.abs(m.main.x - (width - m.main.width) / 2) < 1, 'Centered shell')
        assert.deepEqual(m.header, { ...m.main, y: m.header.y }, 'Header aligns with shell')
        assert.ok(m.scrollWidth <= width)
        assert.deepEqual(m.overflow, [])
        for (const card of m.cards) assert.ok(Math.abs(card.width - m.cards[0].width) < 1, 'Equal card widths')
        await page.screenshot({ path: resolve(output, `admin-${tab.toLowerCase()}-${width}-${reducedMotion}.png`), fullPage: true })
        results.push({ width, reducedMotion, tab, ...m })
        console.log(`PASS ${width}px ${reducedMotion} ${tab}: ${m.contentWidth}px content / ${m.columns} columns`)
      }
      // Exercise real demo actions after screenshots: approve, reject, set zone safe.
      await page.getByRole('tab', { name: /^Pending/ }).click()
      await page.getByRole('button', { name: 'Approve → advisory', exact: true }).first().click()
      await page.getByRole('tab', { name: /Pending\s*5/ }).waitFor()
      await page.getByRole('button', { name: 'Reject', exact: true }).first().click()
      await page.getByRole('tab', { name: /Pending\s*4/ }).waitFor()
      await page.getByRole('tab', { name: 'Zones', exact: true }).click()
      await page.getByRole('region', { name: 'Zone status control' }).getByRole('button', { name: 'Safe', exact: true }).first().click()
      assert.deepEqual(errors, [], 'No browser exceptions')
      await context.close()
    }
  }
} finally {
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(results, null, 2))
  await browser.close()
}
console.log(`Screenshots: ${output}`)
