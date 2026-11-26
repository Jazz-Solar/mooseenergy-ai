import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('.'), out = resolve('../previews/utility-invitation'); await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(root + '/')) throw Error();
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath() });
const id = '22222222-2222-4222-8222-222222222222', token = `v1.${id}.1893456000.fixture-signature`;
const checks = [];
try {
  for (const width of [320, 390, 768]) for (const scale of [1, 1.6, 2.4]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage();
    const errors = [], calls = []; let state = 'awaiting_customer', revoked = false, discovered = false, version = null, selectedStream = null;
    const meters = [{ id: 'a'.repeat(64), meter: 'METER-A', label: 'Maple House export', direction: 'export', intervalSeconds: 3600 },
      { id: 'b'.repeat(64), meter: 'METER-B', label: 'Other property', direction: 'import', intervalSeconds: 3600 }];
    page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(10000);
    await context.route('**/functions/v1/utility-invitation', async route => {
      const request = route.request(), b = request.postDataJSON(); calls.push(b);
      assert.equal(b.token, token); assert.equal(request.headers().authorization, undefined); assert.equal(request.headers().referer, undefined);
      assert.equal(new URL(page.url()).hash, '');
      const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
      if (revoked) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'This link expired or was cancelled.' } }) });
      if (b.action === 'status') return reply({ invitationId: id, siteName: 'Maple House', siteAddress: '12 Maple Street', requesterEmail: 'technician@example.invalid', expiresAt: '2030-01-01T00:00:00Z',
        state, canConnect: true, canSync: true, meters: discovered ? meters : [], version, selectedStream });
      if (b.action === 'start') { assert.equal(b.consent, true); state = 'select_meter'; version = 1;
        return reply({ auth_url: 'https://www.myaccount.hydroone.com/mga/sps/oauth/oauth20/authorize?state=fixture' }); }
      if (b.action === 'discover') { discovered = true; return reply({ state: 'select_meter', meters, version }); }
      if (b.action === 'select') { assert.equal(b.stream, meters[0].id); assert.equal(b.confirmed, true); assert.equal(b.version, version); state = 'connected'; selectedStream = b.stream; version++; return reply({ status: 'selected' }); }
      if (b.action === 'sync') return reply({ state: 'available' });
      if (b.action === 'disconnect') { revoked = true; return reply({ status: 'disconnected', providerRevocationRequired: true }); }
      throw Error('Unexpected action');
    });
    await context.route('https://www.myaccount.hydroone.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Hydro One authorization</title>' }));
    await page.goto(`${base}/utility/?environment=development&invitation=${id}#invite=${token}`);
    await page.getByRole('button', { name: 'Continue to Hydro One', exact: true }).waitFor();
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    assert.equal(await page.getByRole('button', { name: 'Continue to Hydro One', exact: true }).isEnabled(), false);
    assert.deepEqual(calls.map(c => c.action), ['status']);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(out, `consent-${width}-${scale}.png`), fullPage: true });
    const consent = page.getByRole('checkbox'); await consent.check();
    const connect = page.getByRole('button', { name: 'Continue to Hydro One', exact: true }); await connect.focus(); await page.keyboard.press('Enter');
    await page.waitForURL('https://www.myaccount.hydroone.com/**');
    assert.equal(calls.filter(c => c.action === 'start').length, 1);
    await page.goto(`${base}/utility/?environment=development&invitation=${id}&status=authorized`);
    await page.getByRole('button', { name: 'Find authorized meters', exact: true }).waitFor();
    assert.equal(calls.filter(c => c.action === 'discover').length, 0); // callback is read-only
    await page.getByRole('button', { name: 'Find authorized meters', exact: true }).click();
    const first = page.locator('.meter').first(); await first.getByRole('button', { name: 'Confirm this meter', exact: true }).waitFor();
    assert.equal(await first.getByRole('button', { name: 'Confirm this meter', exact: true }).isEnabled(), false);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(out, `meters-${width}-${scale}.png`), fullPage: true });
    await first.getByRole('checkbox').check(); await first.getByRole('button', { name: 'Confirm this meter', exact: true }).click();
    await page.getByText('Selected for this site', { exact: true }).waitFor();
    assert.equal(calls.filter(c => c.action === 'sync').length, 0);
    await page.getByRole('button', { name: 'Synchronize completed-day readings', exact: true }).click();
    await page.getByText('Readings saved. You can close this page and return to your technician.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Disconnect utility sharing', exact: true }).click();
    await page.getByRole('heading', { name: 'Disconnected from Moose Energy', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.length), 0);
    await page.goto(`${base}/utility/?environment=development&invitation=${id}#invite=${token}`);
    await page.getByRole('alert').filter({ hasText: 'expired or was cancelled' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Continue to Hydro One', exact: true }).count(), 0);
    assert.deepEqual(errors, []); checks.push({ width, scale, customerWithoutAccount: true, exactSite: true, fragmentRemoved: true, explicitConsent: true, explicitMeter: true, expiryDenied: true });
    await context.close();
  }
  const context = await browser.newContext(), page = await context.newPage(); let requests = 0;
  await context.route('**/functions/v1/**', route => { requests++; return route.abort(); });
  await page.goto(`${base}/utility/?environment=development&invitation=${id}`);
  await page.getByRole('alert').filter({ hasText: 'original invitation' }).waitFor(); assert.equal(requests, 0);
  await page.goto(`${base}/utility/?environment=development&invitation=${id}#invite=v1.11111111-1111-4111-8111-111111111111.fixture`);
  await page.getByRole('alert').filter({ hasText: 'original invitation' }).waitFor(); assert.equal(requests, 0);
  assert.equal(new URL(page.url()).hash, ''); checks.push({ missingAndCrossInvitationSessionDenied: true }); await context.close();
  await writeFile(resolve(out, 'acceptance.json'), JSON.stringify({ passed: checks.length, syntheticApiOnly: true, checks }, null, 2));
  console.log(`${checks.length} customer utility browser journeys passed.`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
