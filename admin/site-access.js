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
function verificationFields(verification={}) {
  return `<details><summary>Record relationship and Solar.web verification</summary><p>Verify the customer’s right to this exact site independently. A suggested match or a verified email alone is insufficient.</p>
    <div class="access-fields">
    <div><label>Verification source<select name="source" aria-label="Verification source">${options([['','Choose a source'],['contract','Customer contract'],['install_record','Installation record'],['authorized_email','Authorized email reference'],['field_verification','Authorized field verification']],verification.source)}</select></label></div>
    ${field('reference','Restricted evidence reference','text',verification.reference||'','maxlength="1000"')}
    <div><label>Customer’s observed Solar.web permission<select name="permission" aria-label="Customer’s observed Solar.web permission">${options([['unknown','Unknown'],['owner','Owner'],['supervisor','Supervisor'],['guest','Guest'],['none','No access']],verification.permission)}</select></label></div>
    <div><label>JAZZ monitoring access<select name="providerStatus" aria-label="JAZZ monitoring access">${options([['unknown','Not checked'],['visible','Site visible to JAZZ'],['unavailable','Site unavailable to JAZZ']],verification.providerStatus)}</select></label></div>
    ${field('observedAt','Observed at (your local time)','datetime-local',verification.observedAt ? new Date(new Date(verification.observedAt).getTime()-new Date(verification.observedAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : '','')}
    ${field('permissionsUrl','Exact Solar.web permissions page URL','url',verification.permissionsUrl||'','maxlength="1000"')}
    </div><p><small>Approval needs an observation within the last seven days. Keep passwords and provider credentials out of these records.</small></p></details>`;
}
function reasonField() {
  return '<label>Decision reason / evidence summary<textarea name="reason" required minlength="20" maxlength="2000" placeholder="Include what was checked and why this decision is appropriate (20 characters minimum)."></textarea></label>';
}
function verification(form) {
  const data = new FormData(form);
  return { source:data.get('source'),reference:data.get('reference'),permission:data.get('permission'),
    providerStatus:data.get('providerStatus'),permissionsUrl:data.get('permissionsUrl'),
    observedAt:data.get('observedAt') ? new Date(String(data.get('observedAt'))).toISOString() : null };
}
const status = value => `<span class="access-status ${e(value)}">${e(value)}</span>`;
const action = (value,label,css='') => `<button type="submit" name="action" value="${value}" class="${css}">${label}</button>`;

export function mountSiteAccess(root, call, initial) {
  let view='reviews', offset=0, alive=true, generation=0, rows=[], busy=false, sites=[];
  const directories = new WeakMap();
  const retryKeys = new Map();
  root.innerHTML = `<h2 class="access-heading">Site access</h2><p class="access-intro">Choose a customer, select a known site, and record the permission check. Access is granted only after approval or customer acceptance.</p>
    <nav class="access-tabs" aria-label="Site access workspaces">${[['reviews','Connection reviews'],['mappings','Customer/site mappings'],['assignments','Effective assignments'],['history','Decision history']].map(([v,l])=>`<button data-view="${v}" aria-pressed="${v===view}">${l}</button>`).join('')}</nav>
    <form class="access-toolbar" id="access-search"><div><label for="access-query">Search customer, site or address</label><input id="access-query" name="search" type="search" maxlength="200"></div><div><label for="access-filter">Status</label><select id="access-filter" name="status"></select></div><button>Search / refresh</button></form>
    <p role="status" aria-live="polite" class="access-message" id="access-message"></p>
    <div id="mapping-create"></div><div id="access-results"></div><dialog id="access-detail" aria-label="Configure site access"><div class="access-dialog-top"><strong>Configure site access</strong><button type="button" id="access-close" aria-label="Close review">Close</button></div><div id="access-detail-content"></div><p id="access-detail-message" role="status" aria-live="polite"></p></dialog>
    <div class="access-actions"><button class="secondary" id="access-prev">Previous</button><span id="access-page"></span><button class="secondary" id="access-next">Next</button></div>`;
  const $ = id => root.querySelector(`#${id}`);
  const message = value => { if(alive) { $('access-message').textContent=value; $('access-detail-message').textContent=value; } };

  const support = r => r.technician_preference==='custom' ? r.connection_setup?.technicianName || 'Customer’s technician' : r.technician_preference==='jazz' ? 'Moose Tech · JAZZ Solar' : r.preferred_technician_name || 'Not specified';
  const directoryControls = kind => `<div class="access-site-search"><input name="${kind}Search" type="search" maxlength="200" aria-label="Search ${kind==='user'?'users':'known sites'}" placeholder="${kind==='user'?'Find a user by name or email':'Find a site by name or ID'}"><button type="button" data-find="${kind}">Find ${kind==='user'?'users':'sites'}</button><button type="button" data-all="${kind}" class="secondary">Show all</button></div><button type="button" data-more="${kind}" class="access-more" hidden>Load more ${kind==='user'?'users':'sites'}</button><p data-directory-status="${kind}" role="status"></p>`;
  const userPicker = () => `<div class="full"><label>Registered user<select name="knownUser" aria-label="Registered user"><option value="">Enter an email / customer has not signed up</option></select></label>${directoryControls('user')}<p data-user-status>Select any registered user, or enter an email below for a future customer. Saving grants no access.</p></div>${field('email','Customer email','email','','required maxlength="320"')}<input name="userId" type="hidden">`;
  const sitePicker = (selected='',candidates=[]) => `<div class="full"><label>Known site<select name="knownSite" aria-label="Known site">${siteOptions(selected,candidates)}</select></label>${directoryControls('site')}<p><a data-site-link ${solarWebPermissionsUrl(selected)?`href="${e(solarWebPermissionsUrl(selected))}"`:'hidden'} target="_blank" rel="noopener noreferrer">Open this site’s Solar.web permissions</a></p><p><small>Catalog entries identify sites; they do not verify customer permission.</small></p><details><summary>Enter an exact system ID instead</summary>${field('systemId','Exact Solar.web system ID','text',selected,'placeholder="f:00000000-0000-0000-0000-000000000000"')}</details></div>`;
  function siteOptions(selected,candidates=[],catalog=sites) {
    const entries=new Map(catalog.map(s=>[s.system_id,{id:s.system_id,name:s.display_name}]));
    candidates.forEach(c=>entries.set(c.systemId,{id:c.systemId,name:`${c.displayName} · ${c.matchReason} suggestion`}));
    if(selected&&!entries.has(selected))entries.set(selected,{id:selected,name:selected});
    return options([['','Select a known site'],...[...entries.values()].map(s=>[s.id,`${s.name} · ${s.id}`])],selected);
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
        select.innerHTML=siteOptions(selected,[],state.rows);
        if(selectedOption&&!state.rows.some(s=>s.system_id===selected))select.selectedOptions[0].textContent=selectedOption.textContent;
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
  function closeDetail() { if(!busy){$('access-detail').close();$('access-detail-content').replaceChildren();} }
  function openDetail(index) {
    const r=rows[index];
    $('access-detail-content').innerHTML=view==='reviews'?reviewCard(r,index):view==='mappings'?mappingCard(r,index):view==='assignments'?assignmentCard(r,index):historyDetail(r);
    $('access-detail-message').textContent='';
    const form=$('access-detail-content').querySelector('form');
    if(form?.elements.permissionsUrl&&!form.elements.permissionsUrl.value)form.elements.permissionsUrl.value=solarWebPermissionsUrl(form.elements.systemId?.value||r.system_id)||'';
    $('access-detail').showModal();
    if(form?.elements.knownSite)void loadDirectory('site','',form);
  }
  function historyDetail(r) { return `<article class="access-card"><h3>${e(r.action)}</h3><p>${e(r.reason)}</p><p>By ${e(r.reviewer_name)} · ${e(date(r.created_at))}</p><pre>${e(JSON.stringify({before:r.before_record,after:r.after_record},null,2))}</pre></article>`; }

  function filters() {
    const values = view==='reviews' ? ['pending','review','connected','revoked'] : view==='mappings' ? ['pending','verified','connected','reverify','revoked'] : view==='assignments' ? ['pending','connected','revoked'] : [];
    $('access-filter').innerHTML = '<option value="">All statuses</option>'+values.map(v=>`<option>${v}</option>`).join('');
    $('access-filter').disabled = view==='history';
    $('mapping-create').innerHTML = view==='mappings' ? `<details class="access-card"><summary>Add a customer/site relationship</summary><form data-create>
      <p>Save the relationship, then verify it. The customer must accept before access is granted.</p><div class="access-fields">
      ${userPicker()}
      ${sitePicker()}
      ${field('displayName','Site name','text','','required maxlength="200"')}
      </div>${reasonField()}<div class="access-actions">${action('save_mapping','Save pending relationship')}</div></form></details>` : '';
    const form=$('mapping-create').querySelector('form');
    if(form){void loadDirectory('user','',form);void loadDirectory('site','',form);}
  }
  function reviewCard(r,index) {
    const connected = r.status==='connected', closed=r.status==='revoked';
    return `<article class="access-card"><h3>${e(r.customer_name||'Customer')} ${status(r.status)}</h3><p>${e(r.customer_email)} · ${r.email_verified?'Email verified':'Email unverified'} · ${r.account_active?'Active account':'Account unavailable'}</p>
      <p><small>Account: ${e(r.user_id)} · Request: ${e(r.id)}</small></p>
      <p>${e(r.address||'No requested address')}<br><small>Requested system: ${e(r.fronius_system_id||'Not supplied')}</small></p>
      <p>Support: ${e(support(r))}${r.connection_setup?.technicianContact ? ' · '+e(r.connection_setup.technicianContact) : ''}</p>
      <p>Solar.web account: ${e(r.connection_setup?.solarWebAccount==='create'?'Technician to help create an account':'Existing / not specified')} · Site held by: ${e(r.connection_setup?.hosting==='jazz'?'JAZZ, with customer as Guest':'Customer, with JAZZ as Guest')}</p><p>Last discovery: ${e(date(r.detected_at))}. ${(r.candidates||[]).length?'Suggested sites were visible at that time.':'No matching site observed.'} Current JAZZ access still needs verification.</p>
      ${r.relationship ? `<p>Recorded JAZZ access: ${e(r.relationship.verification?.providerStatus||'Unknown')} · ${e(date(r.relationship.verification?.observedAt))}</p><p>${permissionLink(r.relationship.verification,r.matched_system_id)}</p>`:''}
      <details><summary>Previous decisions (${r.decisions.length})</summary>${r.decisions.map(d=>`<p>${e(d.action)} · ${e(date(d.date))}<br>${e(d.reason)}<br><small>Reviewer: ${e(d.reviewer)}</small></p>`).join('')||'<p>No previous decisions.</p>'}</details>
      ${closed?'':`<form data-row="${index}"><div class="access-fields">${connected?field('systemId','Exact Solar.web system ID','text',r.matched_system_id,'readonly'):sitePicker(r.matched_system_id||r.fronius_system_id?.replace(/^(?!f:)/,'f:')||'',r.candidates)}</div>
      ${r.candidates.length?`<p><small>${r.candidates.map(c=>`${e(c.displayName)} (${e(c.matchReason)} suggestion) · ${e(c.systemId)}`).join('<br>')}</small></p>`:''}
      ${connected?'':verificationFields()}${reasonField()}<div class="access-actions">${connected?action('revoke','Revoke this customer’s access','danger'):action('approve','Approve connection')+action('reject','Decline request','secondary')}</div></form>`}</article>`;
  }
  function mappingCard(m,index) {
    return `<article class="access-card"><h3>${e(m.display_name)} ${status(m.status)}</h3><p>${e(m.customer_email)}<br><small>${e(m.system_id)}</small></p>
      <p>Joined: ${m.has_joined?'Yes':'Not yet'} · Account bound: ${m.user_id?e(m.user_id):'Waiting for verified acceptance'}<br>Accepted: ${e(date(m.accepted_at))}<br>Effective access: <strong>${m.effective_access?'Granted':'None'}</strong> · ${e(m.access_source)}</p>
      <p>Verification: ${e(m.verification.source||'Not recorded')} · ${e(date(m.verified_at))}<br>Observed permission: ${e(m.verification.permission||'Unknown')} · JAZZ access: ${e(m.verification.providerStatus||'Unknown')}<br>Observed: ${e(date(m.verification.observedAt))}<br>Evidence reference: ${e(m.verification.reference||'Not recorded')}<br><small>Reviewer: ${e(m.reviewer_id||'Not recorded')}</small></p><p>${permissionLink(m.verification,m.system_id)}</p>
      <form data-row="${index}">${m.status==='connected'?'':verificationFields(m.verification)}${reasonField()}<div class="access-actions">
      ${m.status==='connected'?'':action('verify_mapping','Verify relationship')}${action('reverify_mapping','Require re-verification','secondary')}${action('revoke_mapping','Revoke this relationship','danger')}</div></form></article>`;
  }
  function assignmentCard(a,index) {
    return `<article class="access-card"><h3>${e(a.customer_name)} · ${e(a.customer_email)}</h3><p>${e(a.system_name||a.system_id)}<br><small>${e(a.system_id)}</small></p>
      <p>Role: ${e(a.role)} · Assignment: ${e(a.status)}<br>Effective access: <strong>${a.effective_access?'Granted':'None'}</strong> · ${e(a.access_source)}<br>${e(a.provenance)}</p>
      ${a.status==='connected'?`<form data-row="${index}">${reasonField()}<div class="access-actions">${action('revoke_assignment','Revoke selected customer/site access','danger')}</div></form>`:''}</article>`;
  }
  function render(data) {
    rows=data.rows;
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
  async function submit(event) {
    const form=event.target;
    if(!form.matches('form[data-row],form[data-create]'))return;
    event.preventDefault();
    if(busy||!form.reportValidity())return;
    const selectedAction=event.submitter?.value;
    const record=rows[Number(form.dataset.row)];
    const data=new FormData(form);
    const reason=String(data.get('reason')||'').trim();
    if((selectedAction==='approve'||selectedAction==='save_mapping')&&!String(data.get('systemId')||'').trim()){message('Select a known site or enter its exact system ID.');return;}
    busy=true;
    const controls=[...root.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
    const ticket=generation;
    try {
      let name='staff-site-access', body;
      if(form.hasAttribute('data-create')) {
        let systemId=String(data.get('systemId')).trim().toLowerCase();if(!systemId.startsWith('f:'))systemId='f:'+systemId;
        body={action:'save_mapping',input:{email:String(data.get('email')).trim(),userId:data.get('userId')||null,systemId,displayName:data.get('displayName'),reason}};
      } else if(view==='reviews') {
        name='connection-review';
        let systemId=String(data.get('systemId')||'').trim().toLowerCase();if(systemId&&!systemId.startsWith('f:'))systemId='f:'+systemId;
        body={requestId:record.id,action:selectedAction,systemId:selectedAction==='reject'?null:systemId,evidence:reason,expectedVersion:record.version,
          verification:selectedAction==='approve'?verification(form):null};
      } else {
        body={action:selectedAction,input:{reason,version:record.version,...(view==='assignments'?{userId:record.user_id,systemId:record.system_id}:{id:record.id}),
          ...(selectedAction==='verify_mapping'?{verification:verification(form)}:{})}};
      }
      const fingerprint=JSON.stringify([name,body]);
      if(!retryKeys.has(fingerprint))retryKeys.set(fingerprint,crypto.randomUUID());
      body.idempotencyKey=retryKeys.get(fingerprint);
      await call(name,body);
      if(!alive||ticket!==generation)return;
      if(form.hasAttribute('data-create')){form.reset();form.elements.email.readOnly=false;form.querySelector('[data-user-status]').textContent='Select a registered user or enter a customer email. Saving grants no access.';form.querySelector('[data-site-link]').hidden=true;}
      $('access-detail').close();$('access-detail-content').replaceChildren();
      await load();message('Saved. Current records and effective access are shown below.');
    } catch(error) { message(`${error.message} Your entries are retained. Refresh records if another reviewer changed them.`); }
    finally {busy=false;if(alive){controls.forEach(b=>b.disabled=false);$('access-prev').disabled=offset===0;}}
  }
  root.addEventListener('submit',submit);
  const click = event => {
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
      form.elements.observedAt.value='';form.elements.permission.value='unknown';form.elements.providerStatus.value='unknown';
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
  root.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{
    if(busy)return; view=button.dataset.view;offset=0;
    root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    filters();void load();
  });
  $('access-prev').onclick=()=>{offset=Math.max(0,offset-50);void load();};
  $('access-next').onclick=()=>{offset+=50;void load();};
  filters();render(initial);
  return {destroy(){alive=false;++generation;retryKeys.clear();root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);$('access-detail').close();root.replaceChildren();}};
}
