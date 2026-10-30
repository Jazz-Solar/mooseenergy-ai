import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { comparisonFixture } from './health-models.test.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const artifacts = resolve(process.env.HEALTH_BROWSER_ARTIFACTS || '../browser'); await mkdir(artifacts, { recursive: true });
const index = await readFile(resolve(root, 'admin/index.html'), 'utf8');
const baseStyle = index.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    if (path === '/fixture') {
      res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseStyle}</style><link rel="stylesheet" href="/admin/admin.css"><link rel="stylesheet" href="/admin/site-access.css"><link rel="stylesheet" href="/admin/health-models.css"></head><body class="admin-app"><main class="wrap"><section class="admin-page" id="health"></section></main><script type="module">import {mountSiteHealth} from '/admin/site-health.js';window.health=mountSiteHealth(document.querySelector('#health'),window.fixtureCall);</script></body></html>`); return;
    }
    const file = resolve(root, '.' + path); if (!file.startsWith(root + '/')) throw Error('Invalid path');
    res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/plain'); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage(), errors = [], calls = [];
    page.on('pageerror', e => errors.push(e.message));
    let fail = false, hold = false, release, queued;
    await page.exposeFunction('fixtureCall', async (endpoint, body) => {
      assert.equal(endpoint, 'staff-site-access'); calls.push(body);
      if (body.action === 'health_sites') return { data: { items: [], total: 0, nextOffset: null } };
      if (body.action === 'health_model_sites') return { data: { sites: [{ systemId: 'site-a', name: 'MIIGWETCH I' }, { systemId: 'site-b', name: 'MIIGWETCH X' }] } };
      assert.equal(body.action, 'health_model_comparison');
      if (hold && body.input.systemId === 'site-a') { queued = true; await new Promise(r => release = r); }
      if (fail) throw Error('Source temporarily unavailable');
      const data = comparisonFixture(body.input.systemId, body.input.date || '2026-10-27');
      if (body.input.date === '2026-10-28') { data.source.scoredInverters = 0; data.source.missingInverters = 2; data.inverters.forEach(i => { i.conformal = null; i.xgb = null; }); }
      return { data };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    await page.getByRole('heading', { name: 'Digital Twin', exact: true }).waitFor();
    assert.match(await page.locator('.models-freshness').textContent(), /Delayed update/);
    assert.equal(await page.locator('.models-table tbody tr').count(), 2);
    assert.equal(await page.locator('.models-table img').count(), 0);
    assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.models-table th:last-child').evaluate(el => getComputedStyle(el).position), 'static');
    if (width < 700) {
      const scroll = page.getByRole('region', { name: 'Daily inverter model comparison' });
      await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      assert.ok(await scroll.evaluate(el => el.scrollLeft > 0));
      await scroll.evaluate(el => { el.scrollLeft = 0; });
    }
    await page.screenshot({ path: `${artifacts}/models-${width}.png`, fullPage: true });
    await page.getByLabel('Analysis day', { exact: true }).fill('2026-10-28');
    await page.waitForFunction(() => document.querySelector('.models-caption')?.textContent.includes('2026-10-28'));
    assert.equal(await page.locator('.models-table .model-badge').filter({ hasText: 'Not scored' }).count(), 4);
    await page.getByRole('button', { name: 'Latest published day' }).click();
    await page.waitForFunction(() => document.querySelector('#model-date').value === '2026-10-27');
    fail = true; await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
    await page.getByText('Source temporarily unavailable Use Refresh comparison to retry.', { exact: true }).waitFor();
    assert.equal(await page.locator('.models-table').count(), 0);
    fail = false; await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
    await page.locator('.models-table').waitFor();
    hold = true; await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
    await page.waitForTimeout(30); assert.ok(queued);
    await page.getByLabel('Comparison site').selectOption('site-b');
    await page.waitForFunction(() => document.querySelector('.models-caption')?.textContent.includes('MIIGWETCH X'));
    release(); await page.waitForTimeout(50);
    assert.match(await page.locator('.models-caption').textContent(), /MIIGWETCH X/);
    hold = false;
    await page.getByLabel('Comparison site').focus(); assert.equal(await page.getByLabel('Comparison site').evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => { document.documentElement.style.fontSize = '160%'; });
    assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    await page.evaluate(() => window.health.destroy()); assert.equal(await page.locator('#health').textContent(), '');
    assert.ok(calls.every(c => !['review_health', 'save_mapping'].includes(c.action))); assert.deepEqual(errors, []);
    await context.close(); console.log(`Daily models browser ${width}px passed`);
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
