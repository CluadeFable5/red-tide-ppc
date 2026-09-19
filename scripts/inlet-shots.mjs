#!/usr/bin/env node
/**
 * Inlet trace-identification captures (round 1).
 *
 * Frames the bay-mouth / apex / gap area on REAL OSM tiles so the
 * hand-traced inlet from the reference image can be identified against
 * rendered shoreline + the pp-bay polygon + offshore islets.
 *
 * Navigation core cloned from scripts/pp-bay-extension-shots.mjs; no zone-row
 * selection (the polygon renders regardless) — frame + shoot only.
 *
 * Env:
 *   BASE_URL      app base (default http://127.0.0.1:4175)
 *   OUT_DIR       png dir (default docs/inlet-shots)
 *   PREFIX        filename prefix (default "trace-id")
 *   REQUIRE_TILES fail unless every shot loaded tiles from network (default 1)
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4175';
const OUT_DIR = process.env.OUT_DIR ?? 'docs/inlet-shots';
const PREFIX = process.env.PREFIX ?? 'trace-id';
const REQUIRE_TILES = (process.env.REQUIRE_TILES ?? '1') === '1';

fs.mkdirSync(OUT_DIR, { recursive: true });

// Round-1 identification framings (all on real tiles):
//  - corridor: reference-equivalent z15 (labels corridor + band + Caña + climb + apex)
//  - north:    z15 over the apex + gap (rendered shore N of apex? river mouth?)
//  - wide:     z13 bay-mouth context (far shore + estuary + river + gap)
const TARGETS = [
  { name: 'corridor', center: [9.779, 118.7225], zoom: 15 },
  { name: 'north', center: [9.795, 118.71], zoom: 15 },
  { name: 'wide', center: [9.78, 118.715], zoom: 13 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismissOverlays(page) {
  for (let i = 0; i < 3; i += 1) {
    const collapsed = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button[aria-label]')];
      let clicked = 0;
      for (const label of ['Collapse bottom sheet', 'Collapse side panel']) {
        const b = btns.find((x) => x.getAttribute('aria-label') === label);
        if (b) { b.click(); clicked += 1; }
      }
      const hint = document.querySelector('[data-testid="swipe-hint"]');
      if (hint) {
        const c = [...hint.querySelectorAll('button')].find((b) => /dismiss|close/i.test(b.textContent ?? ''));
        if (c) c.click(); else hint.remove();
      }
      return clicked;
    }).catch(() => 0);
    if (!collapsed) break;
    await sleep(350);
  }
}

async function frameTarget(page, target) {
  const { center, zoom } = target;
  const before = await page.evaluate(() => document.querySelector('.leaflet-map-pane')?.style.transform ?? '');
  await page.evaluate(
    ({ c, z }) => {
      const map = window.__leaflet_map;
      if (!map) throw new Error('leaflet map missing');
      map.setView(c, z, { animate: false });
      map.invalidateSize(false);
    },
    { c: center, z: zoom },
  );
  await page.waitForFunction(
    (prev) => (document.querySelector('.leaflet-map-pane')?.style.transform ?? '') !== prev,
    before,
    { timeout: 15000 },
  ).catch(() => {});
  await sleep(1200);
}

async function waitForZones(page) {
  await page.waitForFunction(
    () => /SAFE\s+\d+/i.test(document.body.textContent ?? ''),
    null,
    { timeout: 60000 },
  );
  const ok = await page.waitForFunction(
    () => document.querySelectorAll('.leaflet-overlay-pane path').length > 0,
    null,
    { timeout: 60000 },
  ).then(() => true).catch(() => false);
  if (!ok) throw new Error('zone paths never rendered');
}

async function settleTiles(page, positions = [0, 1, 2]) {
  for (const p of positions) {
    await page.evaluate((pos) => window.scrollTo(0, pos), p).catch(() => {});
    await sleep(250);
  }
  const counts = await page.evaluate(() => ({
    loading: document.querySelectorAll('img.leaflet-tile:not(.leaflet-tile-loaded)').length,
    loaded: document.querySelectorAll('img.leaflet-tile-loaded').length,
  })).catch(() => ({ loading: 99, loaded: 0 }));
  if (counts.loading > 0) await sleep(2500);
  return page.evaluate(() => ({
    loading: document.querySelectorAll('img.leaflet-tile:not(.leaflet-tile-loaded)').length,
    loaded: document.querySelectorAll('img.leaflet-tile-loaded').length,
  })).catch(() => ({ loading: 99, loaded: 0 }));
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures = [];
  try {
    const netTiles = new Set();
    page.on('response', (res) => {
      try {
        const url = res.url();
        if (/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png/.test(url) && res.ok()) netTiles.add(url);
      } catch { /* ignore */ }
    });
    await page.goto(`${BASE_URL}/map`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForZones(page);
    await dismissOverlays(page);

    for (const target of TARGETS) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await frameTarget(page, target);
        // eslint-disable-next-line no-await-in-loop
        await dismissOverlays(page);
        // eslint-disable-next-line no-await-in-loop
        const tiles = await settleTiles(page);
        const file = path.join(OUT_DIR, `${PREFIX}-${target.name}.png`);
        // eslint-disable-next-line no-await-in-loop
        await page.screenshot({ path: file });
        // eslint-disable-next-line no-console
        console.log(`[inlet-shots] ${file} tiles loaded=${tiles.loaded} loading=${tiles.loading}`);
        if (REQUIRE_TILES && (tiles.loaded < 4 || tiles.loading > 0 || netTiles.size === 0)) {
          failures.push(`${target.name}: tiles not settled (loaded=${tiles.loaded} loading=${tiles.loading} net=${netTiles.size})`);
        }
      } catch (err) {
        failures.push(`${target.name}: ${(err && err.message) || err}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[inlet-shots] FAILURES\n - ${failures.join('\n - ')}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[inlet-shots] fatal: ${(err && err.stack) || err}`);
  process.exitCode = 1;
});
