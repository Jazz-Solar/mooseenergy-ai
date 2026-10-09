import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root=resolve(new URL('..',import.meta.url).pathname);
const artifacts=resolve(process.env.HEALTH_BROWSER_ARTIFACTS || '../browser');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://local').pathname,file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));
  if(!file.startsWith(root+'/'))throw new Error('Invalid path');
  const body=await readFile(file);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[extname(file)]||'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const stub=`export function createClient(){let session=null,cb=()=>{};return {auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{cb=fn;return {data:{subscription:{unsubscribe(){}}}}},signInWithPassword:async({email})=>{session={user:{id:'admin',email},access_token:'fixture.admin.token'};cb('SIGNED_IN',session);return {data:{session},error:null}},signOut:async()=>{session=null;cb('SIGNED_OUT',null);return {error:null}}}};}`;
const at=h=>new Date(Date.now()+h*3600e3).toISOString();
const site={systemId:'f:ae636650-d4f3-47a1-9bd4-33f07387daa3',systemName:'LDML Community Elders Complex',status:'yellow',issueCount:11,sharedCount:1,privateCount:10,firstObservedAt:at(-123),latestObservedAt:at(-1),summaries:['Inverter down','Production below expected output']};
const shared={id:'shared',systemId:'f:ae636650-d4f3-47a1-9bd4-33f07387daa3',systemName:site.systemName,scope:'site',status:'pending',revision:1,summary:'Inverter down',firstObservedAt:at(-120),latestObservedAt:at(-1),causes:[{kind:'inverter',deviceId:'17',name:'Inverter <17>',reason:'provider_offline'}],events:[]};
const account={...shared,id:'account',scope:'account',accountId:'owner-reference',summary:'Production below expected output',causes:[{kind:'production'}]};
try {
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  let confirmed=false,fail=false,conflict=false,hold=false,release,reviewCalls=[],failAccounts=false,holdAccounts=false,releaseAccounts;
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:stub}));
  await context.route('https://www.solarweb.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Provider navigation fixture</h1>'}));
  await context.route('**/functions/v1/**',async route=>{
   const body=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').at(-1);let data;
   if(name==='admin-stats')data={ok:true,generated_at:at(0),totals:{users:2,systems:1,feedback:0},users:[],feedback:[]};
   else if(body.action==='list' && body.input.view==='assignments'){
    assert.equal(body.input.search,site.systemId);assert.equal(body.input.status,'connected');
    if(holdAccounts)await new Promise(r=>releaseAccounts=r);
    if(failAccounts){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Account fixture unavailable.'}})});return;}
    const connected=i=>({user_id:`owner-${i}`,system_id:site.systemId,status:'connected',customer_name:i===0?'Owner <script>fixture</script>':`Owner ${i}`,customer_email:`owner-${i}@example.invalid`,role:i===50?'technician':'owner',effective_access:i!==50});
    data={data:{rows:body.input.offset===0?Array.from({length:50},(_,i)=>connected(i)):[connected(50),connected(0),{...connected(51),system_id:'another-site'},{...connected(52),status:'revoked'}],total:54,offset:body.input.offset,limit:50,hasMore:body.input.offset===0}};
   }else if(body.action==='health_sites'){
    if(hold)await new Promise(r=>release=r);
    if(fail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture temporarily unavailable.'}})});return;}
    data={data:body.input.systemId?{items:[{...shared,status:confirmed?'confirmed':'pending'},account],total:11,nextOffset:null}:{items:body.input.status==='dismissed'?[]:[{...site,status:confirmed?'red':'yellow'}],total:body.input.status==='dismissed'?0:1,nextOffset:null}};
   }else if(body.action==='health')data={data:{...(body.input.id==='shared'?shared:account),status:confirmed&&body.input.id==='shared'?'confirmed':'pending'}};
   else if(body.action==='review_health'){
    reviewCalls.push(body);
    if(conflict){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'CONFLICT',message:'Review changed'}})});return;}
    confirmed=true;data={data:{...shared,status:'confirmed',revision:2}};
   }else data={data:{schemaVersion:1,reviewFormVersion:2,accessPolicy:'explicit_assignments',rows:[],items:[],total:0,nextOffset:null,hasMore:false}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  try {
   await page.goto(`http://127.0.0.1:${server.address().port}/admin/?environment=development`);
   await page.getByLabel('EMAIL',{exact:true}).fill('admin@example.invalid');await page.getByLabel('PASSWORD',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByRole('heading',{name:'Staff overview'}).waitFor();
   if(label==='mobile')await page.getByRole('button',{name:'Menu',exact:true}).click();
   await page.getByRole('navigation',{name:'Admin navigation'}).getByRole('button',{name:'Site health',exact:true}).click();
   const review=()=>page.getByRole('button',{name:'Review health for '+site.systemName});await review().waitFor();
   assert.equal(await page.locator('[data-health-rows] tbody tr').count(),1);await page.getByText('11 issues · 1 shared · 10 account',{exact:true}).waitFor();
   assert.match(await page.locator('[data-health-duration]').textContent(),/5d 3h/);assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
   const provider=page.locator('[data-health-rows] .site-provider-link');
   assert.equal(await provider.getAttribute('href'),'https://www.solarweb.com/PvSystems/PvSystem?pvSystemId='+site.systemId.slice(2));
   assert.equal(await provider.getAttribute('rel'),'noopener noreferrer');
   const popupPromise=page.waitForEvent('popup');await provider.click();const popup=await popupPromise;await popup.waitForLoadState();assert.ok(popup.url().includes(site.systemId.slice(2)));await popup.close();
   await page.screenshot({path:`${artifacts}/${label}-site-health.png`,fullPage:true});await review().click();
   await page.locator('[data-health-accounts]').getByText('Connected accounts (51)',{exact:true}).waitFor();
   assert.equal(await page.locator('[data-health-accounts] li').count(),51);assert.equal(await page.locator('[data-health-accounts] script').count(),0);
   await page.locator('[data-health-accounts]').getByText('Technician · Access inactive',{exact:true}).waitFor();
   assert.equal(await page.locator('[data-health-accounts]').getByText('owner-51@example.invalid',{exact:true}).count(),0);
   assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);

   await page.getByText('Inverter <17>: reported offline',{exact:true}).waitFor();assert.equal(await page.locator('[data-health-detail] script').count(),0);
   await page.getByLabel('Issue to review').selectOption('1');await page.locator('[data-health-detail]').getByText(/owner-reference/).waitFor();
   await page.getByLabel('Issue to review').selectOption('0');await page.getByLabel('Review note',{exact:true}).fill('Hardware fault verified by staff.');
   await page.getByLabel('Evidence summary to email owners and preferred technicians').fill('Verified inverter 17 offline during daylight.');
   await page.screenshot({path:`${artifacts}/${label}-red-review.png`,fullPage:true});
   conflict=true;await page.getByRole('button',{name:'Save review',exact:true}).click();await page.getByText(/incident changed while you were reviewing/).waitFor();
   assert.equal(await page.getByLabel('Review note',{exact:true}).inputValue(),'Hardware fault verified by staff.');
   conflict=false;await page.getByRole('button',{name:'Save review',exact:true}).click();await page.getByText(/Red fault confirmed. Connected owners/).waitFor();
   assert.equal(reviewCalls.length,2);assert.equal(reviewCalls[0].idempotencyKey,reviewCalls[1].idempotencyKey);assert.equal(reviewCalls[1].input.id,'shared');assert.equal(reviewCalls[1].input.sharedSummary,'Verified inverter 17 offline during daylight.');
   await page.locator('[data-health-rows]').getByText('Red · confirmed',{exact:true}).waitFor();
   failAccounts=true;await review().click();await page.getByRole('button',{name:'Retry accounts',exact:true}).waitFor();assert.equal(await page.locator('[data-health-accounts] li').count(),0);
   failAccounts=false;await page.getByRole('button',{name:'Retry accounts',exact:true}).click();await page.getByText('Connected accounts (51)',{exact:true}).waitFor();await page.getByRole('button',{name:'Close health review',exact:true}).click();

   await page.locator('#health-status').selectOption('dismissed');await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.getByText('No sites match this status.',{exact:true}).waitFor();
   await page.locator('#health-status').selectOption('active');fail=true;await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.getByText(/Fixture temporarily unavailable/).waitFor();assert.equal(await page.locator('[data-health-rows] tr').count(),0);
   fail=false;await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await review().waitFor();
   holdAccounts=true;await review().click();await page.getByText('Loading connected accounts…',{exact:true}).waitFor();await page.getByRole('button',{name:'Close health review',exact:true}).click();
   hold=true;await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.getByText('Loading site health…',{exact:true}).waitFor();
   if(label==='mobile')await page.getByRole('button',{name:'Menu',exact:true}).click();
   await page.getByRole('button',{name:'Sign out',exact:true}).click();release?.();releaseAccounts?.();hold=false;holdAccounts=false;await page.getByRole('button',{name:'Sign In',exact:true}).waitFor();
   assert.equal(await page.locator('[data-health-rows]').count(),0);assert.deepEqual(errors,[]);
   console.log(`${label}: grouped site, duration, exact provider popup, 51 connected accounts over two pages, account retry and stale response clearing, review selection, evidence escaping, conflict retry, red result, filters, error clearing and logout passed`);
  }finally{release?.();releaseAccounts?.();await context.close();}
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
