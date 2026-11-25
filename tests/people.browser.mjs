import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {authStub,fixtureResponse} from './admin-fixtures.mjs';
const root=resolve(new URL('..',import.meta.url).pathname),artifacts=resolve('../browser');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname,file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(root+'/'))throw Error();res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{});
const sites=Array.from({length:88},(_,i)=>({id:`f:${i}`,name:i===87?'Hidden needle':i===86?'<img src=x onerror=alert(1)>':i<2?'Same roof':`Roof ${i}`,provider:i%2?'enphase':'fronius'}));
const users=[{id:'a',name:'Alex Morgan',email:'alex@example.invalid',role:'owner',connected_sites:sites,logins_7d:5,logins_30d:10,feedback_count:1}, {id:'b',name:'Zoë Jones',email:'zoe@example.invalid',role:'technician',connected_sites:[{id:'e:1',name:'West barn',provider:'enphase'}],logins_7d:2}, {id:'c',name:'Casey',email:'casey@example.invalid',role:'owner',connected_sites:[],logins_7d:0}];
try{for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:authStub}));
 let legacy=false;
 await context.route('**/functions/v1/**',route=>{const body=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').at(-1),data=fixtureResponse(name,body);
  if(name==='admin-stats'){
   data.users=users;data.feedback=[{user_id:'a',id:'fb1',category:'bug',message:'Fixture feedback',at:'2026-11-24T12:00:00Z'}];
   data.totals.connectedPhysicalSites=89;
   data.growth.connectedPhysicalDays=data.growth.connectedPhysicalDays.map(d=>({...d,systems:89}));
   if(legacy){delete data.totals.connectedPhysicalSites;delete data.growth.connectedPhysicalDays;}
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const login=async()=>{await page.getByLabel('EMAIL',{exact:true}).fill('preview@example.invalid');await page.getByLabel('PASSWORD',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.locator('.overview-totals').waitFor({state:'attached'});};
 const nav=async name=>{if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.locator('#admin-nav').getByRole('button',{name,exact:true}).click();};
 await page.goto(`http://127.0.0.1:${server.address().port}/admin/?environment=development`);await login();
 assert.match(await page.locator('.overview-totals article').nth(1).textContent(),/Unique sites89Physical sites/);
 assert.match(await page.locator('[data-growth=sites] output').textContent(),/89 sites/);
 await nav('People & access');await page.getByRole('tab',{name:'Users',exact:true}).click();
 assert.equal(await page.locator('[data-person]').count(),3);assert.equal(await page.locator('.people-sites li:visible').count(),0);
 await page.getByLabel('Search accounts',{exact:true}).fill('hidden needle');assert.equal(await page.locator('[data-person]').count(),1);
 const expand=()=>page.getByRole('button',{name:'Show 88 sites for Alex Morgan',exact:true});await expand().focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('.people-sites li:visible').count(),88);
 const panel=await page.locator('[data-site-panel]:visible').boundingBox();assert.ok(panel.x>=0 && panel.x+panel.width<=width, 'expanded sites fit the viewport');assert.equal(await page.locator('.people-sites img').count(),0);
 await page.getByLabel('Search connected sites',{exact:true}).fill('same roof');assert.equal(await page.locator('.people-sites li:visible').count(),2);
 await page.getByLabel('Search connected sites',{exact:true}).fill('enphase');assert.equal(await page.locator('.people-sites li:visible').count(),44);
 await page.getByLabel('Search connected sites',{exact:true}).fill('');await page.getByLabel('Sort connected sites',{exact:true}).selectOption('name-desc');
 assert.match(await page.locator('.people-sites li:visible').first().textContent(),/Same roof/);
 await page.getByLabel('Search accounts',{exact:true}).fill('');await page.getByLabel('Sort accounts',{exact:true}).selectOption('sites-asc');
 assert.equal(await page.locator('[data-person]').first().getAttribute('data-person'),'c');
 assert.equal(await page.getByRole('button',{name:'Hide 88 sites for Alex Morgan',exact:true}).getAttribute('aria-expanded'),'true');
 await page.getByLabel('Sort accounts',{exact:true}).selectOption('sites-desc');assert.equal(await page.locator('[data-person]').first().getAttribute('data-person'),'a');
 await page.getByRole('button',{name:'View feedback from Alex Morgan',exact:true}).click();await page.getByRole('heading',{name:/Feedback from Alex Morgan/}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Hide 88 sites for Alex Morgan',exact:true}).getAttribute('aria-expanded'),'true');
 await page.screenshot({path:`${artifacts}/people-expanded-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Hide 88 sites for Alex Morgan',exact:true}).click();assert.equal(await page.locator('.people-sites li:visible').count(),0);
 await page.getByLabel('Search accounts',{exact:true}).fill('zoe');assert.equal(await page.locator('[data-person]').count(),1);assert.match(await page.locator('[data-person]').textContent(),/Zoë Jones/);
 await page.getByLabel('Search accounts',{exact:true}).fill('no-match');await page.getByText('No accounts match your search.').waitFor();
 await page.getByLabel('Search accounts',{exact:true}).fill('');await page.screenshot({path:`${artifacts}/people-compact-${width}.png`,fullPage:true});
 assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#people-directory').textContent(),'');
 legacy=true;await login();await nav('Overview');assert.match(await page.locator('.overview-totals article').nth(1).textContent(),/Unique sites—/);
 assert.equal(await page.locator('[data-growth=sites]').count(),0);assert.deepEqual(errors,[]);await context.close();console.log(`People and unique sites ${width}px passed`);
}}finally{await browser.close();await new Promise(r=>server.close(r));}
