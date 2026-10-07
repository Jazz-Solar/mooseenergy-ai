import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),artifacts=process.env.MOOSE_TEST_ARTIFACTS;
const id='12345678-1234-1234-1234-123456789abc',key='K'.repeat(43),code='fixture-auth-code';
const redirect=`https://mooseenergy.ai/auth/complete/dev/#id=${id}&key=${key}`;
const verify=new URL('https://vjgmkjqfzhnogawlgkrc.supabase.co/auth/v1/verify');
verify.search=new URLSearchParams({token:'test-token-1234567890',type:'signup',redirect_to:redirect});
async function serveSite(route) {
 let path=new URL(route.request().url()).pathname;
 if(path.endsWith('/'))path+='index.html';
 if(path==='/favicon.ico')return route.fulfill({status:204});
 const file=resolve(root,'.'+path);assert.ok(file.startsWith(root+'/'));
 return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]});
}
const browser=await chromium.launch({headless:true});
try {
 for(const [label,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]) for(const encoded of [false,true]) {
  const context=await browser.newContext({viewport}), page=await context.newPage(), errors=[], submissions=[];
  let verifications=0, fail=false;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://mooseenergy.ai/**',serveSite);
  await context.route('https://vjgmkjqfzhnogawlgkrc.supabase.co/auth/v1/verify?**',route=>{
   verifications++;
   const target=new URL(redirect);target.searchParams.set('code',code);
   return route.fulfill({contentType:'text/html',body:`<script>location.replace(${JSON.stringify(target.href)})</script>`});
  });
  await context.route('https://vjgmkjqfzhnogawlgkrc.supabase.co/functions/v1/signup-handoff',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'https://mooseenergy.ai','access-control-allow-methods':'POST','access-control-allow-headers':'apikey,content-type'}});
   submissions.push(route.request().postDataJSON());
   return route.fulfill({status:fail?503:200,headers:{'access-control-allow-origin':'https://mooseenergy.ai'},json:fail?{}:{data:{status:'submitted'}}});
  });
  await page.goto('https://mooseenergy.ai/auth/confirm/#'+(encoded?encodeURIComponent(verify.href):verify.href));
  await page.getByRole('button',{name:'Confirm my email'}).waitFor();
  assert.equal(verifications,0,'Loading a scanner link cannot consume confirmation');
  assert.equal(new URL(page.url()).hash,'');
  assert.ok(await page.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0));
  if(artifacts){await mkdir(artifacts,{recursive:true});await page.screenshot({path:resolve(artifacts,`confirmation-${label}-${encoded?'email-button':'plain-link'}.png`),fullPage:true});}
  await page.getByRole('button',{name:'Confirm my email'}).click();
  await page.getByRole('heading',{name:'Your email is confirmed'}).waitFor({timeout:10000});
  assert.equal(verifications,1);assert.equal(submissions.length,1);
  assert.deepEqual(submissions[0],{action:'submit',id,key,code});
  assert.equal(new URL(page.url()).hash,'');assert.equal(new URL(page.url()).search,'');
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  fail=true;
  await page.goto(redirect.replace('/#',`/?code=${code}#`));
  await page.getByRole('button',{name:'Try again'}).waitFor();fail=false;
  await page.getByRole('button',{name:'Try again'}).click();
  await page.getByText('Return to Moose on your phone.',{exact:false}).waitFor();
  assert.equal(submissions.length,3);
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const [environment,project,scheme] of [['dev','vjgmkjqfzhnogawlgkrc','moose-dev'],['production','rcwynvzgzzywrormxlqp','moose']]) {
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  let verifications=0,relayRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://mooseenergy.ai/**',serveSite);
  await context.route(`https://${project}.supabase.co/auth/v1/verify?**`,route=>{
   verifications++;
   const target=new URL(new URL(route.request().url()).searchParams.get('redirect_to'));
   assert.equal(target.href,`https://mooseenergy.ai/auth/complete/${environment}/legacy/`);
   target.searchParams.set('code',code);
   // Playwright's mocked HTTP redirect skips routing for the destination.
   // Navigate explicitly so the destination uses this test's local assets.
   return route.fulfill({contentType:'text/html',body:`<script>location.replace(${JSON.stringify(target.href)})</script>`});
  });
  await context.route('**/functions/v1/signup-handoff',route=>{relayRequests++;return route.abort()});
  const link=new URL(`https://${project}.supabase.co/auth/v1/verify`);
  link.search=new URLSearchParams({token:'pkce_'+'a'.repeat(56),type:'signup',redirect_to:`${scheme}://auth/callback`});
  await page.goto('https://mooseenergy.ai/auth/confirm/#'+encodeURIComponent(link.href));
  await page.getByRole('button',{name:'Confirm my email'}).waitFor();assert.equal(verifications,0);
  await page.getByRole('button',{name:'Confirm my email'}).click();
  await page.getByRole('heading',{name:'Your email is confirmed'}).waitFor();
  assert.equal(page.url(),`https://mooseenergy.ai/auth/complete/${environment}/legacy/`);
  assert.equal(verifications,1);assert.equal(relayRequests,0);
  await page.getByText('Return to Moose on your phone and sign in',{exact:false}).waitFor();
  const open=page.getByRole('button',{name:'Open Moose on this device'});
  assert.equal(await open.isEnabled(),true);
  await open.click();
  await page.getByRole('heading',{name:'Your email is confirmed'}).waitFor();
  assert.equal(await open.isEnabled(),true,'Missing desktop app handler must not leave a disabled button');
  await page.goto(`https://mooseenergy.ai/auth/complete/${environment}/legacy/?error=access_denied#error_code=otp_expired`);
  await page.getByRole('heading',{name:'Return to Moose'}).waitFor();
  assert.equal(await open.isVisible(),false);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Desktop and phone confirmation for HTML email buttons and plain links, scanner protection, code relay and retry passed.');
} finally {await browser.close();}
