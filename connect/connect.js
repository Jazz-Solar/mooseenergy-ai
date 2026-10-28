import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';
import { selectEnvironment } from '../admin/environments.js';
const env=selectEnvironment(location.search,location.hostname);
const client=createClient(env.url,env.key,{auth:{storageKey:`moose-connect-${env.name}-v1`,storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const el=id=>document.getElementById(id);
let generation=0,session=null,busy=false,current=null,isAdmin=false;
const requestId=new URLSearchParams(location.search).get('request');
el('environment').textContent=env.label;
el('signup').href='/app/';
const labels={awaiting_portal:'Waiting for portal access',authorizing:'Portal connection started',pending_verification:'Waiting for access verification',needs_selection:'Choose the intended site',ready:'Preparing sites',connected:'Connected',denied:'Portal connection needs another attempt',cancelled:'Cancelled',awaiting_inventory:'Waiting for site details'};
function node(tag,text,parent,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;}
function button(text,parent,fn,secondary=true){const b=node('button',text,parent,secondary?'secondary':'');b.type='button';b.addEventListener('click',()=>run(fn));return b;}
function disable(value){document.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=value);}
async function run(fn){if(busy)return;const gen=generation;busy=true;disable(true);el('error').textContent='';try{await fn();}catch(error){if(gen===generation)el('error').textContent=error.safeMessage||'This step could not be completed. Refresh and try again.';}finally{if(gen===generation){busy=false;disable(false);}}}
async function call(body){const gen=generation;if(!session)throw Error('Sign in');const {data,error}=await client.functions.invoke('site-connect',{body});if(gen!==generation)throw Error('Account changed');if(error){let payload;try{payload=await error.context?.json();}catch{}const e=Error('Connection failed');e.safeMessage=payload?.error?.message||'Could not load this request. Use the email assigned to it, or ask the owner to check their technician selection.';throw e;}return data;}
async function show(id){const data=await call({action:'status',requestId:id});current=data;render(data);}
async function load(){const gen=generation;const {data}=await client.from('profiles').select('role').eq('id',session.user.id).single();if(gen!==generation)return;isAdmin=data?.role==='admin';const requests=await call({action:'list'});el('requests').replaceChildren();for(const r of requests)button(`${r.siteName||r.vendor} · ${labels[r.status]||'Needs review'}`,el('requests'),()=>show(r.id));if(requestId)await show(requestId);else if(requests.length===1)await show(requests[0].id);else if(!requests.length)el('notice').textContent='No requests are assigned to this account. Ask the owner to select your confirmed email in Moose.';}
function render(r){const root=el('request');root.replaceChildren();node('h2',r.siteName||'Portal sites',root);node('p',`${r.vendor} · ${labels[r.status]||'Connection needs review'}`,root);if(r.address)node('p',r.address,root);if(r.sandbox)node('p','Sandbox · synthetic readings for testing only.',root,'badge');
 if(r.status==='connected'){node('p',`${r.connectedIds.length} site${r.connectedIds.length===1?'':'s'} connected to the requesting owner's Moose account.`,root);node('p','You can return to the app. This request does not give the technician ongoing access to the owner’s account.',root);return;}
 if(r.status==='cancelled'){node('p','The owner cancelled this request.',root);return;}
 if(r.canConnect&&['awaiting_portal','authorizing','denied'].includes(r.status)){
   node('p','Sign in to the manufacturer portal and approve access. You will return here to finish connecting the site.',root);
   button(r.status==='authorizing'?'Restart portal connection':'Connect manufacturer portal',root,async()=>{const result=await call({action:'start',requestId:r.id,vendor:r.vendor});const url=new URL(result.authorizeUrl);if(url.username||url.password||!(r.provider==='fronius'?url.origin==='https://login.fronius.com'&&url.pathname==='/oauth2/authorize':url.origin==='https://api.derapi.com'&&/^\/join\/flows\/flow-[A-Za-z0-9_-]+\/authorize$/.test(url.pathname)))throw Error('Invalid authorization URL');location.assign(url.href);},false);
 }
 if(r.status==='pending_verification')node('p','The portal step is recorded. Staff must verify the authorized sites before any site can be attached. You can safely close this page and return later.',root);
 if(!r.canConnect)node('p',r.isOwner?`This request is assigned to ${r.technicianEmail||'the JAZZ team'}. The technician can use this same link to complete it.`:'You can review this request, but only its assigned portal user can complete the portal connection and site selection.',root);
 if(r.canConnect&&r.status==='needs_selection'){
  node('p','Choose only the site requested by the owner. Suggestions compare names and available addresses within the verified portal; check the site ID and location before confirming.',root);
  const suggestions=new Map((r.candidates||[]).map(c=>[c.systemId,c]));
  const list=node('fieldset',null,root);node('legend','Verified portal sites',list);
  let selected=null;const ordered=[...(r.sites||[])].sort((a,b)=>(suggestions.get(b.id)?.matchScore||0)-(suggestions.get(a.id)?.matchScore||0));
  for(const site of ordered){const card=node('div',null,list,'site'),label=node('label',null,card),radio=node('input',null,label);radio.type='radio';radio.name='site';radio.value=site.id;radio.addEventListener('change',()=>{selected=site.id;});node('span',site.name,label);node('small',site.id,card);const address=['street','city','state','zipCode','country'].map(k=>site.address?.[k]).filter(Boolean).join(', ');if(address)node('small',address,card);if(site.latitude!==null&&site.longitude!==null)node('small',`${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`,card);if(suggestions.has(site.id))node('small','Suggested match — confirm before connecting',card);}
  button('Connect the selected site',root,async()=>{if(!selected){const e=Error('Select a site');e.safeMessage='Choose the intended site first.';throw e;}await call({action:'select',requestId:r.id,siteId:selected});await show(r.id);},false);
 }
 if(isAdmin&&r.status==='pending_verification'){
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
