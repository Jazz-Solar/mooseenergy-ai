import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';
import { selectEnvironment } from '../admin/environments.js';
const env=selectEnvironment(location.search,location.hostname);
const el=id=>document.getElementById(id);
let generation=0,session=null,busy=false,current=null,isAdmin=false;
const requestId=new URLSearchParams(location.search).get('request');
const linkStorageKey=`moose-setup-${env.name}-${requestId}`;
const incomingLink=new URLSearchParams(location.hash.slice(1)).get('setup');
let technicianLink=incomingLink||sessionStorage.getItem(linkStorageKey);
const client=technicianLink?null:createClient(env.url,env.key,{auth:{storageKey:`moose-connect-${env.name}-v1`,storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
if(incomingLink){sessionStorage.setItem(linkStorageKey,incomingLink);history.replaceState(null,'',location.pathname+location.search);}
async function linkCall(body){
 const gen=generation,link=technicianLink;
 const response=await fetch(`${env.url}/functions/v1/site-connect`,{method:'POST',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json',apikey:env.key},body:JSON.stringify({...body,technicianLink:link})});
 const data=await response.json();
 if(gen!==generation||link!==technicianLink)throw Error('Setup changed');
 if(!response.ok){if([403,404].includes(response.status))el('request').replaceChildren();const error=Error('Setup unavailable');error.safeMessage=data?.error?.message||'This setup link is unavailable. Ask the owner to send a new invitation.';throw error;}return data;
}

el('environment').textContent=env.label;
el('signup').href='/app/';
const labels={reconnect_required:'Reconnect your portal',awaiting_portal:'Waiting for portal access',authorizing:'Portal connection started',pending_verification:'Waiting for access verification',needs_selection:'Choose the intended site',ready:'Preparing sites',connected:'Connected',denied:'Portal connection needs another attempt',cancelled:'Cancelled',awaiting_inventory:'Waiting for site details'};
function node(tag,text,parent,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;}
function button(text,parent,fn,secondary=true){const b=node('button',text,parent,secondary?'secondary':'');b.type='button';b.addEventListener('click',()=>run(fn));return b;}
function disable(value){document.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=value||n.dataset.readonly==='true');}
async function run(fn){if(busy)return;const gen=generation;busy=true;disable(true);el('error').textContent='';try{await fn();}catch(error){if(gen===generation)el('error').textContent=error.safeMessage||'This step could not be completed. Refresh and try again.';}finally{if(gen===generation){busy=false;disable(false);}}}
async function call(body){if(technicianLink)return linkCall(body);const gen=generation;if(!session)throw Error('Sign in');const {data,error}=await client.functions.invoke('site-connect',{body,timeout:60000});if(gen!==generation)throw Error('Account changed');if(error){let payload;try{payload=await error.context?.json();}catch{}const e=Error('Connection failed');e.safeMessage=payload?.error?.message||'Could not load this request. Use the email assigned to it, or ask the owner to check their technician selection.';throw e;}return data;}
function enphaseOptions(r,root,ownerButton){
 node('h3','How do you access Enphase?',root);
 const choices=node('div',null,root,'enphase-options');
 const owner=node('div',null,root),installer=node('form',null,root);installer.hidden=true;installer.autocomplete='off';
 const ownerChoice=button('System owner',choices,async()=>{installer.hidden=true;owner.hidden=false;password.value='';ownerChoice.setAttribute('aria-pressed','true');installerChoice.setAttribute('aria-pressed','false');});
 const installerChoice=button('Installer or technician',choices,async()=>{installer.hidden=false;owner.hidden=true;password.value='';ownerChoice.setAttribute('aria-pressed','false');installerChoice.setAttribute('aria-pressed','true');email.focus();});
 ownerChoice.setAttribute('aria-pressed','true');installerChoice.setAttribute('aria-pressed','false');
 node('p','Approve access on Enphase’s website. If Enphase says you do not own any systems, choose Installer or technician.',owner);owner.append(ownerButton);ownerButton.textContent='Continue as system owner';
 node('p','Sign in with your Enlighten installer account to find the sites you manage. Moose uses your password to connect and does not save it.',installer);
 const emailLabel=node('label','Enlighten email',installer),email=node('input',null,emailLabel);email.type='email';email.maxLength=254;email.required=true;email.autocomplete='off';email.name='enphase-email';
 const passwordLabel=node('label','Enlighten password',installer),password=node('input',null,passwordLabel);password.type='password';password.maxLength=1024;password.required=true;password.autocomplete='off';password.name='enphase-password';password.dataset.enphasePassword='true';
 const submit=node('button','Sign in and find sites',installer);submit.type='submit';
 installer.addEventListener('submit',event=>{event.preventDefault();void run(async()=>{
  const payload={action:'installerSignIn',requestId:r.id,installerEmail:email.value.trim(),installerPassword:password.value};password.value='';submit.textContent='Connecting to Enphase…';
  try{const result=await call(payload);current=result;render(result);}finally{payload.installerPassword='';submit.textContent='Sign in and find sites';}
 });});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const input of document.querySelectorAll('[data-enphase-password]'))input.value='';});
async function show(id){const data=await call({action:'status',requestId:id});current=data;render(data);for(const item of el('requests').querySelectorAll('button'))if(item.dataset.requestId===data.id)item.textContent=`${data.siteName||data.vendor} · ${labels[data.status]||'Needs review'}`;}
async function load(){const gen=generation;const {data}=await client.from('profiles').select('role').eq('id',session.user.id).single();if(gen!==generation)return;isAdmin=data?.role==='admin';const requests=await call({action:'list'});el('requests').replaceChildren();for(const r of requests){const item=button(`${r.siteName||r.vendor} · ${labels[r.status]||'Needs review'}`,el('requests'),()=>show(r.id));item.dataset.requestId=r.id;}if(requestId)await show(requestId);else if(requests.length===1)await show(requests[0].id);else if(!requests.length)el('notice').textContent='No requests are assigned to this account. Ask the owner to select your confirmed email in Moose.';}
function render(r){const root=el('request');root.replaceChildren();node('h2',r.siteName||'Portal sites',root);node('p',`${r.vendor} · ${r.status==='needs_selection'&&r.accessMode==='own_portal'?'Choose your sites':labels[r.status]||'Connection needs review'}`,root);if(r.address)node('p',r.address,root);if(r.sandbox)node('p','Sandbox · synthetic readings for testing only.',root,'badge');
 if(r.status==='connected'&&r.purpose==='review'){node('p','This link only permits review of this installation’s physical inputs. It expires after seven days and can be disabled by the owner.',root);const setup=node('div',null,root);button('Complete Digital Twin setup',setup,()=>showSetup(r.connectedIds[0],setup));return;}
 if(r.status==='connected'){node('p',`${r.connectedIds.length} site${r.connectedIds.length===1?'':'s'} connected to ${r.accessMode==='own_portal'?'your':"the requesting owner's"} Moose account.`,root);node('p',technicianLink?'The owner can now see the site in Moose. Review its installation details below, then close this page.':r.accessMode==='own_portal'?'You can return to the app to view your sites.':'You can return to the app. This request does not give the technician ongoing access to the owner’s account.',root);const link=node('a','Open Moose Energy',root);link.hidden=!!technicianLink;link.href=`${env.name==='development'?'moose-dev':'moose'}://connect?requestId=${encodeURIComponent(r.id)}`;
  const setup=node('div',null,root);for(const id of r.connectedIds)button(r.connectedIds.length===1?'Complete Digital Twin setup':`Complete setup · ${id}`,setup,()=>showSetup(id,setup));return;}
 if(r.status==='cancelled'){node('p','The owner cancelled this request.',root);return;}
 if(r.canConnect&&['awaiting_portal','authorizing','denied','reconnect_required'].includes(r.status)){
   if(r.provider!=='enphase')node('p','Sign in to the manufacturer portal and approve access. You will return here to finish connecting the site.',root);
   const ownerButton=button(r.status==='reconnect_required'?'Reconnect portal':r.status==='authorizing'?'Restart portal connection':'Connect manufacturer portal',root,async()=>{const result=await call({action:'start',requestId:r.id,vendor:r.vendor});const url=new URL(result.authorizeUrl);if(url.username||url.password||!(r.provider==='fronius'?url.origin==='https://login.fronius.com'&&url.pathname==='/oauth2/authorize':r.provider==='enphase'?url.origin==='https://api.enphaseenergy.com'&&url.pathname==='/oauth/authorize'&&url.searchParams.get('response_type')==='code':url.origin==='https://api.derapi.com'&&/^\/join\/flows\/flow-[A-Za-z0-9_-]+\/authorize$/.test(url.pathname)))throw Error('Invalid authorization URL');location.assign(url.href);},false);
   if(r.provider==='enphase')enphaseOptions(r,root,ownerButton);
 }
 if(r.status==='pending_verification'){
  if(r.canConnect&&r.verificationMethod==='enphase'){
   node('p','Confirm your Enphase access to show the sites you can connect.',root);
   button('Verify Enphase access',root,async()=>{const result=await call({action:'verifyEnphase',requestId:r.id});const url=new URL(result.authorizeUrl);if(url.username||url.password||url.origin!=='https://api.enphaseenergy.com'||url.pathname!=='/oauth/authorize'||url.searchParams.get('response_type')!=='code')throw Error('Invalid verification URL');location.assign(url.href);},false);
  }else node('p','The portal step is recorded. The authorized sites must be verified before a site can be attached. You can safely close this page and return later.',root);
 }
 if(!r.canConnect)node('p',r.isOwner?`This request is assigned to ${r.technicianEmail||'the JAZZ team'}. The technician can use this same link to complete it.`:'You can review this request, but only its assigned portal user can complete the portal connection and site selection.',root);
 if(r.canConnect&&r.status==='needs_selection'){
  const many=r.accessMode==='own_portal',selected=new Set();
  node('p',many?'Choose the sites to add to your account.':'Check the site ID and address, then confirm the site requested by the owner.',root);
  const suggestions=new Map((r.candidates||[]).map(c=>[c.systemId,c]));
  const ordered=[...(r.sites||[])].sort((a,b)=>(suggestions.get(b.id)?.matchScore||0)-(suggestions.get(a.id)?.matchScore||0));
  const recommended=ordered.filter(site=>suggestions.has(site.id)).slice(0,3),recommendedIds=new Set(recommended.map(site=>site.id));
  const remaining=ordered.filter(site=>!recommendedIds.has(site.id));
  let allButton,count,connectButton;
  const update=()=>{if(many){count.textContent=`${selected.size} selected`;connectButton.textContent=selected.size?`Connect ${selected.size} site${selected.size===1?'':'s'}`:'Connect selected sites';allButton.textContent=selected.size===ordered.length&&ordered.length?'Clear selection':'Select all sites';}};
  if(many)allButton=button('Select all sites',root,async()=>{
   const clear=selected.size===ordered.length;selected.clear();if(!clear)for(const site of ordered)selected.add(site.id);
   for(const input of root.querySelectorAll('input[name=site]'))input.checked=selected.has(input.value);update();
  });
  const list=node('fieldset',null,root);node('legend',recommended.length?'Recommended sites':many?'Choose sites':'Choose a site',list);
  const addSite=(site,parent)=>{const card=node('div',null,parent,'site'),label=node('label',null,card),input=node('input',null,label);input.type=many?'checkbox':'radio';input.name='site';input.value=site.id;input.addEventListener('change',()=>{if(!many)selected.clear();if(input.checked)selected.add(site.id);else selected.delete(site.id);update();});node('span',site.name,label);node('small',site.id,card);const address=['street','city','state','zipCode','country'].map(k=>site.address?.[k]).filter(Boolean).join(', ');if(address)node('small',address,card);if(Number.isFinite(site.latitude)&&Number.isFinite(site.longitude))node('small',`${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`,card);};
  for(const site of recommended)addSite(site,list);
  if(!recommended.length)node('p',many?'No recommended match. Expand all sites to choose.':'No recommended match. Expand all sites to choose one.',list);
  if(remaining.length){const more=node('details',null,list,'other-sites');node('summary',`${recommended.length?'All other sites':'All sites'} (${remaining.length})`,more);for(const site of remaining)addSite(site,more);}
  if(many){count=node('p','0 selected',root);count.setAttribute('role','status');count.setAttribute('aria-live','polite');}
  connectButton=button(many?'Connect selected sites':'Connect the selected site',root,async()=>{
   if(!selected.size){const e=Error('Select a site');e.safeMessage=many?'Choose at least one site first.':'Choose the intended site first.';throw e;}
   await call(many?{action:'selectMany',requestId:r.id,siteIds:[...selected].sort(),selectionVersion:r.selectionVersion}:{action:'select',requestId:r.id,siteId:[...selected][0]});await show(r.id);
  },false);
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
el('signout').addEventListener('click',()=>{void run(async()=>{
 if(technicianLink){sessionStorage.removeItem(linkStorageKey);technicianLink=null;generation++;busy=false;el('request').replaceChildren();el('workspace').hidden=true;el('signout').hidden=true;el('notice').textContent='Setup closed. You can close this tab.';disable(false);return;}
 await client.auth.signOut();await accountChanged(null);
});});
if(technicianLink){
 el('login').hidden=true;el('workspace').hidden=false;el('requests').hidden=true;
 el('intro').textContent='Connect the requested site using your manufacturer portal, then review its installation details. No Moose sign-in is needed.';
 el('signout').hidden=false;el('signout').textContent='Close setup';
 // Do not read or reuse a Moose account session in capability mode.
 await run(()=>show(requestId));
}else{
 el('login').hidden=false;
 client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>void accountChanged(next),0);});
 const initial=await client.auth.getSession();await accountChanged(initial.data.session);
}

async function setupRpc(name,args){
 if(technicianLink)return linkCall({action:'setup',requestId,operation:name,args});
 const gen=generation,user=session?.user.id,token=session?.access_token;
 if(!user||!token)throw Error('Sign in');
 const {data,error}=await client.rpc(name,args).setHeader('Authorization',`Bearer ${token}`);
 if(gen!==generation||session?.user.id!==user)throw Error('Account changed');
 if(error){const e=Error('Setup unavailable');e.safeMessage=error.code==='40001'?'These settings changed elsewhere. Reload before saving.':'Site setup is available to the owner and to the connecting technician for seven days. Return to the app or ask the owner to review these details.';throw e;}
 return data;
}
async function showSetup(id,parent){
 const data=await setupRpc('read_site_twin_setup',{p_system:id});
 if(data?.systemId!==id)throw Error('Invalid site');
 parent.querySelector('.setup-form')?.remove();
 const form=node('section',null,parent,'setup-form'),settings=data.settings,progress=data.progress;
 const values={...(progress?.values||settings.effectiveValues),...data.draft},missing=new Set(progress?.missingFields||['location','timezone','max_dc_power_kw','max_ac_power_kw','orientation']);
 node('h3','Complete Digital Twin setup',form);if(data.draftRevision)node('p','Known inputs are saved as a draft. Confirm the timezone, then save to apply them to the Digital Twin.',form);
 node('p',({preparing:'Preparing site data in the background',needs_review:'Confirm the remaining installation inputs',ready:'Digital Twin ready',retry_needed:'Provider data needs another attempt'})[progress?.status]||'Review installation inputs',form,'badge');
 node('p','Save the inputs you know. Changes are shared with the site owners. Tariffs remain in the app’s site settings.',form);
 const extra=node('details',null,form);node('summary','Review all other physical inputs',extra);
 const fields=new Map(),dirty=new Set();
 const section=key=>missing.has(key)?form:extra;
 function input(label,key,group,type='number'){
  const wrap=node('label',label,section(group)),field=node('input',null,wrap);
  field.type=type;field.value=values[key]??'';field.step='any';field.maxLength=100;fields.set(key,field);
  field.addEventListener('input',()=>dirty.add(key));return field;
 }
 const lat=input('Latitude','exact_latitude','location'),lon=input('Longitude','exact_longitude','location');
 const setLocation=(a,b)=>{lat.value=a.toFixed(6);lon.value=b.toFixed(6);dirty.add('exact_latitude');dirty.add('exact_longitude');};
 const latitude=Number(lat.value),longitude=Number(lon.value);
 if(lat.value&&lon.value&&Number.isFinite(latitude)&&Math.abs(latitude)<=85&&Number.isFinite(longitude)&&Math.abs(longitude)<=180){
  const mapRoot=node('div',null,section('location'),'location-picker');
  node('p',progress?.locationPrecision==='ROOFTOP'?'Check the pin is on the installed array.':'This is an approximate area. Move the pin onto the installed array before confirming.',mapRoot);
  const world=40075016.68557849;let x=longitude/360*world,y=Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360))/(2*Math.PI)*world,span=progress?.locationPrecision==='ROOFTOP'?600:6000;
  const viewport=node('div',null,mapRoot,'location-map'),image=node('img',null,viewport),pin=node('span','●',viewport,'location-pin');image.alt='Satellite map for confirming installation location';image.draggable=false;pin.setAttribute('aria-hidden','true');
  const draw=()=>{x=((x+world/2)%world+world)%world-world/2;y=Math.max(-world/2,Math.min(world/2,y));image.src='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?f=image&format=jpg&bboxSR=3857&imageSR=3857&size=800,500&bbox='+[x-span/2,y-span*5/16,x+span/2,y+span*5/16].join(',');};
  image.addEventListener('click',event=>{const r=image.getBoundingClientRect();x+=(event.clientX-r.left-r.width/2)/r.width*span;y-=(event.clientY-r.top-r.height/2)/r.width*span;draw();});
  image.addEventListener('error',()=>{mapRoot.dataset.unavailable='true';});image.addEventListener('load',()=>{delete mapRoot.dataset.unavailable;});
  const controls=node('div',null,mapRoot,'map-controls');
  for(const [label,dx,dy] of [['West',-.25,0],['North',0,.25],['South',0,-.25],['East',.25,0]])button(label,controls,async()=>{x+=dx*span;y+=dy*span;draw();});
  button('Zoom in',controls,async()=>{span=Math.max(80,span/2);draw();});button('Zoom out',controls,async()=>{span=Math.min(2000000,span*2);draw();});
  button('Confirm this installation pin',mapRoot,async()=>setLocation((2*Math.atan(Math.exp(y/world*2*Math.PI))-Math.PI/2)*180/Math.PI,x/world*360));
  node('small','Esri, Vantor, Earthstar Geographics, Garmin, GIS User Community',mapRoot);draw();
 }else node('p','Enter verified installation coordinates. A city or postcode cannot identify the installed array.',section('location'));
 input('Timezone (for example America/Toronto)','timezone','timezone','text');
 input('Installed panel capacity (kW DC)','max_dc_power_kw','max_dc_power_kw');
 input('Verified total inverter capacity (kW AC)','max_ac_power_kw','max_ac_power_kw');
 node('p','AC capacity is the total continuous nameplate rating of all installed physical inverters, including offline units. Do not include retired devices or count dual-input channels twice.',section('max_ac_power_kw'));
 const tilt=input('Panel tilt (0–90°)','tilt_degrees','orientation'),azimuth=input('Direction (0 north, 90 east, 180 south, 270 west)','azimuth_degrees','orientation');
 node('p','Check installed panel angles. Roof estimates do not identify panel racks. Mixed faces and ground mounts need a technician-confirmed representative plane for this model.',section('orientation'));
 if(progress?.geometrySuggestion?.status==='estimated'){
  const g=progress.geometrySuggestion;node('p',`Roof suggestion: ${g.pitchDegrees}° tilt, ${g.azimuthDegrees}° direction. Confirm only after checking the installed array.`,section('orientation'));
  button('I confirm these installed panel angles',section('orientation'),async()=>{tilt.value=g.pitchDegrees;azimuth.value=g.azimuthDegrees;dirty.add('tilt_degrees');dirty.add('azimuth_degrees');});
 }
 button('Confirm panels are flat (0°)',section('orientation'),async()=>{tilt.value='0';azimuth.value='180';dirty.add('tilt_degrees');dirty.add('azimuth_degrees');});
 node('small',`Model defaults: loss factor ${values.system_losses??.18}, fallback losses ${values.fallback_losses??.14}, inverter efficiency ${values.inverter_efficiency??.97}, temperature coefficient ${values.temperature_coefficient??-.004}.`,form);
 button('Save known inputs',form,async()=>{
  const patch={};for(const key of dirty){const value=fields.get(key).value.trim();if(!value)continue;patch[key]=key==='timezone'?value:Number(value);}
  if('exact_latitude'in patch||'exact_longitude'in patch){if(!lat.value.trim()||!lon.value.trim())throw Error('Both coordinates required');patch.exact_latitude=Number(lat.value);patch.exact_longitude=Number(lon.value);}
  if('tilt_degrees'in patch)patch.model_mode=patch.tilt_degrees===0?'flat_panel':'tilted';
  if(!Object.keys(patch).length&&!data.draftRevision){const e=Error('No confirmed inputs');e.safeMessage='Confirm a map pin or enter an installation input to save.';throw e;}
  if(Object.entries(patch).some(([key,v])=>!['timezone','model_mode'].includes(key)&&!Number.isFinite(v)))throw Error('Invalid number');
  await setupRpc('save_site_twin_setup',{p_system:id,p_values:patch,p_expected_revision:settings.revisionId,p_expected_draft_revision:data.draftRevision??null});
  await showSetup(id,parent);el('notice').textContent='Known inputs saved. Remaining items can be completed later.';
 },false);
 // Preserve verified per-device DC editing for the original connection journey.
 // A review-only link remains limited to the physical site model inputs.
 if(current?.purpose!=='review'&&(id.startsWith('e:')||current?.accessMode==='technician_managed')){
  const advanced=node('details',null,form);node('summary','Installation records (optional)',advanced);
  button('Load installation records',advanced,async()=>{
   const setup=await setupRpc('read_site_setup',{p_system:id});if(setup?.systemId!==id)throw Error('Invalid site');
   advanced.replaceChildren();node('summary','Installation records (optional)',advanced);
   let address=null,devices=null;
   if(current?.accessMode==='technician_managed'){
    const label=node('label','Site address',advanced);address=node('input',null,label);address.value=setup.address;address.maxLength=500;
   }
   if(id.startsWith('e:')){
    node('p','One inverter serial number, comma, verified connected panel watts per line. Do not divide site capacity across an unknown or mixed array.',advanced);
    const label=node('label','Verified inverter serial numbers and panel watts',advanced);devices=node('textarea',null,label);devices.rows=6;devices.maxLength=100000;devices.value=setup.equipment.map(d=>`${d.deviceId}, ${d.dcPowerW}`).join('\n');
   }
   button(address?'Save address and panel details':'Save panel details',advanced,async()=>{
    const seen=new Set(),equipment=devices?devices.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
     const fields=line.split(',').map(s=>s.trim()),watts=Number(fields[1]);if(fields.length!==2||!/^[A-Za-z0-9_-]{1,128}$/.test(fields[0])||seen.has(fields[0])||!Number.isFinite(watts)||watts<1||watts>1e9)throw Error('Invalid device inputs');seen.add(fields[0]);return {deviceId:fields[0],dcPowerW:watts};
    }):setup.equipment;
    await setupRpc('save_site_setup',{p_system:id,p_address:address?address.value.trim():setup.address,p_devices:equipment,p_expected_revision:setup.revisionId});
    await showSetup(id,parent);el('notice').textContent='Site details saved. Available roof and equipment data will refresh automatically.';
   });
  });
 }
 if(settings.canEdit===false){for(const field of form.querySelectorAll('input,button,textarea')){field.dataset.readonly='true';field.disabled=true;}}
 if(progress?.status==='preparing'){
  const poll=()=>setTimeout(()=>{if(!form.isConnected)return;if(document.hidden||busy||dirty.size){poll();return;}void run(()=>showSetup(id,parent));},8000);poll();
 }
}
