import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),artifacts=resolve('../browser-evidence');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!p.startsWith(root+'/'))throw Error();const bytes=await readFile(p);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/home/kali/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});
const stub=`export function createClient(){throw Error('Signed links must not initialize any Auth client');}`;
try{
 for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
  const id='11111111-1111-4111-8111-111111111111',token='v1.private-signed-browser-fixture';
  const sites=Array.from({length:102},(_,i)=>({id:`e:${1000+i}`,name:i===0?'Maple House':`Other roof ${i}`,address:{street:`${i} Maple Street`}}));
  let status='awaiting_portal',revoked=false,revision=null,setupRevision=null,values={},address='12 Maple Street',equipment=[];
  const request=()=>({id,provider:'enphase',vendor:'enphase',accessMode:'technician_managed',siteName:'Maple House',address,status,canConnect:true,isOwner:false,connectedIds:status==='connected'?['e:1000']:[],sites,candidates:[{systemId:'e:1000',matchScore:95}]});
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:stub}));
  await context.route('**/functions/v1/site-connect',async route=>{
   const b=route.request().postDataJSON();calls.push(b);assert.equal(b.technicianLink,token);assert.equal(b.requestId,id);assert(!route.request().headers().authorization);assert(!route.request().headers().referer);assert(!route.request().url().includes(token));
   const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(revoked)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{message:'This setup link is unavailable or has expired. Ask the owner to send a new invitation.'}})});
   if(b.action==='status')return reply(request());
   if(b.action==='start')return reply({authorizeUrl:'https://api.enphaseenergy.com/oauth/authorize?response_type=code&state=fixture'});
   if(b.action==='select'){assert.equal(b.siteId,'e:1000');assert(!b.siteIds);status='connected';return reply(request());}
   assert.equal(b.action,'setup');const name=b.operation,args=b.args;assert.equal(args.p_system||args.p_system_id,'e:1000');
   if(name==='save_site_model_settings'){assert.equal(args.p_expected_revision,revision);values=args.p_values;revision='model-revision';}
   if(name==='save_site_setup'){assert.equal(args.p_expected_revision,setupRevision);address=args.p_address;equipment=args.p_devices;setupRevision='setup-revision';}
   return reply(name.endsWith('site_setup')?{systemId:'e:1000',address,equipment,revisionId:setupRevision}:{systemId:'e:1000',overrides:values,effectiveValues:{timezone:'America/Toronto'},revisionId:revision});
  });
  await context.route('https://api.enphaseenergy.com/oauth/authorize**',async route=>{assert(!route.request().url().includes(token));assert(!route.request().headers().referer);status='needs_selection';await route.fulfill({status:303,headers:{location:origin+'/connect/?environment=development&request='+id},body:''});});
  await context.addInitScript(()=>sessionStorage.setItem('existing-owner-session','preserve'));
  await page.goto(origin+'/connect/?environment=development&request='+id+'#setup='+token);
  await page.getByRole('button',{name:'Connect manufacturer portal'}).waitFor();assert.equal(new URL(page.url()).hash,'');assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).count(),0);
  assert.equal(calls.length,1);assert.equal(calls[0].action,'status'); // Opening an email never starts OAuth or selects a site.
  await page.getByRole('button',{name:'Connect manufacturer portal'}).click();await page.getByRole('radio',{name:'Maple House'}).waitFor();
  assert.equal(await page.getByRole('radio').count(),1);assert.equal(await page.locator('input[name=site]').count(),102);assert.equal(await page.locator('input:checked').count(),0);
  assert.equal(await page.getByRole('button',{name:'Select all sites'}).count(),0);await page.reload();await page.getByRole('radio',{name:'Maple House'}).check();
  await page.getByRole('button',{name:'Connect the selected site'}).click();await page.getByRole('button',{name:'Review site details',exact:true}).click();
  await page.getByLabel('Panel tilt (degrees)',{exact:true}).fill('28');await page.getByLabel('Facing direction (0 north, 90 east, 180 south, 270 west)').fill('195');
  await page.getByRole('button',{name:'Save installation settings',exact:true}).click();await page.getByText('Installation settings saved.',{exact:true}).waitFor();assert.equal(values.tilt_degrees,28);assert.equal(values.azimuth_degrees,195);
  await page.getByLabel('Site address',{exact:true}).fill('23 Maple Street');await page.getByRole('button',{name:'Save address and panel details'}).click();await page.getByText('Site details saved. Available roof and equipment data will refresh automatically.',{exact:true}).waitFor();assert.equal(address,'23 Maple Street');
  await page.screenshot({path:resolve(artifacts,`signed-technician-setup-${width}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('existing-owner-session')),'preserve');
  revoked=true;await page.getByRole('button',{name:'Review site details',exact:true}).click();await page.getByRole('alert').filter({hasText:'expired'}).waitFor();assert.equal(await page.locator('.setup-form').count(),0);
  await page.getByRole('button',{name:'Close setup'}).click();await page.getByText('Setup closed. You can close this tab.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('moose-setup-')).length),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('existing-owner-session')),'preserve');
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();
 }
 console.log('Three signed-link journeys pass at 320/390/1280px: no Auth account, readonly email opening, OAuth return/reload, 102-site accordion, select-one, geometry/address save, revocation, private fragment cleanup and session isolation.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
