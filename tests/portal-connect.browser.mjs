import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),artifacts=resolve('../browser-evidence');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!p.startsWith(root+'/'))throw Error();res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]||'application/octet-stream'});res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/home/kali/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const stub=`export function createClient(url,key,options){let callback=()=>{};const saved=()=>JSON.parse(sessionStorage.getItem(options.auth.storageKey)||'null');return {auth:{getSession:async()=>({data:{session:saved()}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}},signInWithPassword:async({email})=>{const session={user:{id:email.split('@')[0],email},access_token:'fixture'};sessionStorage.setItem(options.auth.storageKey,JSON.stringify(session));callback('SIGNED_IN',session);return {data:{session},error:null}},signOut:async()=>{sessionStorage.removeItem(options.auth.storageKey);callback('SIGNED_OUT',null);return {error:null}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:saved()?.user.id==='admin'?'admin':'owner'}})})})}),functions:{invoke:async(name,{body})=>{const r=await fetch('/fixture-edge',{method:'POST',body:JSON.stringify({...body,actor:saved()?.user.id})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:{context:{json:async()=>data}}};}}};}`;
try{
 for(const provider of ['derapi','fronius']) for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let status='awaiting_portal',connected=false;const choices=[];const selectedId=provider==='fronius'?'f:20000000-0000-4000-8000-000000000001':'site-maple',otherId=provider==='fronius'?'f:20000000-0000-4000-8000-000000000002':'site-cabin',connectedId=provider==='fronius'?selectedId:'d:'+selectedId;
  const request={id:'10000000-0000-4000-8000-000000000001',provider,vendor:provider==='fronius'?'fronius':'virtual',accessMode:'technician_managed',siteName:'Maple House',address:'12 Maple Street',sandbox:provider==='derapi',connectedIds:[],technicianEmail:'technician@example.invalid'};
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:stub}));
  await context.route('**/fixture-edge',async route=>{const b=route.request().postDataJSON();const can=b.actor==='technician',r={...request,status,canConnect:can,isOwner:b.actor==='owner'};
   const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(b.actor==='other')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{message:'This request is assigned to another account.'}})});
   if(b.action==='list')return reply([r]);
   if(b.action==='start'){assert.equal(can,true);return reply({authorizeUrl:provider==='fronius'?'https://login.fronius.com/oauth2/authorize?state=fixture':'https://api.derapi.com/join/flows/flow-fixture/authorize?vendor=virtual&state=fixture'});}
   if(b.action==='select'){assert.equal(can,true);choices.push(b.siteId);assert.equal(b.siteId,selectedId);status='connected';connected=true;return reply({...r,status,connectedIds:[connectedId]});}
   if(b.action==='status')return reply({...r,connectedIds:connected?[connectedId]:[],...(status==='needs_selection'&&can?{sites:[{id:selectedId,name:'Maple House',address:provider==='fronius'?{street:'12 Maple St',city:'Toronto',country:'Canada'}:{},latitude:provider==='fronius'?null:43.65,longitude:provider==='fronius'?null:-79.38},{id:otherId,name:'Lake Cabin',latitude:44.57,longitude:-80.94}],candidates:[{systemId:selectedId,matchScore:90}]}:{})});
   throw Error('Unexpected action '+b.action);
  });
  await context.route(provider==='fronius'?'https://login.fronius.com/oauth2/authorize**':'https://api.derapi.com/join/flows/**',async route=>{assert.ok(route.request().url().includes('state=fixture'));status='needs_selection';await route.fulfill({status:303,headers:{location:origin+'/connect/?environment=development&request='+request.id},body:''});});
  await page.goto(origin+'/connect/?environment=development&request='+request.id);await page.getByLabel('Email',{exact:true}).fill('technician@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Connect manufacturer portal'}).click();await page.getByRole('radio',{name:'Maple House'}).waitFor();
  if(provider==='fronius')await page.getByText('12 Maple St, Toronto, Canada',{exact:true}).waitFor();assert.equal(await page.getByRole('radio').count(),2);assert.equal(await page.getByRole('radio',{checked:true}).count(),0);
  await page.getByRole('button',{name:'Connect the selected site'}).click();await page.getByRole('alert').filter({hasText:'Choose the intended site first'}).waitFor();assert.equal(choices.length,0);
  await page.screenshot({path:resolve(artifacts,`technician-select-${provider}-${width}.png`),fullPage:true});
  await page.getByRole('radio',{name:'Maple House'}).check();await page.getByRole('button',{name:'Connect the selected site'}).click();await page.getByText("1 site connected to the requesting owner's Moose account.",{exact:true}).waitFor();assert.deepEqual(choices,[selectedId]);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#request').textContent(),'');
  await page.getByLabel('Email',{exact:true}).fill('other@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('alert').filter({hasText:'another account'}).waitFor();assert.equal(await page.getByRole('radio').count(),0);
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();
 }
 console.log('Fronius and Derapi technician web: OAuth return, no preselection, explicit one-site confirmation, sign-out clearing and wrong-account isolation passed at 390/1280px.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
