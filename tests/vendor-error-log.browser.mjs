import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {authStub,fixtureResponse} from './admin-fixtures.mjs';
const root=resolve('.'),out=resolve('../browser');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname,file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(root+'/'))throw Error();res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],calls=[];let fail=false;
 page.on('pageerror',e=>errors.push(e.message));await context.route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:authStub}));
 await context.route('**/functions/v1/**',route=>{
  const b=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').at(-1);let response;
  if(b.action==='vendor_error_log'){
   calls.push(b.input);
   if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Collection fixture offline'}})});
   const at='2026-11-13T12:00:00Z',next={at,systemId:'fixture',alarmId:'1'};
   const row={systemName:'Community centre',systemId:'f:00000000-0000-4000-8000-000000000001',alarmId:'1',firstRecordedAt:at,lastObservedAt:at,noLongerReportedAt:null,interpretation:{source:b.input.cursor?'enphase':'fronius',code:b.input.cursor?'123456':'996',namespace:'Legacy',label:b.input.cursor?'Unclassified manufacturer code':'Gateway not reporting',condition:b.input.cursor?'UNCLASSIFIED':'GATEWAY_NOT_REPORTING',meaning:'Monitoring data unavailable.',guidance:'Review the original message.',providerSeverity:'Warning',providerMessage:'Communication lost <script>unsafe</script>',startedAt:at,deviceIds:['inv-01']}};
   response={data:{items:b.input.code==='none'?[]:[row],nextCursor:b.input.cursor||b.input.code==='none'?null:next,coverage:{total:3,available:1,unavailable:1,partial:0,stale:0,notChecked:1,attention:[{systemName:'West roof',source:'fronius',state:'unavailable',reason:'TIMEOUT',lastAttemptAt:at,lastSuccessAt:null}]}}};
  }else response=fixtureResponse(name,b);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/admin/?environment=development`);await page.getByLabel('EMAIL',{exact:true}).fill('preview@example.invalid');await page.getByLabel('PASSWORD',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('.growth-charts').waitFor();
 if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sites',exact:true}).click();
 await page.getByRole('button',{name:'Error log for Community centre',exact:true}).click();await page.getByText('Gateway not reporting',{exact:true}).waitFor();assert.equal(calls[0].search,'f:00000000-0000-4000-8000-000000000001');
 assert(await page.getByText('Historical message · current state unknown',{exact:true}).isVisible());assert.equal(await page.locator('[data-error-rows] script').count(),0);
 await page.getByText('Sites with incomplete collection (2)',{exact:true}).click();assert(await page.getByText('West roof · Unavailable',{exact:true}).isVisible());
 assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/error-log-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Next messages',exact:true}).click();await page.getByText('Unclassified manufacturer code',{exact:true}).waitFor();assert.equal(calls[1].to,calls[0].to);assert(calls[1].cursor);assert(await page.getByRole('button',{name:'Next messages',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Previous messages',exact:true}).click();await page.getByText('Gateway not reporting',{exact:true}).waitFor();assert.equal(calls[2].cursor,null);
 await page.getByLabel('Site name or reference',{exact:true}).fill('');await page.getByLabel('Manufacturer',{exact:true}).selectOption('enphase');await page.getByLabel('Code',{exact:true}).fill('none');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.getByText(/No manufacturer messages recorded/).waitFor();assert.equal(calls.at(-1).source,'enphase');assert.equal(calls.at(-1).cursor,null);
 fail=true;await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.getByText(/Error log unavailable/).waitFor();assert.equal(await page.locator('[data-error-coverage]').textContent(),'');assert(await page.getByRole('button',{name:'Next messages',exact:true}).isDisabled());
 fail=false;await page.getByRole('button',{name:'Review queue',exact:true}).click();await page.getByRole('button',{name:'Review health for Community centre',exact:true}).waitFor();
 if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#site-health').textContent(),'');assert.deepEqual(errors,[]);await context.close();console.log(`Error log ${width}px passed`);
}}finally{await browser.close();await new Promise(r=>server.close(r));}
