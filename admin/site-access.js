import { rankSiteHints, siteLabel } from './site-hints.js?v=20260915-review-hints-1';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escapeHtml;
const date = value => value ? new Date(value).toLocaleString() : 'Not recorded';
const field = (name, label, type='text', value='', extra='') => `<div><label>${e(label)}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label></div>`;
const options = (values,selected='') => values.map(([v,l])=>`<option value="${e(v)}" ${v===selected?'selected':''}>${e(l)}</option>`).join('');
export function solarWebPermissionsUrl(systemId) {
  const id=String(systemId||'').replace(/^f:/,'');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? `https://www.solarweb.com/PvSystemSettings/Permissions?pvSystemId=${id.toLowerCase()}` : null;
}
export function safePermissionsUrl(value, systemId) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['solarweb.com','www.solarweb.com'].includes(url.hostname)
      && !url.username && !url.password && !url.hash && !url.port
      && url.href.toLowerCase().includes(String(systemId).replace(/^f:/,'').toLowerCase()) ? url.href : null;
  } catch { return null; }
}
const permissionLink = (verification, system) => {
  const url = safePermissionsUrl(verification?.permissionsUrl, system) || solarWebPermissionsUrl(system);
  return url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Open this site’s Solar.web permissions</a>` : 'Exact Solar.web permissions link not recorded';
};
const verificationSources = [['contract','Customer contract'],['install_record','Installation record'],['authorized_email','Authorized email'],['field_verification','Field verification']];
function verificationFields(previous={}) {
  return `<div class="access-fields">
    <div><label>Verified against<select name="source" aria-label="Verified against">${options([['','Choose a record'],...verificationSources],previous.source||'authorized_email')}</select></label></div>
    ${field('reference','Record reference','text',previous.reference||crypto.randomUUID(),'maxlength="1000" placeholder="Record or email reference"')}
    <div class="full"><label>Customer’s Solar.web permission<select name="permission" aria-label="Customer’s Solar.web permission">${options([['','Select the permission you observed'],['owner','Owner'],['supervisor','Supervisor'],['guest','Guest']],previous.permission||'guest')}</select></label></div>
    </div>
    <label class="access-check"><input name="providerChecked" type="checkbox"><span>I checked the supporting record and this site’s Solar.web permissions. The customer has the selected permission and JAZZ can view the site.</span></label>
    <input name="permissionsUrl" type="hidden">`;
}
function verification(data) {
  return { source:data.get('source'),reference:String(data.get('reference')||'').trim(),permission:data.get('permission'),
    providerStatus:data.has('providerChecked')?'visible':'unknown',permissionsUrl:data.get('permissionsUrl'),
    checkedNow:data.has('providerChecked') };
}
const status = value => `<span class="access-status ${e(value)}">${e(value)}</span>`;
const action = (value,label,css='') => `<button type="submit" name="action" value="${value}" class="${css}">${label}</button>`;

export function mountSiteAccess(root, call, initial) {
  let view='reviews', offset=0, alive=true, generation=0, rows=[], busy=false, sites=[], hasMore=false;
  const directories = new WeakMap();
  const suggestions = new WeakMap();
  let hintCatalog = null;
  const retryKeys = new Map();
  root.innerHTML = `<h2 class="access-heading">Site access</h2><p class="access-intro">Review what the customer submitted, then verify or deny their request.</p>
    <nav class="access-tabs" aria-label="Site access workspaces">${[['reviews','Requests'],['mappings','Assignments'],['assignments','Active access'],['history','History']].map(([v,l])=>`<button data-view="${v}" aria-pressed="${v===view}">${l}</button>`).join('')}</nav>
    <form class="access-toolbar" id="access-search"><div><label for="access-query">Search request ID, customer, site or address</label><input id="access-query" name="search" type="search" maxlength="200"></div><div><label for="access-filter">Status</label><select id="access-filter" name="status"></select></div><button>Search / refresh</button></form>
    <p role="status" aria-live="polite" class="access-message" id="access-message"></p>
    <div id="mapping-create"></div><div id="access-results"></div><dialog id="access-detail" aria-labelledby="access-detail-title"><div class="access-dialog-top"><strong id="access-detail-title">Review request</strong><button type="button" id="access-close" aria-label="Close review">Close</button></div><div id="access-detail-content"></div><p id="access-detail-message" role="status" aria-live="polite"></p></dialog>
    <div class="access-actions"><button class="secondary" id="access-prev">Previous</button><span id="access-page"></span><button class="secondary" id="access-next">Next</button></div>`;
  const $ = id => root.querySelector(`#${id}`);
  const message = value => { if(alive) { $('access-message').textContent=value; $('access-detail-message').textContent=value; } };

  const support = r => r.technician_preference==='custom' ? r.connection_setup?.technicianName || 'Customer’s technician' : r.technician_preference==='jazz' ? 'Moose Tech · JAZZ Solar' : r.preferred_technician_name || 'Not specified';
  const directoryControls = kind => `<div class="access-site-search"><input name="${kind}Search" type="search" maxlength="200" aria-label="Search ${kind==='user'?'users':'known sites'}" placeholder="${kind==='user'?'Find a user by name or email':'Find a site by address, name or ID'}"><button type="button" data-find="${kind}">Find ${kind==='user'?'users':'sites'}</button><button type="button" data-all="${kind}" class="secondary">Show all</button></div><button type="button" data-more="${kind}" class="access-more" hidden>Load more ${kind==='user'?'users':'sites'}</button><p data-directory-status="${kind}" role="status"></p>`;
  const userPicker = () => `<div class="full"><label>Registered user<select name="knownUser" aria-label="Registered user"><option value="">Select a customer or enter their email below</option></select></label><details class="access-directory"><summary>Search users</summary>${directoryControls('user')}</details><p class="access-hint" data-user-status>Choose a registered customer, or enter an email for someone who hasn’t joined.</p></div>${field('email','Customer email','email','','required maxlength="320"')}<input name="userId" type="hidden">`;
  const sitePicker = (selected='',candidates=[]) => `<div class="full"><label>Known site<select name="knownSite" aria-label="Known site">${siteOptions(selected,candidates)}</select></label><p><a data-site-link ${solarWebPermissionsUrl(selected)?`href="${e(solarWebPermissionsUrl(selected))}"`:'hidden'} target="_blank" rel="noopener noreferrer">Check permissions in Solar.web ↗</a></p><details class="access-directory"><summary>Find another site or enter its ID</summary>${directoryControls('site')}${field('systemId','Exact Solar.web system ID','text',selected,'placeholder="f:00000000-0000-0000-0000-000000000000"')}</details></div>`;
  function siteOptions(selected,candidates=[],catalog=sites) {
    const entries=new Map(candidates.map(c=>{const id=c.system_id||c.systemId;return [id,{system_id:id,display_name:c.display_name||c.displayName,display_address:c.display_address||c.displayAddress}];}));
    catalog.forEach(site=>entries.set(site.system_id,{...entries.get(site.system_id),...site}));
    if(selected&&!entries.has(selected))entries.set(selected,{system_id:selected});
    return options([['','Select a known site'],...[...entries.values()].map(site=>[site.system_id,siteLabel(site)])],selected);
  }
  async function loadDirectory(kind,search='',form,append=false) {
    if(!form?.isConnected||!alive)return;
    if(!directories.has(form))directories.set(form,{});
    const states=directories.get(form), previous=states[kind];
    if(append&&(!previous?.hasMore||previous.loading))return;
    const state={rows:append?previous.rows:[],search,ticket:(previous?.ticket||0)+1,loading:true};
    states[kind]=state;
    const status=form.querySelector(`[data-directory-status="${kind}"]`);
    const more=form.querySelector(`[data-more="${kind}"]`);
    more.disabled=true;status.textContent='Loading…';
    try {
      const response=await call('staff-site-access',{action:kind==='site'?'sites':'users',input:{search,offset:state.rows.length}});
      if(!alive||!form.isConnected||states[kind]!==state)return;
      state.rows=[...state.rows,...response.data.rows];state.hasMore=response.data.hasMore;
      if(kind==='site') {
        const select=form.elements.knownSite, selected=form.elements.systemId.value;
        const selectedOption=[...select.options].find(o=>o.value===selected);
        const hints=search?[]:suggestions.get(form)||[];
        select.innerHTML=siteOptions(selected,hints,state.rows);
        if(selectedOption&&!state.rows.some(s=>s.system_id===selected)&&!hints.some(s=>s.system_id===selected))select.selectedOptions[0].textContent=selectedOption.textContent;
        if(!search)sites=state.rows;
      } else {
        states.userRecords??=new Map();state.rows.forEach(u=>states.userRecords.set(u.id,u));
        const select=form.elements.knownUser, selected=select.value;
        const selectedOption=[...select.options].find(o=>o.value===selected);
        select.innerHTML=options([['','Enter an email / customer has not signed up'],...state.rows.map(u=>[u.id,`${u.name||'Unnamed user'} · ${u.email} · ${u.role||'No profile'} · ${u.email_verified?'Verified':'Email unverified'}${u.account_active?'':' · Inactive'}`])],selected);
        if(selected&&!state.rows.some(u=>u.id===selected)&&selectedOption){select.append(selectedOption);select.value=selected;}
      }
      more.hidden=!state.hasMore;
      status.textContent=`${state.rows.length} of ${response.data.total} ${kind==='site'?'sites':'users'}${search?' match this search':''}.`;
    } catch(error) {
      if(alive&&form.isConnected&&states[kind]===state){state.hasMore=previous?.hasMore||false;status.textContent=`List unavailable: ${error.message}. Retry the search.`;}
    } finally {
      if(states[kind]===state){state.loading=false;more.disabled=busy;}
    }
  }
  async function loadHints(record,form) {
    const panel=form.closest('article').querySelector('[data-site-hints]');
    const renderHints=(catalog,loading=false)=>{
      if(!alive||!form.isConnected)return;
      const hints=rankSiteHints(record,catalog);suggestions.set(form,hints);
      panel.innerHTML=`<h4>Possible sites</h4><p class="access-hint">Based on the submitted address or site name. Check the customer’s permission in Solar.web.</p>
        ${hints.length?`<ul>${hints.map(site=>`<li><div><strong>${e(site.display_name||site.system_id)}</strong><span>${e(site.display_address||'Address not recorded')}</span><small>${e(site.reason)}</small></div><div class="access-hint-actions"><a href="${e(solarWebPermissionsUrl(site.system_id))}" target="_blank" rel="noopener noreferrer" aria-label="Check permissions for ${e(site.display_name||site.system_id)}">Solar.web permissions ↗</a><button type="button" data-use-site="${e(site.system_id)}" ${busy?'disabled':''}>Use this site</button></div></li>`).join('')}</ul>`:loading?'':'<p>No close matches found. Choose a site below or search by address, name or ID.</p>'}
        ${loading?'<p role="status">Looking for matching sites…</p>':''}`;
      const current=directories.get(form)?.site;
      if(!current?.search)form.elements.knownSite.innerHTML=siteOptions(form.elements.systemId.value,hints,current?.rows||sites);
    };
    renderHints(sites,true);
    try {
      if(!hintCatalog)hintCatalog=(async()=>{
        const catalog=[];
        for(let page=0;page<100&&alive;page++){
          const response=await call('staff-site-access',{action:'sites',input:{search:'',offset:catalog.length}});
          catalog.push(...response.data.rows);
          if(!response.data.hasMore)return catalog;
          if(!response.data.rows.length)break;
        }
        throw new Error('Site list incomplete');
      })().catch(error=>{hintCatalog=null;throw error;});
      renderHints(await hintCatalog);
    } catch {
      if(!alive||!form.isConnected)return;
      renderHints(sites);
      panel.insertAdjacentHTML('beforeend','<p role="status">The full site list could not be loaded. <button type="button" data-retry-hints>Retry suggestions</button> or use the site search below.</p>');
    }
  }
  function closeDetail() { if(!busy){$('access-detail').close();$('access-detail-content').replaceChildren();} }
  function openDetail(index) {
    const r=rows[index];
    $('access-detail-title').textContent=view==='reviews'?'Review request':view==='mappings'?'Review assignment':view==='assignments'?'Active access':'Decision details';
    $('access-detail-content').innerHTML=view==='reviews'?reviewCard(r,index):view==='mappings'?mappingCard(r,index):view==='assignments'?assignmentCard(r,index):historyDetail(r);
    $('access-detail-message').textContent='';
    const form=$('access-detail-content').querySelector('form');
    if(form?.elements.permissionsUrl&&!form.elements.permissionsUrl.value)form.elements.permissionsUrl.value=solarWebPermissionsUrl(form.elements.systemId?.value||r.system_id)||'';
    $('access-detail').showModal();
    if(form?.elements.knownSite){void loadDirectory('site','',form);if(view==='reviews')void loadHints(r,form);}
  }
  function historyDetail(r) { return `<article class="access-card"><h3>${e(r.action)}</h3><p>${e(r.reason)}</p><p>By ${e(r.reviewer_name)} · ${e(date(r.created_at))}</p><pre>${e(JSON.stringify({before:r.before_record,after:r.after_record},null,2))}</pre></article>`; }

  function filters() {
    const values = view==='reviews' ? ['pending','review','connected','revoked'] : view==='mappings' ? ['pending','verified','connected','reverify','revoked'] : view==='assignments' ? ['pending','connected','revoked'] : [];
    $('access-filter').innerHTML = '<option value="">All statuses</option>'+values.map(v=>`<option>${v}</option>`).join('');
    $('access-filter').disabled = view==='history';
    $('mapping-create').innerHTML = view==='mappings' ? `<details class="access-card"><summary>New assignment</summary><form data-create novalidate>
      <p>Choose the customer and site. After verification, the customer accepts the assignment in Moose.</p><div class="access-fields">
      ${userPicker()}
      ${sitePicker()}
      ${field('displayName','Site name','text','','required maxlength="200"')}
      </div><p data-form-error role="alert" tabindex="-1" hidden></p><div class="access-actions">${action('save_mapping','Save for verification')}</div></form></details>` : '';
    const form=$('mapping-create').querySelector('form');
    if(form){void loadDirectory('user','',form);void loadDirectory('site','',form);}
  }
  const fact = (label,value) => `<div><dt>${e(label)}</dt><dd>${e(value||'Not provided')}</dd></div>`;
  function decisionForm(record,index,mapping=false) {
    const candidates=record.candidates||[];
    const selected=mapping?record.system_id:record.matched_system_id||record.fronius_system_id?.replace(/^(?!f:)/,'f:')||(candidates.length===1?candidates[0].systemId:'');
    return `<form data-row="${index}" data-decision-form novalidate>
      <fieldset data-panel="verify" hidden disabled><legend>${mapping?'Verify assignment':'Verify site access'}</legend>
        ${mapping?`<input name="systemId" type="hidden" value="${e(selected)}"><p>${permissionLink(record.verification,selected)}</p>`:`<div class="access-fields">${sitePicker(selected,candidates)}</div>`}
        ${verificationFields(mapping?record.verification:{})}
        <p class="access-hint">${mapping?'After verification, the customer can accept this assignment in Moose.':'Verifying grants this customer access to the selected site.'}</p>
      </fieldset>
      <fieldset data-panel="deny" hidden disabled><legend>${mapping?'Deny assignment':'Deny request'}</legend><p>This request will be closed without granting site access.</p></fieldset>
      <p data-form-error role="alert" tabindex="-1" hidden></p>
      <div class="access-actions access-decision-actions" data-choose-decision>
        <button type="button" data-decision="deny" class="secondary">Deny</button><button type="button" data-decision="verify">Verify</button>
      </div>
      <div class="access-actions access-decision-actions" data-confirm-decision hidden>
        <button type="button" data-decision="back" class="secondary">Back</button>
        <button type="submit" name="action" data-confirm-button value=""></button>
      </div>
    </form>`;
  }
  function reviewCard(r,index) {
    const connected = r.status==='connected', closed=r.status==='revoked';
    const setup=r.connection_setup||{};
    return `<article class="access-card access-review"><div class="access-customer"><div><h3>${e(r.customer_name||'Customer')}</h3><p>${e(r.customer_email)}</p></div>${status(r.status)}</div>
      ${!r.email_verified||!r.account_active?'<p class="access-warning">This customer needs a verified, active account before access can be granted.</p>':''}
      <details data-submission open><summary>Customer submitted</summary><dl class="access-facts">
        ${fact('Site address',r.address)}${fact('Site type',r.site_type)}
        ${fact('Solar.web account',setup.solarWebAccount==='create'?'Needs help creating one':setup.solarWebAccount==='existing'?'Has an account':null)}
        ${fact('Site held by',setup.hosting==='jazz'?'JAZZ · customer invited as Guest':setup.hosting==='customer'?'Customer · JAZZ invited as Guest':null)}
        ${fact('Technician',support(r))}${setup.technicianContact?fact('Technician contact',setup.technicianContact):''}
        ${r.fronius_system_id?fact('Requested system ID',r.fronius_system_id):''}
      </dl></details>
      ${!connected&&!closed?'<section class="access-site-hints" data-site-hints aria-label="Possible sites"></section>':''}
      <details class="access-record-details"><summary>Request details & history</summary><p>Submitted ${e(date(r.created_at))}</p><p><small>Account: ${e(r.user_id)}<br>Request: ${e(r.id)}</small></p>
        <p>Last site search: ${e(date(r.detected_at))}. ${(r.candidates||[]).length} suggested site(s).</p>
        ${r.relationship?`<p>${permissionLink(r.relationship.verification,r.matched_system_id)}</p>`:''}
        ${(r.decisions||[]).map(d=>`<p>${e(d.action)} · ${e(date(d.date))}<br>${e(d.reason)}<br><small>Reviewer: ${e(d.reviewer)}</small></p>`).join('')||'<p>No previous decisions.</p>'}
      </details>
      ${closed?'':connected?`<form data-row="${index}" novalidate><input name="systemId" type="hidden" value="${e(r.matched_system_id)}"><p data-form-error role="alert" tabindex="-1" hidden></p><div class="access-actions">${action('revoke','Revoke this customer’s access','danger')}</div></form>`:decisionForm(r,index)}
    </article>`;
  }
  function mappingCard(m,index) {
    return `<article class="access-card access-review"><div class="access-customer"><div><h3>${e(m.customer_name||m.customer_email)}</h3>${m.customer_name?`<p>${e(m.customer_email)}</p>`:''}</div>${status(m.status)}</div>
      <dl class="access-facts">${fact('Site',m.display_name)}${fact('Customer',m.has_joined?'Registered in Moose':'Has not joined yet')}${fact('Access',m.effective_access?'Granted':m.status==='verified'?'Waiting for customer acceptance':'Not granted')}</dl>
      <details class="access-record-details"><summary>Assignment details</summary><p>System: ${e(m.system_id)}<br>Accepted: ${e(date(m.accepted_at))}<br>Verified: ${e(date(m.verified_at))}<br>Record: ${e(m.verification?.reference||'Not recorded')}<br>Observed permission: ${e(m.verification?.permission||'Not recorded')}</p><p>${permissionLink(m.verification,m.system_id)}</p></details>
      ${m.status==='connected'?`<form data-row="${index}" novalidate><p data-form-error role="alert" tabindex="-1" hidden></p><div class="access-actions">${action('reverify_mapping','Require re-verification','secondary')}${action('revoke_mapping','Revoke this relationship','danger')}</div></form>`:decisionForm(m,index,true)}
    </article>`;
  }
  function assignmentCard(a,index) {
    return `<article class="access-card"><h3>${e(a.customer_name)} · ${e(a.customer_email)}</h3><p>${e(a.system_name||a.system_id)}<br><small>${e(a.system_id)}</small></p>
      <p>Role: ${e(a.role)} · Assignment: ${e(a.status)}<br>Effective access: <strong>${a.effective_access?'Granted':'None'}</strong> · ${e(a.access_source)}<br>${e(a.provenance)}</p>
      ${a.status==='connected'?`<form data-row="${index}" novalidate><p data-form-error role="alert" tabindex="-1" hidden></p><div class="access-actions">${action('revoke_assignment','Revoke selected customer/site access','danger')}</div></form>`:''}</article>`;
  }
  function render(data) {
    rows=data.rows;
    hasMore=data.hasMore;
    const headings=view==='reviews'?['Customer','Requested site','Technician','Status','']:view==='mappings'?['Customer','Site','Joined / accepted','Access','']:view==='assignments'?['Customer','Site','Role','Access','']:['When','Customer / site','Decision','Reviewer',''];
    const cell = text => `<td>${text}</td>`;
    const cells = r => view==='reviews' ? [ `<strong>${e(r.customer_name||'Customer')}</strong><small>${e(r.customer_email)}</small>`,`${e(r.address||'No address')}<small>${e(r.matched_system_id||r.fronius_system_id||'Select a known site')}</small>`,e(support(r)),status(r.status)] : view==='mappings' ? [e(r.customer_email),`${e(r.display_name)}<small>${e(r.system_id)}</small>`,`${r.has_joined?'Joined':'Not joined'} / ${r.accepted_at?'Accepted':'Waiting'}`,`${status(r.status)}<small>${r.effective_access?'Granted':'No access'}</small>`] : view==='assignments' ? [`${e(r.customer_name)}<small>${e(r.customer_email)}</small>`,`${e(r.system_name||r.system_id)}<small>${e(r.system_id)}</small>`,e(r.role),`${status(r.status)}<small>${e(r.access_source)}</small>`] : [e(date(r.created_at)),`${e(r.customer_email||'Pre-signup relationship')}<small>${e(r.system_id)}</small>`,`${e(r.action)}<small>${e(r.reason)}</small>`,e(r.reviewer_name)];
    $('access-results').innerHTML=rows.length?`<div class="access-table-scroll" role="region" aria-label="${e(view)} table" tabindex="0"><table class="access-table"><thead><tr>${headings.map(h=>`<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr>${cells(r).map(cell).join('')}<td><button type="button" data-open="${i}" aria-label="${view==='reviews'?'Review':'Details'} ${e(r.customer_email||r.customer_name||r.action)}">${view==='reviews'?'Review':'Details'}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="access-empty">No records match these filters.</p>';
    $('access-prev').disabled=offset===0;
    $('access-next').disabled=!data.hasMore;
    $('access-page').textContent=rows.length?`${offset+1}–${offset+rows.length} of ${data.total}`:'No results';
  }
  async function load() {
    const ticket=++generation;
    message('Loading current records…');
    try {
      const response=await call('staff-site-access',{action:'list',input:{view,search:$('access-query').value,status:$('access-filter').value,offset}});
      if(!alive||ticket!==generation)return;
      render(response.data);message(`Updated ${date(response.data.generatedAt)}`);
    } catch(error) { if(alive&&ticket===generation){$('access-results').replaceChildren();message(error.message);} }
  }
  let errorCount=0;
  function clearFormError(form) {
    form.querySelectorAll('[aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');});
    const error=form.querySelector('[data-form-error]');
    if(error){error.hidden=true;error.textContent='';}
  }
  function formError(form,name,text) {
    const error=form.querySelector('[data-form-error]');
    error.id||=`access-form-error-${++errorCount}`;
    error.textContent=text;error.hidden=false;
    const input=form.elements.namedItem(name);
    if(input&&input.type!=='hidden'&&!input.disabled) {
      input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);
      for(let parent=input.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
      input.focus();
    } else error.focus();
  }
  function chooseDecision(form,decision) {
    clearFormError(form);message('');
    const active=decision!=='back', mapping=view==='mappings';
    form.dataset.decision=active?decision:'';
    form.querySelectorAll('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==decision;panel.disabled=panel.hidden;});
    form.querySelector('[data-choose-decision]').hidden=active;
    form.querySelector('[data-confirm-decision]').hidden=!active;
    const confirm=form.querySelector('[data-confirm-button]');
    confirm.value=decision==='verify'?(mapping?'verify_mapping':'approve'):decision==='deny'?(mapping?'revoke_mapping':'reject'):'';
    confirm.textContent=decision==='verify'?(mapping?'Verify assignment':'Verify & assign'):(mapping?'Deny assignment':'Deny request');
    confirm.classList.toggle('danger',decision==='deny');
    const submitted=form.closest('article').querySelector('[data-submission]');
    if(submitted)submitted.open=!active;
    if(active)(form.querySelector(`[data-panel="${decision}"] select`)||confirm).focus();
    else form.querySelector('[data-decision="verify"]').focus();
  }
  async function submit(event) {
    const form=event.target;
    if(!form.matches('form[data-row],form[data-create]'))return;
    event.preventDefault();
    if(busy)return;
    const selectedAction=event.submitter?.value;
    if(!['approve','reject','revoke','save_mapping','verify_mapping','reverify_mapping','revoke_mapping','revoke_assignment'].includes(selectedAction))return;
    clearFormError(form);message('');
    const record=rows[Number(form.dataset.row)];
    const data=new FormData(form);
    const verifying=selectedAction==='approve'||selectedAction==='verify_mapping';
    let systemId=String(data.get('systemId')||'').trim().toLowerCase();if(systemId&&!systemId.startsWith('f:'))systemId='f:'+systemId;
    if(verifying||selectedAction==='save_mapping') {
      if(!solarWebPermissionsUrl(systemId)){formError(form,'knownSite','Choose the exact site to assign, or enter its full Solar.web system ID.');return;}
    }
    if(verifying) {
      if(selectedAction==='approve'&&(!record.email_verified||!record.account_active)){formError(form,'','The customer needs a verified, active account before access can be granted.');return;}
      if(!verificationSources.some(([value])=>value===data.get('source'))){formError(form,'source','Choose the record you used to verify this customer’s right to the site.');return;}
      const reference=String(data.get('reference')||'').trim();
      if(reference.length<10||reference.length>1000){formError(form,'reference','Enter a record reference between 10 and 1,000 characters so this check can be traced.');return;}
      if(!['owner','supervisor','guest'].includes(data.get('permission'))){formError(form,'permission','Select the customer permission you observed in Solar.web.');return;}
      if(!data.has('providerChecked')){formError(form,'providerChecked','Check the supporting record, customer permission and JAZZ visibility, then tick the confirmation.');return;}
      if(!safePermissionsUrl(data.get('permissionsUrl'),systemId)){formError(form,'knownSite','Choose the site again to restore its exact Solar.web permissions link.');return;}
    } else if(selectedAction==='save_mapping') {
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.get('email')||'').trim())){formError(form,'email','Select a registered customer or enter a valid email address.');return;}
      if(!String(data.get('displayName')||'').trim()){formError(form,'displayName','Enter a name for this site.');return;}
    }
    if(!form.reportValidity())return;
    const proof=verifying?verification(data):null;
    busy=true;
    const controls=[...root.querySelectorAll('button,input,select,textarea')].map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);
    const ticket=generation;
    try {
      let name='staff-site-access', body;
      if(form.hasAttribute('data-create')) {
        body={action:'save_mapping',input:{email:String(data.get('email')).trim(),userId:data.get('userId')||null,systemId,displayName:data.get('displayName')}};
      } else if(view==='reviews') {
        name='connection-review';
        body={requestId:record.id,action:selectedAction,systemId:selectedAction==='reject'?null:systemId,expectedVersion:record.version,
          verification:proof};
      } else {
        body={action:selectedAction,input:{version:record.version,...(view==='assignments'?{userId:record.user_id,systemId:record.system_id}:{id:record.id}),
          ...(selectedAction==='verify_mapping'?{verification:proof}:{})}};
      }
      const fingerprint=JSON.stringify([name,body]);
      if(!retryKeys.has(fingerprint))retryKeys.set(fingerprint,crypto.randomUUID());
      body.idempotencyKey=retryKeys.get(fingerprint);
      await call(name,body);
      if(!alive||ticket!==generation)return;
      if(form.hasAttribute('data-create')){form.reset();form.elements.email.readOnly=false;form.querySelector('[data-user-status]').textContent='Select a registered user or enter a customer email. Saving grants no access.';form.querySelector('[data-site-link]').hidden=true;}
      $('access-detail').close();$('access-detail-content').replaceChildren();
      await load();message(selectedAction==='approve'?'Verified. This customer now has access to the site.':selectedAction==='verify_mapping'?'Verified. The customer can now accept this assignment in Moose.':selectedAction==='save_mapping'?'Assignment saved. Open it to verify or deny.':selectedAction==='reject'||form.dataset.decision==='deny'?'Denied. This assignment grants no access.':'Saved. Access records have been updated.');
    } catch(error) {
      if(!alive||ticket!==generation)return;
      const invalid=error.code==='INVALID_INPUT'||error.status===400;
      const text=invalid?(verifying?'The site or verification details were not accepted. Check the exact site and supporting record.':'The assignment details were not accepted. Check the customer and selected site.'):error.message;
      message(`${text} Your entries are retained.`);
    }
    finally {busy=false;if(alive){controls.forEach(([control,disabled])=>control.disabled=disabled);root.querySelectorAll('[data-use-site],[data-retry-hints]').forEach(button=>button.disabled=false);$('access-prev').disabled=offset===0;$('access-next').disabled=!hasMore;}}
  }
  root.addEventListener('submit',submit);
  const click = event => {
    const suggestion=event.target.closest('[data-use-site]');
    if(suggestion&&!busy){
      const form=suggestion.closest('article').querySelector('form');
      const site=(suggestions.get(form)||[]).find(site=>site.system_id===suggestion.dataset.useSite);
      if(site){
        chooseDecision(form,'verify');
        if(![...form.elements.knownSite.options].some(option=>option.value===site.system_id))form.elements.knownSite.add(new Option(siteLabel(site),site.system_id));
        form.elements.knownSite.value=site.system_id;
        form.elements.knownSite.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    if(event.target.closest('[data-retry-hints]')&&!busy){const form=event.target.closest('article').querySelector('form');void loadHints(rows[Number(form.dataset.row)],form);}
    const decision=event.target.closest('button[data-decision]');
    if(decision&&!busy)chooseDecision(decision.form,decision.dataset.decision);
    const opener=event.target.closest('[data-open]');
    if(opener&&!busy)openDetail(Number(opener.dataset.open));
    const finder=event.target.closest('[data-find],[data-all],[data-more]');
    if(finder&&!busy) {
      const kind=finder.dataset.find||finder.dataset.all||finder.dataset.more, form=finder.form;
      if(finder.dataset.all)form.elements[`${kind}Search`].value='';
      const search=finder.dataset.more?directories.get(form)?.[kind]?.search||'':form.elements[`${kind}Search`].value;
      void loadDirectory(kind,search,form,!!finder.dataset.more);
    }
  };
  const change = event => {
    if(busy)return;
    if(event.target.name==='knownUser') {
      const form=event.target.form, selected=directories.get(form)?.userRecords?.get(event.target.value);
      form.elements.email.readOnly=!!selected;
      form.elements.email.value=selected?.email||'';
      form.elements.userId.value=selected?.email_verified&&selected.account_active?selected.id:'';
      form.querySelector('[data-user-status]').textContent=selected
        ? `${selected.email_verified?'Email verified':'Email unverified'} · ${selected.account_active?'Active account':'Account unavailable'}. ${form.elements.userId.value?'Account selected; verification and acceptance are still required.':'Relationship will wait for a verified, active account and acceptance.'}`
        : 'Enter a customer email below. The relationship stays pending until verification and acceptance.';
      return;
    }
    if(!['knownSite','systemId'].includes(event.target.name))return;
    const form=event.target.form;
    form.elements.systemId.value=event.target.value;
    const link=form.querySelector('[data-site-link]'), url=solarWebPermissionsUrl(event.target.value);
    if(link){link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');}
    if(form.elements.permissionsUrl) {
      form.elements.permissionsUrl.value=solarWebPermissionsUrl(event.target.value)||'';
      form.elements.permission.value='guest';form.elements.providerChecked.checked=false;
    }
    if(form.elements.displayName)form.elements.displayName.value=directories.get(form)?.site?.rows.find(s=>s.system_id===event.target.value)?.display_name||sites.find(s=>s.system_id===event.target.value)?.display_name||'';
  };
  const keydown=event=>{
    if(event.key==='Enter'&&['userSearch','siteSearch'].includes(event.target.name)){
      event.preventDefault();if(!busy)void loadDirectory(event.target.name==='userSearch'?'user':'site',event.target.value,event.target.form);
    }
  };
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('keydown',keydown);
  $('access-close').onclick=closeDetail;
  $('access-detail').oncancel=event=>{event.preventDefault();closeDetail();};
  $('access-search').onsubmit=event=>{event.preventDefault();if(!busy){offset=0;void load();}};
  function selectView(next) {
    if(busy||!['reviews','mappings','assignments','history'].includes(next))return false;
    if(view===next)return true;
    closeDetail();view=next;offset=0;
    $('access-query').value='';
    root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    filters();void load();
    return true;
  }
  root.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>selectView(button.dataset.view));
  $('access-prev').onclick=()=>{offset=Math.max(0,offset-50);void load();};
  $('access-next').onclick=()=>{offset+=50;void load();};
  filters();render(initial);
  return {selectView,canLeave:()=>!busy,destroy(){alive=false;++generation;retryKeys.clear();root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);$('access-detail').close();root.replaceChildren();}};
}
