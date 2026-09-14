import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { environments, selectEnvironment } from '../admin/environments.js';
import { createSessionBoundary } from '../admin/session-boundary.js';
import { escapeHtml, safePermissionsUrl } from '../admin/site-access.js';

test('development defaults and isolated sessions use pinned public keys', async () => {
  assert.equal(selectEnvironment('').name,'development');
  assert.notEqual(selectEnvironment('').storageKey,selectEnvironment('?environment=production').storageKey);
  assert.throws(()=>selectEnvironment('?environment=https://evil.invalid'));
  const pins=JSON.parse(await readFile(new URL('../../Mooose/config/public-key-pins.json',import.meta.url)));
  for(const [env,config] of Object.entries(environments)) {
    assert.ok(pins[env].includes(createHash('sha256').update(config.key).digest('hex')));
    if(config.key.startsWith('ey'))assert.equal(JSON.parse(Buffer.from(config.key.split('.')[1],'base64url')).role,'anon');
  }
});
test('old private responses are invalidated across sign-out and account switching', () => {
  const boundary=createSessionBoundary(), ticket=boundary.capture();
  assert.equal(boundary.current(ticket),true);boundary.reset();assert.equal(boundary.current(ticket),false);
  assert.equal(boundary.current(boundary.capture()),true);
});
test('evidence is rendered as text and permission links must point to the exact Solar.web site', () => {
  const system='f:cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  assert.equal(escapeHtml('<script>alert("x")</script>'),'&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  for(const link of ['javascript:alert(1)',`https://evil.invalid/${system.slice(2)}`,`https://solarweb.com.evil.invalid/${system.slice(2)}`,`https://user:pass@solarweb.com/${system.slice(2)}`,'https://solarweb.com/another-site'])assert.equal(safePermissionsUrl(link,system),null);
  assert.ok(safePermissionsUrl(`https://www.solarweb.com/Permissions/${system.slice(2)}`,system));
});
