import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),artifacts=resolve('../browser-evidence');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,p=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!p.startsWith(root+'/'))throw Error();res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]||'application/octet-stream'});res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/home/kali/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const stub=`export function createClient(url,key,options){let callback=()=>{};const saved=()=>JSON.parse(sessionStorage.getItem(options.auth.storageKey)||'null');return {auth:{getSession:async()=>({data:{session:saved()}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}},signInWithPassword:async({email})=>{const session={user:{id:'owner',email},access_token:'fixture'};sessionStorage.setItem(options.auth.storageKey,JSON.stringify(session));callback('SIGNED_IN',session);return {data:{session},error:null}},signOut:async()=>{sessionStorage.removeItem(options.auth.storageKey);callback('SIGNED_OUT',null);return {error:null}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'owner'}})})})}),functions:{invoke:async(name,{body})=>{const r=await fetch('/fixture-edge',{method:'POST',body:JSON.stringify(body)}),data=await r.json();return r.ok?{data,error:null}:{data:null,error:{context:{json:async()=>data}}};}}};}`;
try{
 for(const width of [320,390,1280])for(const count of [1,3,102]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],choices=[];page.on('pageerror',e=>errors.push(e.message));
  const sites=Array.from({length:102},(_,i)=>({id:`e:${1000+i}`,name:`Roof ${i}`,address:{street:`${i} Maple Street`}}));
  let status='needs_selection',stale=false,recommend=true;
  const r={id:'10000000-0000-4000-8000-000000000001',selectionVersion:'10000000-0000-4000-8000-000000000002',provider:'enphase',vendor:'enphase',accessMode:'own_portal',siteName:'Maple roof',canConnect:true,isOwner:true,connectedIds:[]};
  const result=()=>({...r,status,sites,candidates:recommend?sites.slice(0,5).map((s,i)=>({systemId:s.id,matchScore:90-i})):[],connectedIds:choices.at(-1)||[]});
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:stub}));
  await context.route('**/fixture-edge',async route=>{
   const b=route.request().postDataJSON(),reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(b.action==='list')return reply([result()]);if(b.action==='status')return reply(result());
   assert.equal(b.action,'selectMany');assert.equal(b.requestId,r.id);assert.equal(b.selectionVersion,r.selectionVersion);
   if(stale)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{message:'Site list changed. Refresh before selecting.'}})});
   assert.equal(new Set(b.siteIds).size,b.siteIds.length);assert(b.siteIds.every(id=>sites.some(s=>s.id===id)));choices.push(b.siteIds);status='connected';return reply(result());
  });
  await page.goto(origin+'/connect/?environment=development&request='+r.id);await page.getByLabel('Email',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('checkbox',{name:'Roof 0',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').count(),3);assert.equal(await page.locator('input:checked').count(),0);
  await page.getByRole('button',{name:'Connect selected sites',exact:true}).click();await page.getByRole('alert').filter({hasText:'Choose at least one site first.'}).waitFor();assert.equal(choices.length,0);
  if(count===1){
   await page.getByRole('checkbox',{name:'Roof 0',exact:true}).check();stale=true;await page.getByRole('button',{name:'Connect 1 site',exact:true}).click();await page.getByRole('alert').filter({hasText:'Site list changed'}).waitFor();assert.equal(choices.length,0);stale=false;
  }else if(count===3){
   await page.getByRole('checkbox',{name:'Roof 0',exact:true}).check();await page.locator('summary').focus();await page.keyboard.press('Enter');
   await page.getByRole('checkbox',{name:'Roof 100',exact:true}).check();await page.getByRole('checkbox',{name:'Roof 101',exact:true}).check();await page.locator('summary').click();assert.equal(await page.getByRole('checkbox').count(),3);assert.equal(await page.locator('input:checked').count(),3);
  }else{
   await page.getByRole('button',{name:'Select all sites',exact:true}).click();assert.equal(await page.locator('input:checked').count(),102);await page.getByRole('button',{name:'Clear selection',exact:true}).click();assert.equal(await page.locator('input:checked').count(),0);
   recommend=false;await page.reload();await page.getByText('No recommended match. Expand all sites to choose.',{exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').count(),0);
   await page.getByRole('button',{name:'Select all sites',exact:true}).click();assert.equal(await page.locator('input:checked').count(),102);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(artifacts,`owner-select-${count}-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:`Connect ${count} site${count===1?'':'s'}`,exact:true}).click();await page.getByText(`${count} site${count===1?'':'s'} connected to your Moose account.`,{exact:true}).waitFor();
  assert.deepEqual(choices,[count===1?[sites[0].id]:count===3?[sites[0].id,sites[100].id,sites[101].id]:sites.map(s=>s.id)]);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#request').textContent(),'');assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Nine owner browser journeys passed: one/several/all, recommended first, 102-site accordion, no preselection, stale scope, keyboard, mobile layout and sign-out.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
