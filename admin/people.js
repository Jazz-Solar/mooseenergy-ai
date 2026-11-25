import { escapeHtml as e } from './site-access.js?v=20261105-1';
const text = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compare = (a,b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric:true, sensitivity:'base' });
const date = value => value ? new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '—';
const vendors = {fronius:'Fronius',enphase:'Enphase',solaredge:'SolarEdge',hoymiles:'Hoymiles',demo:'Demo'};
export function connectedSites(user) {
  const rows = Array.isArray(user.connected_sites) ? user.connected_sites : (user.systems ?? []).map((name,i)=>({id:`legacy-${i}`,name}));
  return [...new Map(rows.map(s=>[s.id,s])).values()].map(s=>({...s,name:s.name || s.id, vendor:vendors[s.provider] || s.provider || ''}));
}
export function selectAccounts(users, query='', sort='seen-desc') {
  const needle=text(query.trim());
  return users.filter(u=>!needle || text([u.name,u.email,u.role,...connectedSites(u).flatMap(s=>[s.id,s.name,s.vendor])].join(' ')).includes(needle)).sort((a,b)=>{
    let result=0;
    if(sort==='name-asc' || sort==='name-desc')result=compare(a.name || a.email,b.name || b.email)*(sort==='name-desc'?-1:1);
    else if(sort==='email-asc')result=compare(a.email,b.email);
    else if(sort==='role-asc')result=compare(a.role,b.role);
    else if(sort==='sites-desc' || sort==='sites-asc')result=(connectedSites(a).length-connectedSites(b).length)*(sort==='sites-desc'?-1:1);
    else if(sort==='joined-desc')result=compare(b.created_at,a.created_at);
    else if(sort==='logins-desc')result=(b.logins_7d || 0)-(a.logins_7d || 0);
    else result=compare(b.last_sign_in_at,a.last_sign_in_at);
    return result || compare(a.email,b.email) || compare(a.id,b.id);
  });
}
export function selectSites(sites, query='', sort='name-asc') {
  const needle=text(query.trim());
  return sites.filter(s=>text([s.name,s.vendor,s.id].join(' ')).includes(needle)).sort((a,b)=>
    (sort==='vendor-asc' ? compare(a.vendor,b.vendor) : 0) || compare(a.name,b.name)*(sort==='name-desc'?-1:1) || compare(a.id,b.id));
}
export function mountPeople(root, initial, onFeedback) {
  let users=initial.users ?? [], query='', sort='seen-desc';
  const expanded=new Set(), siteState=new Map();
  root.innerHTML=`<div class="people-toolbar"><div><label for="people-search">Search accounts</label><input id="people-search" type="search" placeholder="Name, email, role or connected site" autocomplete="off"></div>
    <div><label for="people-sort">Sort accounts</label><select id="people-sort"><option value="seen-desc">Last seen · newest first</option><option value="name-asc">Name · A–Z</option><option value="name-desc">Name · Z–A</option><option value="email-asc">Email · A–Z</option><option value="role-asc">Role · A–Z</option><option value="sites-desc">Connected sites · most first</option><option value="sites-asc">Connected sites · fewest first</option><option value="joined-desc">Joined · newest first</option><option value="logins-desc">Logins in 7 days · most first</option></select></div></div>
    <p class="people-count" role="status" data-people-count></p><div class="card scroll people-table-wrap" role="region" aria-label="Accounts" tabindex="0"><table id="users"><thead><tr>
    <th scope="col">User</th><th scope="col">Role</th><th scope="col">Connected sites</th><th scope="col" class="right">Logins 7d</th><th scope="col" class="right hide-sm">30d</th><th scope="col" class="right">Feedback</th><th scope="col" class="hide-sm">Last seen</th><th scope="col" class="hide-sm">Joined</th></tr></thead><tbody></tbody></table></div>`;
  const tbody=root.querySelector('tbody');
  const stateFor=id=>siteState.get(id) || {query:'',sort:'name-asc'};
  function siteItems(user) {
    const state=stateFor(user.id), all=connectedSites(user), sites=selectSites(all,state.query,state.sort);
    return `<p class="people-count" role="status">${sites.length} of ${all.length} sites</p><ul class="people-sites">${sites.map(s=>`<li><strong>${e(s.name)}</strong>${s.vendor?`<span>${e(s.vendor)}</span>`:''}<small>${s.id.startsWith('legacy-')?'':e(s.id)}</small></li>`).join('')}</ul>${sites.length?'':'<p class="access-empty">No sites match your search.</p>'}`;
  }
  function render() {
    const rows=selectAccounts(users,query,sort);
    root.querySelector('[data-people-count]').textContent=`${rows.length} of ${users.length} accounts`;
    tbody.innerHTML=rows.map((u,i)=>{
      const sites=connectedSites(u), open=expanded.has(u.id), state=stateFor(u.id), label=u.name || u.email || 'this account';
      return `<tr data-person="${e(u.id)}"><td><b>${e(u.name) || '—'}</b><br><span class="dimmer">${e(u.email)}</span></td><td data-label="Role"><span class="pill ${['owner','technician','admin'].includes(u.role)?u.role:''}">${e(u.role)}</span></td>
      <td data-label="Connected sites">${sites.length?`<button type="button" class="people-link" data-sites="${e(u.id)}" aria-expanded="${open}" aria-controls="person-sites-${i}" aria-label="${open?'Hide':'Show'} ${sites.length} sites for ${e(label)}">${sites.length} ${sites.length===1?'site':'sites'} <span aria-hidden="true">${open?'▴':'▾'}</span></button>`:'<span class="dim">0 sites</span>'}</td>
      <td class="right" data-label="Logins 7d">${e(u.logins_7d ?? 0)}</td><td class="right hide-sm">${e(u.logins_30d ?? 0)}</td><td class="right" data-label="Feedback">${u.feedback_count?`<button type="button" class="people-link" data-feedback="${e(u.id)}" aria-label="View feedback from ${e(label)}">${e(u.feedback_count)}</button>`:'—'}</td><td class="hide-sm dim">${e(date(u.last_sign_in_at))}</td><td class="hide-sm dim">${e(date(u.created_at))}</td></tr>
      ${sites.length?`<tr id="person-sites-${i}" class="people-site-row" ${open?'':'hidden'}><td colspan="8"><section class="people-site-panel" data-site-panel="${e(u.id)}" aria-label="Sites connected to ${e(label)}">
      <div class="people-toolbar"><div><label for="site-search-${i}">Search connected sites</label><input id="site-search-${i}" type="search" data-site-search="${e(u.id)}" placeholder="Site name, vendor or ID" value="${e(state.query)}"></div><div><label for="site-sort-${i}">Sort connected sites</label><select id="site-sort-${i}" data-site-sort="${e(u.id)}">${[['name-asc','Name · A–Z'],['name-desc','Name · Z–A'],['vendor-asc','Vendor · A–Z']].map(([value,label])=>`<option value="${value}" ${state.sort===value?'selected':''}>${label}</option>`).join('')}</select></div></div><div data-site-items>${open?siteItems(u):''}</div></section></td></tr>`:''}`;
    }).join('') || '<tr><td colspan="8" class="access-empty">No accounts match your search.</td></tr>';
  }
  function click(event) {
    const toggle=event.target.closest('[data-sites]'), feedback=event.target.closest('[data-feedback]');
    if(toggle) {
      const id=toggle.dataset.sites;
      if(expanded.has(id))expanded.delete(id);else expanded.add(id);
      render();
      [...root.querySelectorAll('[data-sites]')].find(b=>b.dataset.sites===id)?.focus();
    }
    if(feedback){const user=users.find(u=>u.id===feedback.dataset.feedback);if(user)onFeedback(user);}
  }
  function change(event) {
    const el=event.target;
    if(el.id==='people-search'){query=el.value;render();}
    else if(el.id==='people-sort'){sort=el.value;render();}
    else if(el.dataset.siteSearch || el.dataset.siteSort){
      const id=el.dataset.siteSearch || el.dataset.siteSort, state={...stateFor(id)};
      if(el.dataset.siteSearch)state.query=el.value;else state.sort=el.value;
      siteState.set(id,state);
      const user=users.find(u=>u.id===id);if(user)el.closest('[data-site-panel]').querySelector('[data-site-items]').innerHTML=siteItems(user);
    }
  }
  root.addEventListener('click',click);root.addEventListener('input',change);render();
  return {update(data){users=data.users ?? [];render();},destroy(){root.removeEventListener('click',click);root.removeEventListener('input',change);root.replaceChildren();expanded.clear();siteState.clear();}};
}
