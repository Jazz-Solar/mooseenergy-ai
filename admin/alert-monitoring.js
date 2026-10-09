import { providerSiteLink, mountConnectedAccounts } from './site-context.js?v=20261009-site-context-1';
import { escapeHtml as e } from './site-access.js?v=20260914-fit-rates-1';

export const alertStates = {
  watching: 'Watching · 48-hour window', ready: 'Daily reminders', blocked: 'Needs attention',
  monitoring: 'Monitoring · no qualifying issue', awaiting_evidence: 'Waiting for valid evidence', not_connected: 'Disconnected',
};
const blockers = {
  collection_paused: 'Scheduled checks are paused.', hourly_paused: 'Hourly checks are paused.',
  setup_pending: 'Monitoring setup is pending.', alerts_not_enrolled: 'Alert enrollment needs attention.',
  daylight_unavailable: 'Valid sunrise and sunset times are missing.', readings_overdue: 'Daytime readings are overdue.',
};
const date = value => value ? new Date(value).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'Not yet';
export const observedHours = value => Math.max(0, Number(value) || 0).toFixed(1);
export function alertTiming(row) {
  if (row.state === 'not_connected') return 'Checks stop when a site is disconnected.';
  if (row.blockers.length) return row.blockers.map(code => blockers[code] || 'Monitoring configuration needs attention.').join(' ');
  if (row.emailEligibleNow) {
    if (row.recipients.some(r => r.queued > 0)) return 'Notification queued for delivery.';
    if (row.recipients.some(r => r.due)) return 'Eligible for notification on the next delivery cycle.';
    return 'Daily reminder interval is running.';
  }
  if (row.state === 'ready') return 'Qualified; waiting for a fresh daylight check before sending.';
  if (row.state === 'watching') return 'Continued daytime readings must confirm the same issue for 48 hours.';
  if (row.state === 'awaiting_evidence') return row.incidentId ? 'An open warning needs current qualifying inverter readings.' : 'Waiting for the first valid monitoring check.';
  return 'Automatic checks are active. A new issue will start its own 48-hour window.';
}

export function mountAlertMonitoring(root, call) {
  let alive = true, generation = 0, offset = 0, next = null, loading = false, accountPanels = [];
  root.innerHTML = `<div class="alerts-heading"><div><h2>Alert monitoring</h2><p>See which sites are being checked, approaching 48 hours, or receiving daily reminders.</p></div><span class="alerts-live">Hourly daylight checks</span></div>
    <div class="alerts-policy"><strong>48 hours to qualify · at least 24 hours between emails</strong><p>Jon, monitoring and Glani receive ongoing-incident alerts until recovery. Nighttime does not count as underproduction. Existing issues can carry a separately reviewed historical qualification.</p><p data-alert-enrollment></p></div>
    <div class="alerts-summary" aria-label="Monitoring summary" data-alert-summary></div>
    <form class="rates-toolbar" data-alert-filter><div><label for="alert-search">Search sites</label><input id="alert-search" type="search" maxlength="200" placeholder="Site name"></div><div><label for="alert-state">Monitoring status</label><select id="alert-state"><option value="">All sites</option>${Object.entries(alertStates).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><button>Refresh monitoring</button></form>
    <p data-alert-message role="status" class="access-message"></p><p data-alert-updated class="alerts-updated"></p><div data-alert-rows></div>
    <div class="rates-pager"><button type="button" data-alert-prev disabled>Previous</button><span data-alert-page></span><button type="button" data-alert-next disabled>Next</button></div>`;
  const $ = selector => root.querySelector(selector);
  function clearAccounts() { accountPanels.forEach(panel => panel.destroy()); accountPanels = []; }
  function render(data, expanded, expandedAccounts) {
    clearAccounts();
    next = data.nextOffset;
    $('[data-alert-summary]').innerHTML = [['watching','In the 48-hour window'],['ready','Daily reminders'],['blocked','Need attention'],['monitoring','Monitoring']].map(([state,label]) =>
      `<button type="button" class="alerts-total" data-alert-status="${state}" aria-pressed="${$('#alert-state').value === state}"><strong>${Number(data.summary?.[state] || 0)}</strong><span>${label}</span></button>`).join('');
    $('[data-alert-enrollment]').textContent = data.policy.automaticEnrollment
      ? 'New connected sites enroll automatically. Any missing setup appears here.' : 'Automatic enrollment is paused. New sites need attention.';
    $('[data-alert-updated]').textContent = `Updated ${date(data.generatedAt)} · Times shown in your local timezone · Refreshes every minute while open`;
    $('[data-alert-rows]').innerHTML = data.items.length ? data.items.map(row => `<article class="alerts-site">
      <div class="alerts-site-title"><h3>${e(row.siteName)}</h3><span class="alerts-badge ${e(row.state)}">${e(alertStates[row.state] || 'Unavailable')}</span></div>
      ${providerSiteLink(row.systemId, row.siteName)}
      <p class="alerts-timing">${e(alertTiming(row))}</p>
      <div class="alerts-checks"><span><small>Last checked</small>${e(date(row.lastCheckedAt))}</span><span><small>Next check</small>${e(row.nextCheckAt ? date(row.nextCheckAt) : row.enrolled ? 'Next daylight window' : 'Awaiting setup')}</span><span><small>Affected inverters being tracked</small>${row.devices.length}</span></div>
      ${!row.modelAvailable ? '<p class="alerts-note">Underproduction comparisons need model configuration. Offline checks can continue when daylight times are available.</p>' : ''}
      ${row.devices.map(device => `<div class="alerts-device"><div><strong>${e(device.name)}</strong><span>${device.condition === 'offline' ? 'Offline' : 'Below 70% of expected output'}</span></div>
        ${device.prequalified ? `<div class="alerts-proof"><strong>Prequalified from history</strong><span>Issue evidence since ${e(date(device.historicalFirstObservedAt))}</span></div>` : `<div class="alerts-progress"><span>${observedHours(device.observedHours)} / 48 hours verified</span><progress max="48" value="${Math.min(48, Math.max(0, Number(device.observedHours) || 0))}" aria-label="Verified issue duration for ${e(device.name)}"></progress><small>${device.mature ? '48-hour requirement met' : `Earliest qualification ${e(date(device.qualifiesAt))}, if checks continue`}</small></div>`}
        <small>Latest issue reading ${e(date(device.lastObservedAt))}${device.fresh ? '' : ' · awaiting a fresh check'}</small></div>`).join('')}
      <div data-connected-site="${e(row.systemId)}"></div>
      <details data-alert-site="${e(row.systemId)}" ${expanded.has(row.systemId) ? 'open' : ''}><summary>Notification history and recipients</summary>
        <div class="alerts-recipients">${row.recipients.map(recipient => `<div><strong>${e(recipient.email)}</strong><span>Last sent: ${e(date(recipient.lastSentAt))}</span><span>${recipient.queued ? 'Queued for delivery' : recipient.nextAllowedAt ? `Next email no earlier than ${e(date(recipient.nextAllowedAt))}` : 'First email after qualification and a fresh check'}</span>${recipient.uncertain ? '<span class="alerts-note">A delivery outcome needs verification; the daily limit still applies.</span>' : ''}</div>`).join('') || '<p>No operations recipients are enabled.</p>'}</div>
        <p class="alerts-note">One email per ongoing incident and recipient in any rolling 24 hours. A qualifying reading is checked again before sending. Missing readings can delay delivery.</p>
      </details></article>`).join('') : '<div class="access-empty">No sites match this view.</div>';
    accountPanels = [...root.querySelectorAll('[data-connected-site]')].map(node => mountConnectedAccounts(node, call, node.dataset.connectedSite, expandedAccounts.has(node.dataset.connectedSite)));
    $('[data-alert-page]').textContent = data.items.length ? `${offset + 1}–${offset + data.items.length} of ${data.total} sites` : 'No sites';
    $('[data-alert-prev]').disabled = offset === 0;
    $('[data-alert-next]').disabled = next == null;
  }
  async function load() {
    const ticket = ++generation;
    loading = true;
    $('[data-alert-message]').textContent = 'Loading monitoring status…';
    const expanded = new Set([...root.querySelectorAll('details[data-alert-site][open]')].map(node => node.dataset.alertSite));
    const expandedAccounts = new Set([...root.querySelectorAll('[data-connected-site]')].filter(node => node.querySelector('details[open]')).map(node => node.dataset.connectedSite));
    try {
      const response = await call('staff-site-access', { action:'alert_monitoring', input:{search:$('#alert-search').value.trim(),status:$('#alert-state').value,offset} });
      if (!alive || ticket !== generation) return;
      render(response.data, expanded, expandedAccounts);
      $('[data-alert-message]').textContent = '';
    } catch (err) {
      if (!alive || ticket !== generation) return;
      clearAccounts();
      $('[data-alert-rows]').replaceChildren();
      $('[data-alert-summary]').replaceChildren();
      $('[data-alert-updated]').textContent = '';
      $('[data-alert-page]').textContent = '';
      $('[data-alert-prev]').disabled = true;
      $('[data-alert-next]').disabled = true;
      $('[data-alert-message]').textContent = `Monitoring could not be loaded. ${err.message || 'Try refreshing.'}`;
    } finally { if (ticket === generation) loading = false; }
  }
  function submit(event) { event.preventDefault();offset = 0;void load(); }
  function click(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-alert-status')) { $('#alert-state').value = button.dataset.alertStatus;offset = 0;void load(); }
    else if (button.hasAttribute('data-alert-prev')) { offset = Math.max(0, offset - 50);void load(); }
    else if (button.hasAttribute('data-alert-next') && next != null) { offset = next;void load(); }
  }
  root.addEventListener('submit', submit);root.addEventListener('click', click);
  const timer = setInterval(() => { if (!root.hidden && !document.hidden && !loading) void load(); }, 60000);
  void load();
  return { refresh:load, destroy() { clearAccounts();alive = false;++generation;clearInterval(timer);root.removeEventListener('submit', submit);root.removeEventListener('click', click);root.replaceChildren(); } };
}
