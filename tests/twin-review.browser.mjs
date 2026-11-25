import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {chromium} from 'playwright';
const root=resolve('.'),out=resolve('../browser-evidence');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,p=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!p.startsWith(root+'/'))throw Error();res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath()}),checks=[];
try{for(const width of [320,390,1280]){
 const context=await browser.newContext({viewport:{width,height:1100}}),page=await context.newPage(),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 const id='11111111-1111-4111-8111-111111111111',site='e:1000';let revision=null,revoked=false,values={timezone:'America/Toronto',exact_latitude:45,exact_longitude:-75,max_dc_power_kw:10};
 const response=()=>({systemId:site,settings:{revisionId:revision,effectiveValues:values,canEdit:true},draftRevision:null,progress:{status:'needs_review',missingFields:['location','orientation','max_ac_power_kw'],values,locationPrecision:'APPROXIMATE',geometrySuggestion:{status:'estimated',pitchDegrees:25,azimuthDegrees:170}}});
 await context.route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:"export function createClient(){throw Error('No Auth account for review links');}"}));
 await context.route('https://server.arcgisonline.com/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
 await context.route('**/functions/v1/site-connect',async route=>{
  const b=route.request().postDataJSON();calls.push(b);assert.equal(b.technicianLink,'v1.review-fixture');assert(!route.request().headers().authorization);
  const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(revoked)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{message:'This link expired.'}})});
  if(b.action==='status')return reply({id,status:'connected',purpose:'review',provider:'enphase',vendor:'enphase',siteName:'Maple House',canConnect:false,connectedIds:[site]});
  assert.equal(b.action,'setup');assert.equal(b.args.p_system,site);assert(['read_site_twin_setup','save_site_twin_setup'].includes(b.operation));
  if(b.operation==='save_site_twin_setup'){assert.equal(b.args.p_expected_revision,revision);assert.equal(b.args.p_expected_draft_revision,null);assert(!('tariff_periods'in b.args.p_values));values={...values,...b.args.p_values};revision='revision-1';}
  return reply(response());
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/connect/?environment=development&request=${id}#setup=v1.review-fixture`);
 await page.getByRole('button',{name:'Complete Digital Twin setup',exact:true}).click();await page.getByLabel('Verified total inverter capacity (kW AC)',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{level:1}).textContent(),'Review site setup');assert.doesNotMatch(await page.locator('#intro').textContent(),/Connect the requested site/);
 assert.equal(await page.getByRole('button',{name:'Connect manufacturer portal'}).count(),0);assert.equal(await page.getByLabel('Site address',{exact:true}).count(),0);assert.equal(await page.getByText('Installation records (optional)',{exact:true}).count(),0);
 await page.getByRole('button',{name:'East',exact:true}).click();await page.getByRole('button',{name:'Confirm this installation pin',exact:true}).click();await page.getByLabel('Verified total inverter capacity (kW AC)',{exact:true}).fill('7.8');
 await page.getByRole('button',{name:'I confirm these installed panel angles',exact:true}).click();await page.getByRole('button',{name:'Save known inputs',exact:true}).click();await page.getByText('Known inputs saved. Remaining items can be completed later.',{exact:true}).waitFor();
 const save=calls.find(c=>c.operation==='save_site_twin_setup');assert.equal(save.args.p_values.max_ac_power_kw,7.8);assert.equal(save.args.p_values.tilt_degrees,25);assert.equal(save.args.p_values.azimuth_degrees,170);assert.equal(save.args.p_values.model_mode,'tilted');assert(save.args.p_values.exact_longitude>-75);assert.equal(save.args.p_values.timezone,undefined);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,`twin-review-${width}.png`),fullPage:true});
 revoked=true;await page.getByRole('button',{name:'Complete Digital Twin setup',exact:true}).click();await page.getByRole('alert').filter({hasText:'expired'}).waitFor();assert.equal(await page.locator('.setup-form').count(),0);assert.deepEqual(errors,[]);checks.push({width,reviewOnly:true,explicitPin:true,partialSave:true,expiredDenied:true});await context.close();
}await writeFile(resolve(out,'twin-review-acceptance.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log('Three review-only web journeys passed.');}finally{await browser.close();await new Promise(r=>server.close(r));}
