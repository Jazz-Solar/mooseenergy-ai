import { escapeHtml as e } from './site-access.js?v=20260914-fit-rates-1';
import { mountSiteRates } from './site-rates.js?v=20261105-1';

export const attributeFields = [
  ['exact_latitude','Latitude',-90,90],['exact_longitude','Longitude',-180,180],
  ['max_dc_power_kw','Panel capacity · kW DC',.001,1000000],['max_ac_power_kw','Inverter capacity · kW AC',.001,1000000],
  ['tilt_degrees','Panel tilt · degrees',0,90],['azimuth_degrees','Panel direction · degrees clockwise from north',0,360],
  ['system_losses','System losses · fraction',0,.999],['fallback_losses','Fallback losses · fraction',0,.999],
  ['inverter_efficiency','Inverter efficiency · fraction',.001,1],['temperature_coefficient','Temperature coefficient · per °C',-.02,.02],
  ['calibration_factor','Calibration factor',.1,10],
];
// Preserve settings this form does not edit (including dated tariffs). Blank
// fields remove only that override and resume the recorded shared default.
export function attributeValues(form, original) {
  const values={...original};
  for(const [key,,min,max] of attributeFields) {
    const input=form.elements.namedItem(key), raw=input.value.trim();
    if(input.validity.badInput)throw new Error('Enter a valid number.');
    if(!raw){delete values[key];continue;}
    const n=Number(raw);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`Check ${input.labels[0].textContent}.`);
    values[key]=n;
  }
  for(const key of ['model_mode','timezone','utility']) {
    const raw=form.elements.namedItem(key).value.trim();if(raw)values[key]=raw;else delete values[key];
  }
  return values;
}
export function mountSiteAttributes(root,call) {
 let alive=true,busy=false,generation=0,editorGeneration=0,offset=0,rows=[],hasMore=false,selected=null,returnFocus=null;
 const keys=new Map();
 root.innerHTML=`<div class="section-intro"><p>Edit the shared site attributes used by monitoring, models and new reports.</p></div>
 <form class="rates-toolbar" data-attribute-search><div><label for="attributes-search">Search sites</label><input id="attributes-search" type="search" maxlength="200" placeholder="Site name, ID or utility"></div><button>Search / refresh</button></form>
 <p role="status" data-attribute-message class="access-message"></p><div data-attribute-rows></div>
 <div class="rates-pager"><button type="button" data-attribute-prev>Previous</button><span data-attribute-page></span><button type="button" data-attribute-next>Next</button></div>
 <details class="attribute-rates"><summary>FIT rates and verification</summary><div data-attribute-rates></div></details>
 <dialog class="rate-dialog attribute-dialog" aria-labelledby="attribute-title"><div class="access-dialog-top"><h3 id="attribute-title">Edit site attributes</h3><button type="button" data-attribute-close>Close</button></div><div data-attribute-content></div></dialog>`;
 const $=s=>root.querySelector(s),dialog=$('dialog');
 let rates=null;
 const rateDetails=$('.attribute-rates');rateDetails.addEventListener('toggle',()=>{if(alive&&rateDetails.open&&!rates)rates=mountSiteRates($('[data-attribute-rates]'),call);});
 const message=s=>{if(alive)$('[data-attribute-message]').textContent=s;};
 async function load(){
  const ticket=++generation;message('Loading sites…');
  try{
   const {data}=await call('staff-site-access',{action:'rates',input:{search:$('#attributes-search').value,status:'',offset}});
   if(!alive||ticket!==generation)return;rows=data.rows;hasMore=data.hasMore;
   $('[data-attribute-rows]').innerHTML=rows.length?`<div class="access-table-scroll" role="region" aria-label="Site attributes" tabindex="0"><table class="access-table"><thead><tr><th>Site</th><th>Utility</th><th>Connection</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td><strong>${e(r.display_name)}</strong><small>${e(r.system_id)}</small></td><td>${e(r.utility||'Not set')}</td><td>${e(r.connection_type||'Not set')}</td><td><button type="button" data-attribute-edit="${i}">Edit attributes</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="access-empty">No matching sites.</div>';
   $('[data-attribute-page]').textContent=`${rows.length?offset+1:0}–${offset+rows.length} of ${data.total}`;message('');
  }catch(err){if(alive&&ticket===generation){rows=[];hasMore=false;$('[data-attribute-rows]').replaceChildren();message(err.message);}}
  if(alive){$('[data-attribute-prev]').disabled=offset===0;$('[data-attribute-next]').disabled=!hasMore;}
 }
 async function edit(row,button){
  const ticket=++editorGeneration;selected=null;returnFocus=button;dialog.showModal();$('[data-attribute-content]').innerHTML='<p role="status">Loading shared attributes…</p>';
  try{
   const {data}=await call('staff-site-access',{action:'site_attributes',input:{systemId:row.system_id}});
   if(!alive||ticket!==editorGeneration||!dialog.open)return;
   if(!data?.model||!data?.setup)throw new Error('Site configuration is not available yet.');
   selected={row,...data};const m=data.model,values=m.overrides;
   const numeric=([key,label,min,max])=>`<div><label for="attr-${key}">${label}</label><input id="attr-${key}" name="${key}" type="number" step="any" min="${min}" max="${max}" value="${e(values[key]??'')}" placeholder="${e(m.defaults[key]??'Not available')}"><small>Default: ${e(m.defaults[key]??'Not available')}</small></div>`;
   $('[data-attribute-content]').innerHTML=`<p><strong>${e(row.display_name)}</strong><br><small>${e(row.system_id)}</small></p><p class="rate-help">Changes apply to everyone connected to this site. Leave an attribute blank to use its default. Existing reports keep their saved values.</p><form data-attribute-form>
   <label for="attr-address">Site address</label><input id="attr-address" name="address" maxlength="500" value="${e(data.setup.address)}">
   <div class="attribute-grid">${attributeFields.slice(0,6).map(numeric).join('')}</div>
   <label for="attr-layout">Panel layout</label><select id="attr-layout" name="model_mode">${[['','Use default'],['flat_panel','Flat'],['tilted','Tilted']].map(([v,l])=>`<option value="${v}" ${v===(values.model_mode||'')?'selected':''}>${l}</option>`).join('')}</select>
   <label for="attr-timezone">Timezone</label><input id="attr-timezone" name="timezone" maxlength="100" placeholder="${e(m.defaults.timezone||'America/Toronto')}" value="${e(values.timezone||'')}">
   <label for="attr-utility">Utility</label><input id="attr-utility" name="utility" maxlength="120" placeholder="${e(m.defaults.utility||'Not set')}" value="${e(values.utility||'')}">
   <details><summary>Advanced model attributes</summary><div class="attribute-grid">${attributeFields.slice(6).map(numeric).join('')}</div></details>
   <p class="rate-help">Connection type and verified payment rates are under FIT rates and verification.</p>
   <p role="alert" data-attribute-error></p><div class="rate-actions"><button type="button" data-attribute-close>Cancel</button><button type="submit">Save attributes</button></div></form>`;
  }catch(err){if(alive&&ticket===editorGeneration)$('[data-attribute-content]').innerHTML=`<p role="alert">${e(err.message)} Close and try again.</p>`;}
 }
 function close(){if(busy)return;++editorGeneration;selected=null;dialog.close();$('[data-attribute-content]').replaceChildren();returnFocus?.focus();}
 async function save(event){
  event.preventDefault();if(busy||!selected)return;const form=event.target;if(!form.reportValidity())return;
  const {row,model,setup}=selected;let input;
  try{input={systemId:row.system_id,values:attributeValues(form,model.overrides),modelRevision:model.revisionId,setupRevision:setup.revisionId,address:form.elements.address.value.trim()};}
  catch(err){$('[data-attribute-error]').textContent=err.message;return;}
  const fingerprint=JSON.stringify(input);if(!keys.has(fingerprint))keys.set(fingerprint,crypto.randomUUID());
  busy=true;const ticket=editorGeneration;dialog.querySelectorAll('input,select,button').forEach(c=>c.disabled=true);$('[data-attribute-error]').textContent='Saving…';
  try{await call('staff-site-access',{action:'save_attributes',input,idempotencyKey:keys.get(fingerprint)});
   if(!alive||ticket!==editorGeneration)return;busy=false;close();await load();message('Shared site attributes saved.');
  }catch(err){if(alive&&ticket===editorGeneration)$('[data-attribute-error]').textContent=err.code==='CONFLICT'?'This site changed while you were editing. Your entries are retained. Close and reload before saving again.':`${err.message} Your entries are retained; retrying this save is safe.`;}
  finally{busy=false;if(alive)dialog.querySelectorAll('input,select,button').forEach(c=>c.disabled=false);}
 }
 const submit=event=>{if(event.target.matches('[data-attribute-form]'))void save(event);else if(event.target.matches('[data-attribute-search]')){event.preventDefault();if(!busy){offset=0;void load();}}};
 const click=event=>{const b=event.target.closest('button');if(!b||busy)return;if(b.hasAttribute('data-attribute-edit'))void edit(rows[Number(b.dataset.attributeEdit)],b);else if(b.hasAttribute('data-attribute-close'))close();else if(b.hasAttribute('data-attribute-prev')){offset=Math.max(0,offset-50);void load();}else if(b.hasAttribute('data-attribute-next')&&hasMore){offset+=50;void load();}};
 root.addEventListener('submit',submit);root.addEventListener('click',click);dialog.oncancel=event=>{event.preventDefault();close();};void load();
 return {canLeave:()=>!busy&&rates?.canLeave?.()!==false,destroy(){alive=false;++generation;++editorGeneration;keys.clear();selected=null;rates?.destroy();dialog.close();root.removeEventListener('submit',submit);root.removeEventListener('click',click);root.replaceChildren();}};
}
