import { escapeHtml as e } from './site-access.js?v=20260914-fit-rates-1';

export function solarWebSiteUrl(systemId) {
  const match = /^f:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(systemId ?? ''));
  return match ? `https://www.solarweb.com/PvSystems/PvSystem?pvSystemId=${match[1].toLowerCase()}` : null;
}

export function providerSiteLink(systemId, name) {
  const url = solarWebSiteUrl(systemId);
  return url ? `<a class="site-provider-link" href="${e(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${e(name)} in Solar.web (new tab)">Open in Solar.web ↗</a>` : '';
}

export function mountConnectedAccounts(root, call, systemId, open = false) {
  let alive = true, generation = 0, loading = false, loaded = false;
  root.innerHTML = `<details class="site-accounts" ${open ? 'open' : ''}><summary>Connected accounts</summary><div data-accounts-content></div></details>`;
  const details = root.querySelector('details'), summary = root.querySelector('summary'), content = root.querySelector('[data-accounts-content]');
  async function load() {
    if (!alive || loading) return;
    const ticket = ++generation;
    loading = true;
    content.innerHTML = '<p role="status">Loading connected accounts…</p>';
    try {
      // The staff assignment directory is paginated and searches several fields.
      // Read every page, then retain only this exact site's connected accounts.
      const accounts = new Map();
      let offset = 0;
      while (true) {
        const response = await call('staff-site-access', { action: 'list', input: { view: 'assignments', search: systemId, status: 'connected', offset } });
        if (!alive || ticket !== generation) return;
        const data = response.data;
        if (!Array.isArray(data?.rows)) throw new Error('Account list is unavailable.');
        for (const account of data.rows) {
          if (account.system_id === systemId && account.status === 'connected' && account.user_id) accounts.set(account.user_id, account);
        }
        if (!data.hasMore) break;
        if (!Number.isInteger(data.limit) || data.limit <= 0 || data.offset !== offset || offset + data.limit > 100000) throw new Error('The complete account list could not be loaded.');
        offset += data.limit;
      }
      const rows = [...accounts.values()];
      summary.textContent = `Connected accounts (${rows.length})`;
      content.innerHTML = rows.length ? `<div class="site-account-scroll" role="region" aria-label="Connected accounts" tabindex="0"><ul>${rows.map(account => `<li><strong>${e(account.customer_name || 'Unnamed account')}</strong><span>${e(account.customer_email || 'Email unavailable')}</span><small>${e(({ owner: 'Owner', technician: 'Technician', admin: 'Admin' })[account.role] || 'Account')}${account.effective_access === false ? ' · Access inactive' : ''}</small></li>`).join('')}</ul></div>` : '<p>No accounts are connected to this site.</p>';
      loaded = true;
    } catch (error) {
      if (alive && ticket === generation) {
        summary.textContent = 'Connected accounts';
        content.innerHTML = `<p role="alert">Could not load connected accounts. ${e(error.message)}</p><button type="button" data-accounts-retry>Retry accounts</button>`;
      }
    } finally { if (ticket === generation) loading = false; }
  }
  const toggle = () => { if (details.open && !loaded) void load(); };
  const click = event => { if (event.target.closest('[data-accounts-retry]')) void load(); };
  details.addEventListener('toggle', toggle);
  root.addEventListener('click', click);
  if (open) void load();
  return { destroy() { alive = false; ++generation; details.removeEventListener('toggle', toggle); root.removeEventListener('click', click); root.replaceChildren(); } };
}
