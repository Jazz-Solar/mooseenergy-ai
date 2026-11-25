import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),artifacts=resolve('../evidence/web-installer');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!p.startsWith(root+'/'))throw Error();res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]||'application/octet-stream'});res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath()});
const stub=`export function createClient(){let callback=()=>{};let session={user:{id:'fixture-actor'},access_token:'fixture'};return {auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{callback=fn},signOut:async()=>{session=null;callback('SIGNED_OUT',null);return {}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'owner'}})})})}),functions:{invoke:async(name,{body})=>{const r=await fetch('/fixture-edge',{method:'POST',body:JSON.stringify(body)});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:{context:{json:async()=>data}}}}}}}`;
let cases=0;
try{
 for(const mode of ['owner','technician','link'])for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const id='10000000-0000-4000-8000-000000000001',password='fixture + & % secret',sites=Array.from({length:82},(_,i)=>({id:`e:${2000+i}`,name:`Installer site ${i+1}`,latitude:null,longitude:null}));
  let status='awaiting_portal',attempts=0,selected=[],failure=true,ownerStarts=0;
  const view=()=>({id,provider:'enphase',vendor:'enphase',accessMode:mode==='owner'?'own_portal':'technician_managed',siteName:'Requested site',status,canConnect:true,isOwner:mode==='owner',connectedIds:status==='connected'?selected:[],...(status==='needs_selection'?{sites,candidates:[],selectionVersion:'fixture-revision'}:{})});
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:stub}));
  const routeHandler=async route=>{const b=route.request().postDataJSON();const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(mode==='link')assert.equal(b.technicianLink,'fixture-signed-capability');else assert.equal(b.technicianLink,undefined);
   if(b.action==='list')return reply([view()]);
   if(b.action==='status')return reply(view());
   if(b.action==='start'){ownerStarts++;return reply({authorizeUrl:'https://api.enphaseenergy.com/oauth/authorize?response_type=code&state=fixture'});}
   if(b.action==='installerSignIn'){
    attempts++;assert.equal(b.installerEmail,'installer@example.invalid');assert.equal(b.installerPassword,password);assert.equal(b.requestId,id);
    assert.equal(Object.keys(b).length,mode==='link'?5:4);
    if(failure){failure=false;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{code:'ENPHASE_SIGN_IN_FAILED',message:'Enphase could not verify this installer account. Check your Enlighten email and password.'}})});}
    status='needs_selection';return reply(view());
   }
   if(b.action==='selectMany'){assert.equal(mode,'owner');assert.equal(b.selectionVersion,'fixture-revision');selected=b.siteIds;status='connected';return reply(view());}
   if(b.action==='select'){assert.notEqual(mode,'owner');selected=[b.siteId];status='connected';return reply(view());}
   throw Error('Unexpected action '+b.action);
  };
  await context.route(mode==='link'?'**/functions/v1/site-connect':'**/fixture-edge',routeHandler);
  await page.goto(origin+'/connect/?environment=development&request='+id+(mode==='link'?'#setup=fixture-signed-capability':''));
  await page.getByRole('button',{name:'Continue as system owner',exact:true}).waitFor();
  await page.getByRole('button',{name:'Installer or technician',exact:true}).click();
  const email=page.getByLabel('Enlighten email',{exact:true}),secret=page.getByLabel('Enlighten password',{exact:true});
  await email.fill('installer@example.invalid');await secret.fill(password);assert.equal(await secret.getAttribute('type'),'password');
  await page.getByRole('button',{name:'System owner',exact:true}).click();assert.equal(await secret.inputValue(),'');
  await page.getByRole('button',{name:'Installer or technician',exact:true}).click();await secret.fill(password);
  await page.getByRole('button',{name:'Sign in and find sites',exact:true}).click();await page.getByRole('alert').filter({hasText:'could not verify'}).waitFor();assert.equal(await secret.inputValue(),'');assert.equal(attempts,1);
  await secret.fill(password);await page.screenshot({path:resolve(artifacts,`${mode}-${width}-form.png`),fullPage:true});
  await page.getByRole('button',{name:'Sign in and find sites',exact:true}).click();await page.getByText('All sites (82)',{exact:true}).waitFor();
  assert.equal(attempts,2);assert.equal(ownerStarts,0);assert.deepEqual(selected,[]);assert.equal(await page.locator('input[name=site]:checked').count(),0);
  assert(!await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),password));assert(!page.url().includes('installer@example.invalid'));assert(!page.url().includes('secret'));
  await page.locator('summary').click();const role=mode==='owner'?'checkbox':'radio';
  await page.getByRole(role,{name:'Installer site 1',exact:true}).check();
  await page.getByRole(role,{name:'Installer site 2',exact:true}).check();
  assert.equal(await page.locator('input[name=site]:checked').count(),mode==='owner'?2:1);
  await page.screenshot({path:resolve(artifacts,`${mode}-${width}-selection.png`),fullPage:true});
  await page.getByRole('button',{name:mode==='owner'?'Connect 2 sites':'Connect the selected site',exact:true}).click();
  await page.getByText(mode==='owner'?'2 sites connected to your Moose account.':"1 site connected to the requesting owner's Moose account.",{exact:true}).waitFor();
  assert.deepEqual(selected,mode==='owner'?['e:2000','e:2001']:['e:2001']);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await context.close();cases++;
 }
 console.log(JSON.stringify({passed:cases,coverage:'Actual web owner, signed-in technician and signed-link installer forms at 320/390/1280px; wrong-password retry; password cleared on submit and switching; storage/URL privacy; complete 82-site catalog; explicit owner multi-selection and technician single selection.'}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
