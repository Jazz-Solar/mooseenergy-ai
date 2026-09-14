import { escapeHtml as e } from './site-access.js?v=20260914-fit-rates-1';

const types={FIT:'FIT',NET_METERED:'Net metered',LOAD_DISPLACEMENT:'Load displacement'};
const date=value=>value?new Date(value).toLocaleString():'Not recorded';
const money=value=>value==null?'Not set':`$${Number(value).toLocaleString('en-CA',{maximumFractionDigits:8})}/kWh`;
const state=row=>row.report_ready?['ready','Verified FIT rate']:row.connection_type&&row.connection_type!=='FIT'?['unsupported','Reports not supported']:['','Needs review'];

export function mountSiteRates(root,call) {
  let alive=true,busy=false,generation=0,offset=0,rows=[],hasMore=false,selected=null;
  const retryKeys=new Map();
  root.innerHTML=`<h2>Sites & FIT rates</h2><p>Confirm each site’s contract rate to enable accurate revenue reports.</p>
    <form class="rates-toolbar" data-rate-search><div><label for="rates-search">Search sites</label><input id="rates-search" type="search" maxlength="200" placeholder="Site name, ID or utility"></div><div><label for="rates-filter">Report rate status</label><select id="rates-filter"><option value="">All sites</option><option value="ready">Verified FIT rates</option><option value="needs_review">Needs review</option><option value="unsupported">Reports not supported</option></select></div><button>Search / refresh</button></form>
    <p role="status" data-rates-message class="access-message"></p><div data-rates-results></div>
    <div class="rates-pager"><button type="button" data-rates-prev>Previous</button><span data-rates-page></span><button type="button" data-rates-next>Next</button></div>
    <dialog class="rate-dialog" aria-labelledby="rate-title"><div class="access-dialog-top"><h3 id="rate-title">Edit site rate</h3><button type="button" data-rate-close aria-label="Close rate editor">Close</button></div><div data-rate-content></div></dialog>`;
  const $=selector=>root.querySelector(selector), dialog=$('dialog');
  const message=text=>{if(alive)$('[data-rates-message]').textContent=text;};
  function render(data) {
    rows=data.rows;hasMore=data.hasMore;
    $('[data-rates-results]').innerHTML=rows.length?`<div class="access-table-scroll" role="region" aria-label="Site rates table" tabindex="0"><table class="access-table rates-table"><thead><tr><th>Site</th><th>Connection</th><th>FIT rate · CAD</th><th>Status</th><th>Last review</th><th></th></tr></thead><tbody>${rows.map((row,index)=>{
      const [css,label]=state(row);
      return `<tr><td><strong>${e(row.display_name)}</strong><small>${e(row.utility||'Utility not recorded')}</small></td><td>${e(types[row.connection_type]||'Not set')}</td><td>${e(money(row.fit_rate_per_kwh))}</td><td><span class="rate-state ${css}">${label}</span></td><td>${e(row.reviewed_at?date(row.reviewed_at):'No review recorded')}<small>${e(row.reviewer_name||'')}</small></td><td><button type="button" data-rate-edit="${index}" aria-label="Edit rate for ${e(row.display_name)}">Edit rate</button></td></tr>`;
    }).join('')}</tbody></table></div>`:'<div class="access-empty">No sites match these filters.</div>';
    $('[data-rates-page]').textContent=rows.length?`${offset+1}–${offset+rows.length} of ${data.total}`:`0 of ${data.total}`;
    $('[data-rates-prev]').disabled=offset===0;$('[data-rates-next]').disabled=!hasMore;
  }
  async function load() {
    const ticket=++generation;message('Loading sites…');
    try {
      const response=await call('staff-site-access',{action:'rates',input:{search:$('#rates-search').value,status:$('#rates-filter').value,offset}});
      if(!alive||ticket!==generation)return;
      if(response.data?.rateFormVersion!==1)throw new Error('Site rate editing is not available in this environment yet.');
      render(response.data);message('');
    }catch(error){if(alive&&ticket===generation){rows=[];$('[data-rates-results]').replaceChildren();message(error.message);}}
  }
  function close(){if(!busy){dialog.close();$('[data-rate-content]').replaceChildren();selected=null;}}
  function clearError(form) {
    form.querySelectorAll('[aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');});
    const alert=form.querySelector('[role=alert]');alert.hidden=true;alert.textContent='';
  }
  function error(form,text,name='') {
    const alert=form.querySelector('[role=alert]');alert.textContent=text;alert.hidden=false;
    const input=form.elements.namedItem(name);
    if(input&&!input.disabled){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby','rate-error');input.focus();}
    else alert.focus();
  }
  function sync(form) {
    const fit=form.elements.connectionType.value==='FIT';
    form.querySelector('[data-fit-fields]').hidden=!fit;
    form.querySelector('[data-fit-fields]').disabled=!fit;
    form.querySelector('[data-rate-support]').textContent=fit?'Enter the contract’s payment rate in Canadian dollars per kWh. For example, 32.9¢ = $0.329.':form.elements.connectionType.value?'Revenue reports currently support FIT sites only. Saving this connection type keeps FIT reports unavailable.':'Choose the connection type shown on the site’s agreement.';
    form.querySelector('[data-rate-save]').textContent=fit&&form.elements.confirmed.checked?'Save verified rate':'Save as unverified';
    form.querySelector('[data-rate-outcome]').textContent=fit&&form.elements.confirmed.checked?'This enables the site’s report rate. Report delivery also needs a verified recipient.':'Reports stay unavailable until a FIT rate is verified.';
  }
  async function historyFor(row,form) {
    const target=form.querySelector('[data-rate-history]');
    try{
      const response=await call('staff-site-access',{action:'rate_history',input:{systemId:row.system_id}});
      if(!alive||!form.isConnected||selected!==row)return;
      target.innerHTML=response.data.length?response.data.map(entry=>`<div class="rate-history-entry"><strong>${e(entry.after_record.rate_verified?'Verified rate':'Saved as unverified')}</strong> · ${e(types[entry.after_record.connection_type]||'Connection not set')} · ${e(money(entry.after_record.fit_rate_per_kwh))}<small>${e(entry.reviewer_name)} · ${e(date(entry.created_at))}</small>${e(entry.reference||'No reference recorded')}</div>`).join(''):'<p class="rate-help">No rate changes recorded yet.</p>';
    }catch(err){if(alive&&form.isConnected)target.textContent=`History unavailable: ${err.message}`;}
  }
  function edit(row) {
    selected=row;
    $('[data-rate-content]').innerHTML=`<p class="rate-site-id">${e(row.display_name)}<br>${e(row.system_id)}</p><form data-rate-form novalidate>
      <label for="rate-connection">Connection type</label><select name="connectionType" id="rate-connection">${[['','Not set'],...Object.entries(types)].map(([value,label])=>`<option value="${value}" ${value===(row.connection_type||'')?'selected':''}>${label}</option>`).join('')}</select>
      <p class="rate-help" data-rate-support></p>
      <fieldset data-fit-fields style="border:0;margin:0;padding:0;min-width:0"><label for="rate-value">FIT rate · CAD per kWh</label><input id="rate-value" name="fitRate" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="0.329" value="${e(row.fit_rate_per_kwh??'')}">
      <label for="rate-reference">Contract or statement reference</label><input id="rate-reference" name="reference" maxlength="1000" placeholder="Contract ID, document name or statement reference" value="${e(row.reference||'')}">
      <label class="rate-confirm"><input type="checkbox" name="confirmed"><span>I checked this site’s FIT contract or generation statement and confirmed the rate.</span></label>
      ${row.rate_verified?'<p class="rate-help">This rate is currently marked verified. Confirm the supporting record to keep it verified when saving.</p>':''}</fieldset>
      <p class="rate-help" data-rate-outcome></p><p role="alert" id="rate-error" tabindex="-1" hidden></p>
      <div class="rate-actions"><button type="button" data-rate-cancel>Cancel</button><button data-rate-save>Save as unverified</button></div>
      <details><summary>Rate change history</summary><div data-rate-history class="rate-help">Loading history…</div></details>
    </form>`;
    const form=$('[data-rate-form]');sync(form);dialog.showModal();void historyFor(row,form);
  }
  async function save(event) {
    event.preventDefault();if(busy)return;
    const form=event.target,row=selected;clearError(form);
    const data=new FormData(form),connectionType=data.get('connectionType')||null;
    const raw=String(data.get('fitRate')||'').trim(),fitRate=connectionType==='FIT'&&raw!==''?Number(raw):null;
    const confirmed=connectionType==='FIT'&&data.has('confirmed');
    const reference=connectionType==='FIT'?String(data.get('reference')||'').trim():'';
    if(connectionType==='FIT'&&(form.elements.fitRate.validity.badInput||fitRate!==null&&(!Number.isFinite(fitRate)||fitRate<0||fitRate>100))){error(form,'Enter a rate from $0 to $100 per kWh.','fitRate');return;}
    if(confirmed&&fitRate===null){error(form,'Enter the FIT rate before verifying it.','fitRate');return;}
    if((confirmed||reference)&&(reference.length<10||reference.length>1000)){error(form,'Enter a contract or statement reference between 10 and 1,000 characters.','reference');return;}
    const input={systemId:row.system_id,version:row.rate_version,connectionType,fitRate,confirmed,reference:reference||null};
    const fingerprint=JSON.stringify(input);if(!retryKeys.has(fingerprint))retryKeys.set(fingerprint,crypto.randomUUID());
    busy=true;
    const controls=[...root.querySelectorAll('input,select,button')].map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);
    try{
      await call('staff-site-access',{action:'save_rate',input,idempotencyKey:retryKeys.get(fingerprint)});
      if(!alive)return;
      dialog.close();$('[data-rate-content]').replaceChildren();selected=null;
      await load();message(confirmed?'FIT rate verified and saved.':'Site saved as unverified.');
    }catch(err){
      if(alive&&form.isConnected)error(form,err.code==='CONFLICT'?'This site’s rate changed while you were editing. Your entries are retained. Close the editor and refresh sites before trying again.':err.code==='INVALID_INPUT'?'The rate details were not accepted. Check the connection type, rate and supporting reference.':`${err.message} Your entries are retained.`);
    }finally{busy=false;if(alive){controls.forEach(([control,disabled])=>control.disabled=disabled);$('[data-rates-prev]').disabled=offset===0;$('[data-rates-next]').disabled=!hasMore;}}
  }
  const submit=event=>{if(event.target.matches('[data-rate-form]'))void save(event);else if(event.target.matches('[data-rate-search]')){event.preventDefault();if(!busy){offset=0;void load();}}};
  const click=event=>{
    if(busy)return;
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-rate-edit'))edit(rows[Number(target.dataset.rateEdit)]);
    else if(target.hasAttribute('data-rate-close')||target.hasAttribute('data-rate-cancel'))close();
    else if(target.hasAttribute('data-rates-prev')){offset=Math.max(0,offset-50);void load();}
    else if(target.hasAttribute('data-rates-next')&&hasMore){offset+=50;void load();}
  };
  const change=event=>{
    const form=event.target.closest('[data-rate-form]');if(!form||busy)return;
    if(['connectionType','fitRate','reference'].includes(event.target.name))form.elements.confirmed.checked=false;
    clearError(form);sync(form);
  };
  root.addEventListener('submit',submit);root.addEventListener('click',click);root.addEventListener('input',change);root.addEventListener('change',change);
  dialog.oncancel=event=>{event.preventDefault();close();};
  void load();
  return {canLeave:()=>!busy,destroy(){alive=false;++generation;retryKeys.clear();dialog.close();root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.removeEventListener('input',change);root.removeEventListener('change',change);root.replaceChildren();}};
}
