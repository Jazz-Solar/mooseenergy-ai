import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),artifacts=process.env.MOOSE_TEST_ARTIFACTS;
const id='12345678-1234-1234-1234-123456789abc',key='K'.repeat(43),code='fixture-auth-code';
const redirect=`https://mooseenergy.ai/auth/complete/dev/#id=${id}&key=${key}`;
const verify=new URL('https://vjgmkjqfzhnogawlgkrc.supabase.co/auth/v1/verify');
verify.search=new URLSearchParams({token:'test-token-1234567890',type:'signup',redirect_to:redirect});
const browser=await chromium.launch({headless:true});
try {
 for(const [label,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]) for(const encoded of [false,true]) {
  const context=await browser.newContext({viewport}), page=await context.newPage(), errors=[], submissions=[];
  let verifications=0, fail=false;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://mooseenergy.ai/**',async route=>{
   let path=new URL(route.request().url()).pathname;
   if(path.endsWith('/'))path+='index.html';
   if(path==='/favicon.ico')return route.fulfill({status:204});
   const file=resolve(root,'.'+path);assert.ok(file.startsWith(root+'/'));
   return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]});
  });
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
 console.log('Desktop and phone confirmation for HTML email buttons and plain links, scanner protection, code relay and retry passed.');
} finally {await browser.close();}
