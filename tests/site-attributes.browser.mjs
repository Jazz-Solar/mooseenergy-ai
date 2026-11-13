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
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],saves=[];let conflict=true;
 page.on('pageerror',e=>errors.push(e.message));await context.route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:authStub}));
 await context.route('**/functions/v1/**',route=>{
  const b=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').at(-1);let response;
  if(b.action==='site_attributes')response={data:{model:{revisionId:null,overrides:{max_dc_power_kw:12,tariff_periods:[{rate:.3}]},defaults:{max_dc_power_kw:10,timezone:'America/Toronto',model_mode:'tilted',tilt_degrees:25}},setup:{revisionId:null,address:'12 Example Road',equipment:[]}}};
  else if(b.action==='save_attributes'){saves.push(b);if(conflict)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'CONFLICT',message:'Changed'}})});response={data:{saved:true}};}
  else {response=fixtureResponse(name,b);if(b.action==='health')response.data={...response.data,providerEvidence:[{label:'Gateway not reporting',condition:'GATEWAY_NOT_REPORTING',meaning:'Monitoring data is not reaching the manufacturer. Production may continue.',guidance:'Check gateway connectivity.',source:'fronius',code:'996',state:'reported',startedAt:'2026-11-13T10:00:00Z',observedAt:'2026-11-13T11:00:00Z',deviceIds:['inv-02'],providerMessage:'Communication unavailable <script>unsafe</script>'}]};}
  return route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/admin/?environment=development`);await page.getByLabel('EMAIL',{exact:true}).fill('preview@example.invalid');await page.getByLabel('PASSWORD',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('.growth-charts').waitFor();
 if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sites',exact:true}).click();await page.getByRole('tab',{name:'Site attributes',exact:true}).click();
 await page.getByRole('button',{name:'Edit attributes',exact:true}).click();await page.getByLabel('Panel capacity · kW DC',{exact:true}).fill('15');await page.getByLabel('Site address',{exact:true}).fill('14 Example Road');await page.getByRole('button',{name:'Save attributes',exact:true}).click();await page.getByText('This site changed while you were editing.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Panel capacity · kW DC',{exact:true}).inputValue(),'15');assert.equal(saves[0].input.values.tariff_periods[0].rate,.3);
 conflict=false;await page.getByRole('button',{name:'Save attributes',exact:true}).click();await page.getByText('Shared site attributes saved.',{exact:true}).waitFor();assert.equal(saves[0].idempotencyKey,saves[1].idempotencyKey);
 await page.getByRole('button',{name:'Edit attributes',exact:true}).click();await page.getByLabel('Site address',{exact:true}).waitFor();await page.screenshot({path:`${out}/site-attributes-${width}.png`,fullPage:true});assert(await page.locator('dialog[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByText('FIT rates and verification',{exact:true}).click();await page.getByRole('button',{name:'Edit rate for Community centre',exact:true}).waitFor();await page.getByRole('tab',{name:'Health',exact:true}).click();await page.getByRole('button',{name:'Review health for Community centre',exact:true}).click();await page.getByRole('heading',{name:'Manufacturer evidence',exact:true}).waitFor();assert(await page.getByText('GATEWAY_NOT_REPORTING',{exact:true}).isVisible());assert.equal(await page.locator('.health-dialog script').count(),0);await page.screenshot({path:`${out}/vendor-health-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Close health review',exact:true}).click();
 if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#site-rates').textContent(),'');assert.deepEqual(errors,[]);await context.close();console.log(`Attributes and vendor evidence ${width}px passed`);
}}finally{await browser.close();await new Promise(r=>server.close(r));}
