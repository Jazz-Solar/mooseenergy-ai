import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {authStub,fixtureResponse} from './admin-fixtures.mjs';
const root=resolve(new URL('..',import.meta.url).pathname),artifacts=resolve('../browser');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname,file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(root+'/'))throw Error();res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:authStub}));
 await context.route('**/functions/v1/**',route=>{const body=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').at(-1);calls.push(body);return route.fulfill({contentType:'application/json',body:JSON.stringify(fixtureResponse(name,body))});});
 await page.goto(`http://127.0.0.1:${server.address().port}/admin/?environment=development`);
 await page.getByLabel('EMAIL',{exact:true}).fill('preview@example.invalid');await page.getByLabel('PASSWORD',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await page.locator('.growth-charts').waitFor();assert.equal(await page.locator('#admin-nav button').count(),5);assert.equal(await page.getByRole('button',{name:'Onboarding',exact:true}).count(),0);
 assert.equal(await page.locator('.growth-card').count(),2);assert.equal(await page.locator('[data-growth-range]').first().getAttribute('max'),'29');
 await page.getByRole('button',{name:'90 days',exact:true}).click();assert.equal(await page.locator('[data-growth-range]').first().getAttribute('max'),'89');
 await page.locator('#growth-users').focus();await page.keyboard.press('Home');assert.match(await page.locator('[data-growth=users] output').textContent(),/49 users/);
 await page.screenshot({path:`${artifacts}/overview-${width}.png`,fullPage:true});
 const nav=async name=>{if(width<900)await page.getByRole('button',{name:'Menu',exact:true}).click();await page.locator('#admin-nav').getByRole('button',{name,exact:true}).click();};
 await nav('Sites');assert.equal(await page.getByRole('tab').count(),3);await page.getByRole('tab',{name:'Health',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Alerts',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('region',{name:'Site alerts table',exact:true}).waitFor();await page.screenshot({path:`${artifacts}/sites-alerts-${width}.png`,fullPage:true});
 await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Site attributes',exact:true}).getAttribute('aria-selected'),'true');await page.getByRole('button',{name:'Edit attributes',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Health',exact:true}).click();await page.getByRole('button',{name:'Review health for Community centre',exact:true}).click();
 await page.locator('dialog .model-verdict').waitFor();assert.match(await page.locator('dialog .models-caption').textContent(),/Community centre/);assert.equal(await page.locator('dialog .fault-card').count(),2);
 assert.match(await page.locator('dialog .model-verdict').textContent(),/Models agree/);assert.equal(await page.locator('dialog [data-model-site]').isVisible(),false);
 await page.screenshot({path:`${artifacts}/review-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Close health review',exact:true}).click();
 await page.getByRole('button',{name:'Review health for West roof',exact:true}).click();await page.getByText('Digital Twin / GCP comparison is not available for this site.',{exact:true}).waitFor();assert.ok(!calls.some(c=>c.action==='health_model_comparison'&&c.input.systemId==='unsupported-site'));await page.getByRole('button',{name:'Close health review',exact:true}).click();
 await page.locator('[data-show-models]').click();await page.getByRole('heading',{name:'Digital Twin',exact:true}).waitFor();await page.screenshot({path:`${artifacts}/sites-models-${width}.png`,fullPage:true});
 await nav('People & access');assert.equal(await page.getByRole('tab').count(),5);for(const label of ['Requests','Assignments','Active access','History','Users']){await page.getByRole('tab',{name:label,exact:true}).click();assert.equal(await page.getByRole('tab',{name:label,exact:true}).getAttribute('aria-selected'),'true');}
 await page.screenshot({path:`${artifacts}/people-${width}.png`,fullPage:true});
 await page.evaluate(()=>location.hash='#health');await page.getByRole('heading',{name:'Sites',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Health',exact:true}).getAttribute('aria-selected'),'true');
 await page.evaluate(()=>location.hash='#pipeline');await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();
 assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 if(width<900){await page.getByRole('button',{name:'Menu',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('#admin-menu').getAttribute('aria-expanded'),'false');await page.getByRole('button',{name:'Menu',exact:true}).click();}
 await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#overview-content').textContent(),'');assert.equal(await page.locator('#admin-tabs').textContent(),'');assert.deepEqual(errors,[]);assert.ok(!calls.some(c=>['review_health','save_rate','save_mapping'].includes(c.action)));
 await context.close();console.log(`Admin polish ${width}px: overview, keyboard tabs, legacy links, matched review comparison, unsupported sites, account tabs and sign-out passed`);
}}finally{await browser.close();await new Promise(r=>server.close(r));}
