import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root=resolve(new URL('..',import.meta.url).pathname);
const artifacts=resolve(process.env.ALERT_BROWSER_ARTIFACTS || '../browser');await mkdir(artifacts,{recursive:true});
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
const now=Date.now(), at=hours=>new Date(now+hours*3600e3).toISOString();
const recipients=['glani@jazzsolar.com','jon@jazzsolar.com','monitoring@jazzsolar.com'].map(email=>({email,lastSentAt:null,nextAllowedAt:null,due:true,queued:0,uncertain:0}));
const base={blockers:[],enrolled:true,connected:true,modelAvailable:true,lastCheckedAt:at(-.02),nextCheckAt:at(.8),emailEligibleNow:false,recipients};
const fixture=[
 {...base,systemId:'ready',siteName:'North roof',state:'ready',devices:[{deviceId:'1',name:'Inverter 01',condition:'underperforming',prequalified:true,mature:true,historicalFirstObservedAt:at(-78),lastObservedAt:at(-.02),fresh:true,observedHours:2}],emailEligibleNow:true,recipients:recipients.map(r=>({...r,lastSentAt:at(-25),nextAllowedAt:at(-1),queued:1}))},
 {...base,systemId:'watch',siteName:'Community centre',state:'watching',devices:[{deviceId:'2',name:'Inverter 02',condition:'offline',firstObservedAt:at(-31),lastObservedAt:at(-.02),observedHours:30.98,qualifiesAt:at(17),fresh:true}]},
 {...base,systemId:'blocked',siteName:'East roof <script>fixture</script>',state:'blocked',blockers:['daylight_unavailable'],modelAvailable:false,devices:[]},
 {...base,systemId:'good',siteName:'South roof',state:'monitoring',devices:[]},
];
try{
 for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let fail=false,hold=false,release;
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:stub}));
  await context.route('**/functions/v1/**',async route=>{
   const body=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').at(-1);
   let data;
   if(name==='admin-stats') data={ok:true,generated_at:at(0),totals:{users:1,systems:4,feedback:0},users:[],feedback:[]};
   else if(body.action==='alert_monitoring') {
    if(hold)await new Promise(r=>release=r);
    if(fail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture temporarily unavailable.'}})});return;}
    const items=fixture.filter(r=>(!body.input.status||r.state===body.input.status)&&r.siteName.toLowerCase().includes((body.input.search||'').toLowerCase()));
    data={data:{generatedAt:at(0),items,total:items.length,nextOffset:null,summary:{ready:1,watching:1,blocked:1,monitoring:1},policy:{automaticEnrollment:true}}};
   }else data={data:{schemaVersion:1,reviewFormVersion:2,accessPolicy:'explicit_assignments',rows:[],items:[],total:0,nextOffset:null,hasMore:false}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  const navigate=async name=>{
   if(label==='mobile')await page.getByRole('button',{name:'Menu',exact:true}).click();
   await page.getByRole('navigation',{name:'Admin navigation'}).getByRole('button',{name,exact:true}).click();
  };
  try {
   await page.goto(`http://127.0.0.1:${server.address().port}/admin/?environment=development`);
   await page.getByLabel('EMAIL',{exact:true}).fill('admin@example.invalid');await page.getByLabel('PASSWORD',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByRole('heading',{name:'Staff overview'}).waitFor();
   await navigate('Alert monitoring');await page.getByRole('heading',{name:'North roof',exact:true}).waitFor();
   assert.equal(await page.locator('#alert-monitoring script').count(),0,'provider text is escaped');
   await page.getByText('Prequalified from history',{exact:true}).waitFor();
   assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true,'no mobile overflow');
   await page.screenshot({path:`${artifacts}/${label}-alert-monitoring.png`,fullPage:true});
   await page.locator('details[data-alert-site="ready"] summary').click();
   await page.locator('details[data-alert-site="ready"]').getByText('jon@jazzsolar.com',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-alert-message]').textContent==='');
   assert.equal(await page.locator('details[data-alert-site="ready"]').getAttribute('open'),'');
   await page.locator('[data-alert-status="watching"]').click();
   await page.waitForFunction(()=>document.querySelectorAll('.alerts-site').length===1);
   assert.equal(await page.locator('.alerts-site').count(),1);
   await page.locator('#alert-monitoring').getByLabel('Search sites',{exact:true}).fill('no match');await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();
   await page.getByText('No sites match this view.',{exact:true}).waitFor();
   await page.locator('#alert-monitoring').getByLabel('Search sites',{exact:true}).fill('');await page.getByLabel('Monitoring status').selectOption('');
   fail=true;await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();await page.getByText(/Monitoring could not be loaded/).waitFor();
   assert.equal(await page.locator('.alerts-site').count(),0,'failed refresh removes stale readiness');
   fail=false;await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();await page.getByRole('heading',{name:'North roof',exact:true}).waitFor();
   hold=true;await page.getByRole('button',{name:'Refresh monitoring',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-alert-message]').textContent.includes('Loading'));
   if(label==='mobile')await page.getByRole('button',{name:'Menu',exact:true}).click();
   await page.getByRole('button',{name:'Sign out',exact:true}).click();
   release?.();hold=false;await page.getByRole('button',{name:'Sign In',exact:true}).waitFor();
   assert.equal(await page.locator('#alert-monitoring').textContent(),'');assert.deepEqual(errors,[]);
   console.log(`${label}: navigation, qualification, progress, recipients, filters, errors and session clearing passed`);
  }finally{release?.();await context.close();}
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
