import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createPresentationServer } from '../scripts/preview-production.mjs';
import { environments } from '../admin/environments.js';
import { functionEndpoint } from '../admin/function-endpoint.js';

async function preview(t, fetchImpl) {
  const server = await createPresentationServer({ fetchImpl });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    post: (path, overrides = {}) => fetch(origin + path, {
      method: 'POST', body: JSON.stringify({ action: 'list', input: { view: 'reviews' } }),
      ...overrides,
      headers: { origin, authorization: 'Bearer fixture-user-jwt', 'content-type': 'application/json', ...overrides.headers },
    }),
  };
}

test('local relay preserves user authorization and environment while returning upstream errors faithfully', async t => {
  const calls = [];
  const app = await preview(t, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Staff access required.' } },
      { status: 403, headers: { 'x-request-id': 'fixture-request', 'retry-after': '2' } });
  });
  for (const [name, environment] of Object.entries(environments)) {
    const response = await app.post(`/__admin-api/${name}/staff-site-access`, {
      headers: { apikey: 'client-cannot-change-project-key', cookie: 'not-forwarded=true' },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('x-request-id'), 'fixture-request');
    assert.equal(response.headers.get('retry-after'), '2');
    assert.equal((await response.json()).error.code, 'FORBIDDEN');
    const call = calls.at(-1);
    assert.equal(call.url, `${environment.url}/functions/v1/staff-site-access`);
    assert.deepEqual(call.options.headers, {
      authorization: 'Bearer fixture-user-jwt', apikey: environment.key, 'content-type': 'application/json',
    });
    assert.equal(call.options.redirect, 'error');
    assert.deepEqual(JSON.parse(call.options.body), { action: 'list', input: { view: 'reviews' } });
  }
});

test('relay rejects foreign origins, unapproved routes, missing login and oversized input before contacting Supabase', async t => {
  let calls = 0;
  const app = await preview(t, async () => { calls++; return Response.json({}); });
  const path = '/__admin-api/production/staff-site-access';
  for (const [target, overrides, status] of [
    [path, { headers: { origin: 'https://another-site.invalid' } }, 403],
    [path, { headers: { origin: '' } }, 403],
    [path, { headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    [path, { headers: { authorization: '' } }, 401],
    [path, { headers: { 'content-type': 'text/plain' } }, 415],
    [path, { body: 'x'.repeat(65537) }, 413],
    [path, { method: 'GET', body: undefined }, 405],
    ['/__admin-api/production/arbitrary-function', {}, 404],
    ['/__admin-api/unrecognized/admin-stats', {}, 404],
    [path + '?url=https://another-site.invalid', {}, 404],
  ]) {
    const response = await app.post(target, overrides);
    assert.equal(response.status, status, `${target}: ${JSON.stringify(overrides.headers ?? overrides.method ?? status)}`);
    await response.arrayBuffer();
  }
  // fetch controls Host itself; use a raw HTTP request to exercise DNS rebinding.
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(app.origin + path, { method: 'POST', headers: { host: 'rebinding.invalid', origin: app.origin } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(hostStatus, 403);
  const chunkedStatus = await new Promise((resolve, reject) => {
    const req = request(app.origin + path, { method: 'POST', headers: {
      origin: app.origin, authorization: 'Bearer fixture-user-jwt', 'content-type': 'application/json',
    } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('x'.repeat(65537)); req.end();
  });
  assert.equal(chunkedStatus, 413);
  assert.equal(calls, 0);
});

test('only the optional local server enables the relay and serves portal assets', async t => {
  const app = await preview(t, async () => { throw new Error('No upstream request expected'); });
  const response = await fetch(app.origin + '/admin/?environment=production');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes('<meta name="moose-local-proxy" content="enabled" />'));
  assert.ok(html.includes("import { functionEndpoint } from './function-endpoint.js'"));
  const script = await fetch(app.origin + '/admin/function-endpoint.js?v=presentation');
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  const root = await fetch(app.origin, { redirect: 'manual' });
  assert.equal(root.headers.get('location'), '/admin/?environment=production');
  for (const path of ['/.env', '/.git/config', '/package.json', '/scripts/preview-production.mjs']) {
    assert.equal((await fetch(app.origin + path)).status, 404);
  }
  const local = new URL(app.origin);
  const prod = { ...environments.production, name: 'production' };
  const remote = `${prod.url}/functions/v1/staff-site-access`;
  assert.equal(functionEndpoint(prod, 'staff-site-access', local), remote);
  assert.equal(functionEndpoint(prod, 'staff-site-access', local, true), '/__admin-api/production/staff-site-access');
  assert.equal(functionEndpoint(prod, 'staff-site-access', new URL('https://mooseenergy.ai'), true), remote);
});

test('network errors show a bounded diagnostic without upstream secrets', async t => {
  const app = await preview(t, async () => { throw new Error('sensitive upstream details'); });
  const response = await app.post('/__admin-api/production/admin-stats');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.message, 'The local preview could not reach Supabase. Try again.');
});
