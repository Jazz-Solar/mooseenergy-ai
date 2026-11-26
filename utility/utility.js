import { selectEnvironment } from '../admin/environments.js';

const el = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const invitation = params.get('invitation');
let env, token, storageKey, busy = false, current = null;
const callbackError = params.get('status') === 'error';
// Email apps may reuse this tab and navigate only its fragment. Reinitialize
// the capability in that case, and revalidate pages restored from back/forward.
addEventListener('hashchange', () => { if (new URLSearchParams(location.hash.slice(1)).has('invite')) location.reload(); });
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
function node(tag, text, parent, className) {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (className) n.className = className;
  parent?.append(n);
  return n;
}
function button(label, parent, work, secondary = false) {
  const b = node('button', label, parent, secondary ? 'secondary' : '');
  b.type = 'button'; b.addEventListener('click', () => run(work));
  return b;
}
function confirmation(label, parent) {
  const field = node('label', null, parent, 'confirmation');
  const input = node('input', null, field); input.type = 'checkbox';
  node('span', label, field);
  return input;
}
async function call(action, extra = {}) {
  const response = await fetch(`${env.url}/functions/v1/utility-invitation`, {
    method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(55000),
    headers: { 'content-type': 'application/json', apikey: env.key }, body: JSON.stringify({ action, token, ...extra }),
  });
  const value = await response.json();
  if (!response.ok) {
    if ([403, 404].includes(response.status)) {
      current = null; el('content').replaceChildren();
      node('p', 'This invitation is unavailable. Ask the technician to check it or send a new link.', el('content'));
    }
    throw Error(value?.error?.message || 'Could not complete this step. Please try again.');
  }
  return value.data;
}
async function refresh() { current = await call('status'); render(); }
async function run(work) {
  if (busy) return;
  busy = true; el('error').textContent = ''; el('message').textContent = '';
  document.querySelectorAll('button,input').forEach(n => n.disabled = true);
  try { await work(); }
  catch (error) { el('error').textContent = error.message || 'Could not complete this step. Please try again.'; }
  finally {
    busy = false;
    document.querySelectorAll('button,input').forEach(n => n.disabled = n.dataset.requiresConfirmation === 'true');
    document.querySelectorAll('input[type=checkbox]').forEach(n => { n.checked = false; });
  }
}
function render() {
  const r = current, root = el('content'); root.replaceChildren();
  const site = node('div', null, root, 'site');
  node('h2', r.siteName || 'Your connected site', site);
  node('p', r.siteAddress || 'Address not supplied. Confirm the site with your technician before continuing.', site);
  node('p', `Requested by ${r.requesterEmail}`, site, 'muted');
  node('p', `Private link expires ${new Date(r.expiresAt).toLocaleString()}.`, site, 'muted');
  if (r.state === 'awaiting_customer' || r.state === 'uncertain') {
    node('h3', r.state === 'uncertain' ? 'Authorize Hydro One again' : '1. Authorize your Hydro One account', root);
    node('p', 'Moose Energy will receive the utility data you authorize through Hydro One. After you confirm a meter, its readings will be available to the authorized users of this site and Moose Energy support staff. Other authorized meters will not be shown to the technician.', root);
    node('p', 'Anyone with this private link can complete this request. If you do not recognize the site or requester, do not continue.', root, 'muted');
    if (r.canConnect) {
      const check = confirmation('I hold this Hydro One account, recognize this site and agree to share the selected meter’s readings with its authorized users and Moose Energy support staff.', root);
      const connect = button('Continue to Hydro One', root, async () => {
        if (!check.checked) throw Error('Confirm the site and sharing notice first.');
        const result = await call('start', { consent: true });
        const url = new URL(result.auth_url);
        if (url.origin !== 'https://www.myaccount.hydroone.com' || url.pathname !== '/mga/sps/oauth/oauth20/authorize') throw Error('Hydro One authorization is unavailable.');
        location.assign(url.href);
      });
      connect.dataset.requiresConfirmation = 'true'; connect.disabled = true;
      check.addEventListener('change', () => { connect.disabled = busy || !check.checked; });
    } else node('p', 'Hydro One connection is not available for this site yet. Your technician can check its pilot access.', root);
  } else if (r.state === 'refreshing') {
    node('p', 'A utility connection update is in progress. Check again shortly.', root);
  } else {
    node('h3', r.state === 'connected' ? 'Your meter is connected' : '2. Confirm the meter for this site', root);
    node('p', 'Match the meter information below to your Hydro One account and this installation. Moose Energy does not automatically verify that a meter belongs to the address shown above. If you cannot identify it, stop and check with your technician.', root);
    if (r.state === 'connected') node('p', 'The technician can now synchronize and view the selected meter’s readings for this site.', root, 'badge');
    if (r.canSync) {
      button('Find authorized meters', root, async () => {
        const result = await call('discover'); await refresh();
        if (result.state !== 'select_meter') el('message').textContent = syncMessage(result.state);
      }, true);
      for (const meter of r.meters || []) {
        const item = node('div', null, root, 'meter');
        node('h3', meter.label || 'Authorized meter', item);
        node('p', `Meter reference: ${meter.meter}`, item);
        node('p', meter.direction === 'export' ? 'Grid export' : 'Grid import', item, 'muted');
        if (meter.id === r.selectedStream) { node('p', 'Selected for this site', item, 'badge'); continue; }
        const check = confirmation('I have checked that this meter belongs to the site above.', item);
        const select = button('Confirm this meter', item, async () => {
          if (!check.checked) throw Error('Confirm that the meter belongs to this site.');
          await call('select', { stream: meter.id, version: r.version, confirmed: true });
          await refresh(); el('message').textContent = 'Meter confirmed. Only this meter’s readings will be shared for this site.';
        });
        select.dataset.requiresConfirmation = 'true'; select.disabled = true;
        check.addEventListener('change', () => { select.disabled = busy || !check.checked; });
      }
      if (!r.meters?.length) node('p', 'Find authorized meters to continue. If Hydro One is still preparing the data, try again later.', root, 'muted');
      if (r.state === 'connected') button('Synchronize completed-day readings', root, async () => {
        const result = await call('sync'); await refresh(); el('message').textContent = syncMessage(result.state);
      });
    } else node('p', 'Meter synchronization is not available for this site yet.', root);
    node('p', 'Grid import and export are separate from solar production. A zero export reading does not mean the solar system produced nothing.', root, 'muted');
  }
  button('Check connection status', root, refresh, true);
  if (r.state !== 'awaiting_customer') {
    const controls = node('div', null, root);
    button('Disconnect utility sharing', controls, async () => {
      await call('disconnect'); sessionStorage.removeItem(storageKey); token = null; current = null;
      root.replaceChildren(); node('h2', 'Disconnected from Moose Energy', root);
      node('p', 'This invitation is now cancelled. Also revoke Moose access in Hydro One MyAccount → Green Button.', root);
    }, true);
  }
}
function syncMessage(state) {
  return ({ available: 'Readings saved. You can close this page and return to your technician.', pending: 'Hydro One readings are not ready yet. Try again later.',
    temporarily_unavailable: 'Hydro One is temporarily unavailable. Your authorization is saved; try again later.',
    revoked: 'Hydro One access needs authorization again.', invalid_feed: 'Hydro One returned readings that could not be validated. Please try later.' })[state] || 'Check the connection status to continue.';
}
try {
  env = selectEnvironment(location.search, location.hostname);
  el('environment').textContent = env.name === 'development' ? 'Development' : '';
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(invitation || '')) throw Error('Open the private link in your invitation email.');
  storageKey = `moose-utility-${env.name}-${invitation}`;
  const incoming = new URLSearchParams(location.hash.slice(1)).get('invite');
  token = incoming || sessionStorage.getItem(storageKey);
  // Strip the bearer capability before any request. It never enters a query,
  // browser referrer, analytics event, localStorage or a Moose Auth session.
  params.delete('status'); params.delete('error');
  history.replaceState(null, '', `${location.pathname}?${params}`);
  if (incoming) sessionStorage.setItem(storageKey, incoming);
  if (!token || token.split('.')[1] !== invitation) throw Error('Open the original invitation email in this browser to continue.');
  await run(refresh);
  if (callbackError && current) el('message').textContent = 'Hydro One authorization was not completed. You can try again when ready.';
} catch (error) {
  history.replaceState(null, '', location.pathname + location.search);
  el('content').replaceChildren(); el('error').textContent = error.message || 'This invitation could not be opened.';
}
