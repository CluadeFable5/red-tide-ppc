#!/usr/bin/env node
// Production/demo browser regression: real local fonts, live-region semantics,
// map/drawer/popup/report/admin flow at every requested width and motion setting.
//
// The browser-side owner of item 6 of the six-item checklist (report → approve
// E2E). Until 2026-09-24 it walked the bottom sheet's mid/full/peek anchors;
// those anchors are gone, so it now drives the right-edge zone drawer's two
// states (open / collapsed) through the grab tab and selects from the drawer's
// zone list. The popup, report form, admin approve and live-region assertions
// are unchanged. Run against a demo-backend production build:
//   npm run preview && node scripts/live-data-map-pass.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
const baseURL = process.argv[2] ?? 'http://localhost:4173'
const output = resolve(process.env.RESPONSIVE_OUTPUT_DIR ?? '.cache/live-data-map')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = []
try {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    for (const width of [375, 768, 1280, 1920]) {
      const height = width === 375 ? 812 : width === 1920 ? 1080 : 900
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion })
      // Local assets must suffice: no Google font or map tile service needed.
      await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort())
      const page = await context.newPage()
      const errors = [], fontRequests = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (request.resourceType() === 'font') fontRequests.push(request.url()) })
      await page.goto(baseURL, { waitUntil: 'networkidle' })
      assert.equal(await page.getByText('Demo mode', { exact: true }).count(), 1, 'Demo only')
      await page.evaluate(() => document.fonts.ready)
      for (const name of ['Bebas Neue', 'Space Grotesk', 'JetBrains Mono']) {
        assert.ok(await page.evaluate((name) => [...document.fonts].some((f) => f.family.replaceAll('"', '') === name && f.status === 'loaded'), name), `${name} loaded with outside network blocked`)
      }
      const live = page.getByRole('status', { name: 'Live coastal data', exact: true })
      const expectMessage = async (text) => {
        await page.waitForFunction((text) => document.querySelector('[role="status"][aria-label="Live coastal data"]')?.textContent.includes(text), text)
        assert.equal(await live.count(), 1)
        assert.equal(await live.getAttribute('aria-live'), 'polite')
        assert.equal(await live.getAttribute('aria-atomic'), 'true')
      }
      await expectMessage('7 zones watched')
      await page.getByRole('link', { name: 'Open the map', exact: true }).click()
      await page.getByRole('button', { name: 'Reset view', exact: true }).waitFor()
      await expectMessage('0 pending reports')
      await page.waitForTimeout(450)
      const mapBox = await page.locator('.leaflet-container').boundingBox()
      assert.ok(Math.abs(mapBox.width - width) < 1 && Math.abs(mapBox.height - height) < 1, 'Map remains full viewport after route entry')
      assert.equal(await page.locator('.zone-path').count(), 7)
      const sheet = page.getByRole('region', { name: 'Advisory and zone list' })
      const drawerTab = page.getByTestId('zone-drawer-tab')
      // The drawer starts collapsed below 768px and open at or above it
      // (MapPage.initialZoneDrawerState), so drive it to a known state instead
      // of assuming one. Verified against the same tab click map-drawers-pass
      // uses for both drawers.
      const setDrawer = async (state) => {
        if ((await sheet.getAttribute('data-state')) !== state) await drawerTab.click()
        await page.waitForFunction(
          (state) => document.querySelector('[data-testid="zone-drawer"]')?.getAttribute('data-state') === state,
          state,
        )
        await page.waitForTimeout(600)
      }
      await setDrawer('open')
      await page.screenshot({ path: resolve(output, `map-${width}-${reducedMotion}-drawer-open.png`) })
      await setDrawer('collapsed')
      await page.screenshot({ path: resolve(output, `map-${width}-${reducedMotion}-drawer-collapsed.png`) })
      await page.getByRole('button', { name: 'Reset view', exact: true }).click()
      await page.waitForTimeout(700)
      await page.screenshot({ path: resolve(output, `map-${width}-${reducedMotion}.png`) })

      // Select via the drawer's zone list, then click the focused polygon.
      await setDrawer('open')
      const name = 'Honda Bay — Inner Islands'
      // No `exact`: the card's accessible name concatenates the row's text
      // (name, zone tag + relative time, description), not just the name.
      await sheet.getByRole('button', { name }).click()
      await page.waitForTimeout(700)
      await page.locator('.zone-path--selected').click()
      await page.locator('.leaflet-popup').waitFor()
      await page.locator('.leaflet-popup').getByRole('button', { name: 'Report something here', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('What did you see?').fill('Browser regression test: reddish water observed near the shellfish collection area this morning.')
      await dialog.getByRole('button', { name: 'Submit report', exact: true }).click()
      await expectMessage('1 pending reports')
      assert.ok((await live.textContent()).includes(`${name}: Safe. 1 pending reports.`))
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      await page.waitForTimeout(1700)
      // Admin is only unlocked in this isolated demo session.
      await page.evaluate(() => sessionStorage.setItem('red-tide-ppc:admin-unlocked', '1'))
      await page.goto(`${baseURL}/admin`, { waitUntil: 'networkidle' })
      await expectMessage('1 total reports')
      await page.getByRole('button', { name: 'Approve → advisory', exact: true }).click()
      await expectMessage('1 under advisory')
      await expectMessage('0 pending reports')
      await page.getByRole('link', { name: 'Public map', exact: true }).click()
      await page.getByRole('button', { name: 'Reset view', exact: true }).waitFor()
      await expectMessage('1 under advisory')
      assert.equal(await page.locator('.zone-path').count(), 7)
      const key = page.getByRole('group', { name: 'Zone status key' })
      assert.match(await key.textContent(), /Advisory1/)
      assert.ok((await live.ariaSnapshot()).includes('1 under advisory'), 'Accessible status tree contains final counts')
      assert.ok(fontRequests.length > 0 && fontRequests.every((url) => new URL(url).origin === new URL(baseURL).origin))
      assert.deepEqual(errors, [])
      results.push({ width, reducedMotion, mapBox, fontRequests, status: await live.textContent(), result: 'PASS' })
      console.log(`PASS ${width}px ${reducedMotion}: local fonts, map geometry, drawer states, popup, report → approve, live data`)
      await context.close()
    }
  }
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  await browser.close()
}
