import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';
import { selectEnvironment } from '../admin/environments.js';
const env=selectEnvironment(location.search,location.hostname);
const client=createClient(env.url,env.key,{auth:{storageKey:`moose-connect-${env.name}-v1`,storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const el=id=>document.getElementById(id);
let generation=0,session=null,busy=false,current=null,isAdmin=false;
const requestId=new URLSearchParams(location.search).get('request');
el('environment').textContent=env.label;
el('signup').href='/app/';
const labels={reconnect_required:'Reconnect your portal',awaiting_portal:'Waiting for portal access',authorizing:'Portal connection started',pending_verification:'Waiting for access verification',needs_selection:'Choose the intended site',ready:'Preparing sites',connected:'Connected',denied:'Portal connection needs another attempt',cancelled:'Cancelled',awaiting_inventory:'Waiting for site details'};
function node(tag,text,parent,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;}
function button(text,parent,fn,secondary=true){const b=node('button',text,parent,secondary?'secondary':'');b.type='button';b.addEventListener('click',()=>run(fn));return b;}
function disable(value){document.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=value);}
async function run(fn){if(busy)return;const gen=generation;busy=true;disable(true);el('error').textContent='';try{await fn();}catch(error){if(gen===generation)el('error').textContent=error.safeMessage||'This step could not be completed. Refresh and try again.';}finally{if(gen===generation){busy=false;disable(false);}}}
async function call(body){const gen=generation;if(!session)throw Error('Sign in');const {data,error}=await client.functions.invoke('site-connect',{body});if(gen!==generation)throw Error('Account changed');if(error){let payload;try{payload=await error.context?.json();}catch{}const e=Error('Connection failed');e.safeMessage=payload?.error?.message||'Could not load this request. Use the email assigned to it, or ask the owner to check their technician selection.';throw e;}return data;}
async function show(id){const data=await call({action:'status',requestId:id});current=data;render(data);for(const item of el('requests').querySelectorAll('button'))if(item.dataset.requestId===data.id)item.textContent=`${data.siteName||data.vendor} · ${labels[data.status]||'Needs review'}`;}
async function load(){const gen=generation;const {data}=await client.from('profiles').select('role').eq('id',session.user.id).single();if(gen!==generation)return;isAdmin=data?.role==='admin';const requests=await call({action:'list'});el('requests').replaceChildren();for(const r of requests){const item=button(`${r.siteName||r.vendor} · ${labels[r.status]||'Needs review'}`,el('requests'),()=>show(r.id));item.dataset.requestId=r.id;}if(requestId)await show(requestId);else if(requests.length===1)await show(requests[0].id);else if(!requests.length)el('notice').textContent='No requests are assigned to this account. Ask the owner to select your confirmed email in Moose.';}
function render(r){const root=el('request');root.replaceChildren();node('h2',r.siteName||'Portal sites',root);node('p',`${r.vendor} · ${labels[r.status]||'Connection needs review'}`,root);if(r.address)node('p',r.address,root);if(r.sandbox)node('p','Sandbox · synthetic readings for testing only.',root,'badge');
 if(r.status==='connected'){node('p',`${r.connectedIds.length} site${r.connectedIds.length===1?'':'s'} connected to the requesting owner's Moose account.`,root);node('p','You can return to the app. This request does not give the technician ongoing access to the owner’s account.',root);const link=node('a','Open MOOSE',root);link.href=`${env.name==='development'?'moose-dev':'moose'}://connect?requestId=${encodeURIComponent(r.id)}`;
  const setup=node('div',null,root);for(const id of r.connectedIds)button(r.connectedIds.length===1?'Review site details':`Review ${id}`,setup,()=>showSetup(id,setup));return;}
 if(r.status==='cancelled'){node('p','The owner cancelled this request.',root);return;}
 if(r.canConnect&&['awaiting_portal','authorizing','denied','reconnect_required'].includes(r.status)){
   node('p','Sign in to the manufacturer portal and approve access. You will return here to finish connecting the site.',root);
   button(r.status==='reconnect_required'?'Reconnect portal':r.status==='authorizing'?'Restart portal connection':'Connect manufacturer portal',root,async()=>{const result=await call({action:'start',requestId:r.id,vendor:r.vendor});const url=new URL(result.authorizeUrl);if(url.username||url.password||!(r.provider==='fronius'?url.origin==='https://login.fronius.com'&&url.pathname==='/oauth2/authorize':r.provider==='enphase'?url.origin==='https://api.enphaseenergy.com'&&url.pathname==='/oauth/authorize'&&url.searchParams.get('response_type')==='code':url.origin==='https://api.derapi.com'&&/^\/join\/flows\/flow-[A-Za-z0-9_-]+\/authorize$/.test(url.pathname)))throw Error('Invalid authorization URL');location.assign(url.href);},false);
 }
 if(r.status==='pending_verification'){
  if(r.canConnect&&r.verificationMethod==='enphase'){
   node('p','Confirm your Enphase access to show the sites you can connect.',root);
   button('Verify Enphase access',root,async()=>{const result=await call({action:'verifyEnphase',requestId:r.id});const url=new URL(result.authorizeUrl);if(url.username||url.password||url.origin!=='https://api.enphaseenergy.com'||url.pathname!=='/oauth/authorize'||url.searchParams.get('response_type')!=='code')throw Error('Invalid verification URL');location.assign(url.href);},false);
  }else node('p','The portal step is recorded. The authorized sites must be verified before a site can be attached. You can safely close this page and return later.',root);
 }
 if(!r.canConnect)node('p',r.isOwner?`This request is assigned to ${r.technicianEmail||'the JAZZ team'}. The technician can use this same link to complete it.`:'You can review this request, but only its assigned portal user can complete the portal connection and site selection.',root);
 if(r.canConnect&&r.status==='needs_selection'){
  node('p','Check the site ID and address, then confirm the site requested by the owner.',root);
  const suggestions=new Map((r.candidates||[]).map(c=>[c.systemId,c]));
  let selected=null;const ordered=[...(r.sites||[])].sort((a,b)=>(suggestions.get(b.id)?.matchScore||0)-(suggestions.get(a.id)?.matchScore||0));
  const recommended=ordered.filter(site=>suggestions.has(site.id)).slice(0,3),recommendedIds=new Set(recommended.map(site=>site.id));
  const remaining=ordered.filter(site=>!recommendedIds.has(site.id));
  const list=node('fieldset',null,root);node('legend',recommended.length?'Recommended sites':'Choose a site',list);
  const addSite=(site,parent)=>{const card=node('div',null,parent,'site'),label=node('label',null,card),radio=node('input',null,label);radio.type='radio';radio.name='site';radio.value=site.id;radio.addEventListener('change',()=>{selected=site.id;});node('span',site.name,label);node('small',site.id,card);const address=['street','city','state','zipCode','country'].map(k=>site.address?.[k]).filter(Boolean).join(', ');if(address)node('small',address,card);if(Number.isFinite(site.latitude)&&Number.isFinite(site.longitude))node('small',`${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`,card);};
  for(const site of recommended)addSite(site,list);
  if(!recommended.length)node('p','No recommended match. Expand all sites to choose one.',list);
  if(remaining.length){const more=node('details',null,list,'other-sites');node('summary',`${recommended.length?'All other sites':'All sites'} (${remaining.length})`,more);for(const site of remaining)addSite(site,more);}
  button('Connect the selected site',root,async()=>{if(!selected){const e=Error('Select a site');e.safeMessage='Choose the intended site first.';throw e;}await call({action:'select',requestId:r.id,siteId:selected});await show(r.id);},false);
 }
 if(isAdmin&&r.status==='pending_verification'&&r.verificationMethod!=='enphase'){
  node('hr',null,root);node('h3','Staff access verification',root);node('p','Record only sites whose access is verified for this request and portal user. For an owner portal, verify the complete authorized list. A matching name, address, or successful redirect is insufficient.',root);
  const idsLabel=node('label','Verified site IDs (one per line)',root);idsLabel.htmlFor='verified-ids';const ids=node('textarea',null,root);ids.id='verified-ids';ids.maxLength=13000;
  const evidenceLabel=node('label','Verification evidence and reference',root);evidenceLabel.htmlFor='verification-evidence';const evidence=node('textarea',null,root);evidence.id='verification-evidence';evidence.maxLength=2000;
  button('Verify this site scope',root,async()=>{const siteIds=ids.value.split(/[\s,]+/).filter(Boolean);await call({action:'verify',requestId:r.id,siteIds,evidence:evidence.value});await show(r.id);},false);
 }
 button('Refresh status',root,()=>show(r.id));
 if(r.isOwner)button('Cancel request',root,async()=>{await call({action:'cancel',requestId:r.id});await show(r.id);});
}
async function accountChanged(next){if(session?.user.id===next?.user.id){session=next;return;}generation++;busy=false;session=next;current=null;isAdmin=false;el('request').replaceChildren();el('requests').replaceChildren();el('error').textContent='';el('notice').textContent='';el('login').hidden=!!session;el('workspace').hidden=!session;el('signout').hidden=!session;el('password').value='';disable(false);if(session)await run(load);}
el('login').addEventListener('submit',event=>{event.preventDefault();void run(async()=>{const {data,error}=await client.auth.signInWithPassword({email:el('email').value.trim(),password:el('password').value});if(error){const e=Error('Sign in failed');e.safeMessage='Sign-in failed. Check your email and password and verify your email address.';throw e;}await accountChanged(data.session);});});
el('signout').addEventListener('click',()=>{void run(async()=>{await client.auth.signOut();await accountChanged(null);});});
client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>void accountChanged(next),0);});
const initial=await client.auth.getSession();await accountChanged(initial.data.session);

async function setupRpc(name,args){
 const gen=generation,user=session?.user.id,token=session?.access_token;
 if(!user||!token)throw Error('Sign in');
 const {data,error}=await client.rpc(name,args).setHeader('Authorization',`Bearer ${token}`);
 if(gen!==generation||session?.user.id!==user)throw Error('Account changed');
 if(error){const e=Error('Setup unavailable');e.safeMessage=error.code==='40001'?'These settings changed elsewhere. Reload before saving.':'Site setup is available to the owner and to the connecting technician for seven days. Return to the app or ask the owner to review these details.';throw e;}
 return data;
}
async function showSetup(id,parent){
 const [settings,setup]=await Promise.all([setupRpc('read_site_model_settings',{p_system_id:id}),setupRpc('read_site_setup',{p_system:id})]);
 if(settings?.systemId!==id||setup?.systemId!==id)throw Error('Invalid site');
 parent.querySelector('.setup-form')?.remove();
 const form=node('section',null,parent,'setup-form');node('h3','Site details',form);
 node('p','Enter only values confirmed by the installation records or electricity contract. Empty fields keep the existing defaults. Changes are shared with the site owners.',form);
 const fields=new Map();
 function input(label,key,value,placeholder='',type='text'){
  const wrap=node('label',label,form),field=node('input',null,wrap);field.type=type;field.value=value??'';field.placeholder=placeholder;field.maxLength=500;fields.set(key,field);return field;
 }
 for(const [key,label] of [['max_dc_power_kw','Total panel capacity (kW DC)'],['max_ac_power_kw','Total inverter capacity (kW AC)'],['tilt_degrees','Panel tilt (degrees)'],['azimuth_degrees','Facing direction (0 north, 90 east, 180 south, 270 west)']]){
  const field=input(label,key,settings.overrides?.[key],String(settings.effectiveValues?.[key]??'Unknown'),'number');field.step='any';
 }
 const timezoneLabel=node('label','Timezone (IANA, when missing)',form),timezone=node('input',null,timezoneLabel);timezone.value=settings.overrides?.timezone||'';timezone.placeholder=settings.effectiveValues?.timezone||'e.g. America/Toronto';
 const connectionLabel=node('label','Electricity connection',form),connection=node('select',null,connectionLabel);
 for(const [value,label] of [['','Use existing setting'],['FIT','Feed-in tariff'],['NET_METERED','Net metering'],['LOAD_DISPLACEMENT','Load displacement']]){const option=node('option',label,connection);option.value=value;}
 connection.value=settings.overrides?.connection_type||'';
 const tariff=node('details',null,form);node('summary','Electricity rate (optional)',tariff);node('p','Enter the verified currency, rate per kWh and contract dates. Metered savings still require consumption/import/export evidence.',tariff);
 const tariffFields={};for(const [key,label,type] of [['currency','Currency, e.g. CAD','text'],['rate','Rate per kWh','number'],['startDate','Valid from','date'],['endDate','Valid through','date']]){
  const labelNode=node('label',label,tariff),field=node('input',null,labelNode);field.type=type;if(type==='number')field.step='any';tariffFields[key]=field;
 }
 button('Save installation settings',form,async()=>{
  const values={...settings.overrides};for(const [key,field] of fields){if(field.value.trim())values[key]=Number(field.value);else delete values[key];}
  if(timezone.value.trim())values.timezone=timezone.value.trim();
  if(connection.value)values.connection_type=connection.value;else delete values.connection_type;
  if(values.tilt_degrees>0)values.model_mode='tilted';
  if(Object.values(tariffFields).some(field=>field.value)){
   if(Object.values(tariffFields).some(field=>!field.value)){const e=Error('Tariff incomplete');e.safeMessage='Enter all four tariff fields, or leave all four empty to keep the saved tariff.';throw e;}
   // Existing multiple contract periods must be maintained in the full app form.
   if((settings.overrides?.tariff_periods?.length||0)>1){const e=Error('Multiple tariffs');e.safeMessage='This site has several tariff periods. Edit them in the app to preserve the full contract history.';throw e;}
   values.tariff_periods=[{currency:tariffFields.currency.value.trim().toUpperCase(),rate:Number(tariffFields.rate.value),startDate:tariffFields.startDate.value,endDate:tariffFields.endDate.value}];
  }
  await setupRpc('save_site_model_settings',{p_system_id:id,p_values:values,p_expected_revision:settings.revisionId});
  await showSetup(id,parent);el('notice').textContent='Installation settings saved.';
 },false);
 const addressLabel=node('label','Site address',form),address=node('input',null,addressLabel);address.value=setup.address;address.maxLength=500;
 let devices=null;
 if(id.startsWith('e:')){
  const extra=node('details',null,form);node('summary','Panel capacity by inverter (optional)',extra);
  node('p','One inverter serial number, comma, total connected panel watts per line. Use verified nameplate values; do not divide the total capacity across an unknown or mixed array.',extra);
  const label=node('label','Verified inverter serial numbers and panel watts',extra);devices=node('textarea',null,label);devices.maxLength=100000;devices.rows=6;devices.value=setup.equipment.map(d=>`${d.deviceId}, ${d.dcPowerW}`).join('\n');
 }
 button('Save address and panel details',form,async()=>{
  const seen=new Set(),equipment=devices?devices.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
   const fields=line.split(',').map(s=>s.trim()),watts=Number(fields[1]);if(fields.length!==2||!/^[A-Za-z0-9_-]{1,128}$/.test(fields[0])||seen.has(fields[0])||!Number.isFinite(watts)||watts<1||watts>1e9)throw Error('Invalid device inputs');seen.add(fields[0]);return {deviceId:fields[0],dcPowerW:watts};
  }):setup.equipment;
  await setupRpc('save_site_setup',{p_system:id,p_address:address.value.trim(),p_devices:equipment,p_expected_revision:setup.revisionId});
  await showSetup(id,parent);el('notice').textContent='Site details saved. Available roof and equipment data will refresh automatically.';
 });
}
