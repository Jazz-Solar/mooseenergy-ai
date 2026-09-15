import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root=resolve(new URL('..',import.meta.url).pathname);
const id=n=>`f:aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const request={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',address:'42 Cedar Rd.',customer_name:'Fixture customer',customer_email:'customer@example.invalid',
  user_id:'fixture',email_verified:true,account_active:true,status:'review',version:1,candidates:[],connection_setup:{hosting:'customer'}};
const initial={rows:[request],total:1,hasMore:false};
const catalog=[...Array.from({length:100},(_,i)=>({system_id:id(i),display_name:`Catalog roof ${i}`,display_address:null})),
  {system_id:id(100),display_name:'Cedar rooftop',display_address:'42 Cedar Road, Ottawa'},
  {system_id:id(101),display_name:'Cedar neighbour <img src=x onerror=alert(1)>',display_address:'19 Cedar Road, Ottawa'}];
const browser=await chromium.launch({headless:true});
try {
  for(const [label,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]) {
    const context=await browser.newContext({viewport});
    const page=await context.newPage(), errors=[], decisions=[], offsets=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.exposeFunction('staffCall',async(name,body)=>{
      if(name==='connection-review'){
        decisions.push(body);
        if(decisions.length===1)throw new Error('Temporary failure. Retry.');
        return {};
      }
      assert.equal(name,'staff-site-access');
      if(body.action==='list')return {data:initial};
      assert.equal(body.action,'sites');
      const search=body.input.search.toLowerCase(),offset=body.input.offset;
      const rows=catalog.filter(site=>`${site.display_name} ${site.display_address}`.toLowerCase().includes(search));
      offsets.push(offset);
      return {data:{rows:rows.slice(offset,offset+100),total:rows.length,hasMore:offset+100<rows.length}};
    });
    await page.addInitScript(value=>window.initial=value,initial);
    await context.route('http://127.0.0.1:4173/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/admin/site-access.css"><style>*{box-sizing:border-box}body{margin:0;font:14px sans-serif;background:#101012;color:white}button,select,input{padding:12px}select,input{max-width:100%}#site-access{padding:12px}label{display:block}select,input[type=text]{display:block;width:100%}button{cursor:pointer}</style></head><body><main id="site-access"></main><script type="module">import {mountSiteAccess} from '/admin/site-access.js';window.workspace=mountSiteAccess(document.getElementById('site-access'),window.staffCall,window.initial);</script></body></html>`});
      const file=resolve(root,'.'+path);assert.ok(file.startsWith(root+'/admin/'));
      return route.fulfill({body:await readFile(file),contentType:extname(file)==='.js'?'text/javascript':'text/css'});
    });
    await page.goto('http://127.0.0.1:4173/');
    await page.getByRole('button',{name:'Review customer@example.invalid',exact:true}).click();
    const dialog=page.locator('#access-detail'),hints=dialog.getByRole('region',{name:'Possible sites'}),form=dialog.locator('form');
    await hints.getByText('42 Cedar Road, Ottawa',{exact:true}).waitFor();
    assert.ok(offsets.includes(100),'Hints include matches beyond the first catalog page');
    assert.equal(await form.getByLabel('Known site',{exact:true}).inputValue(),'','Hints alone do not select a site');
    const first=hints.locator('li').first();
    assert.equal(await first.locator('strong').textContent(),'Cedar rooftop');
    assert.equal(await first.locator('a').getAttribute('href'),`https://www.solarweb.com/PvSystemSettings/Permissions?pvSystemId=${id(100).slice(2)}`);
    assert.equal(await hints.locator('img').count(),0,'Site names render as text');
    await first.getByRole('button',{name:'Use this site'}).click();
    assert.equal(await form.getByLabel('Known site',{exact:true}).inputValue(),id(100));
    assert.ok((await form.locator('[name=knownSite] option:checked').textContent()).includes('42 Cedar Road, Ottawa'));
    assert.equal(await form.getByLabel('Verified against',{exact:true}).inputValue(),'authorized_email');
    assert.equal(await form.getByLabel('Customer’s Solar.web permission',{exact:true}).inputValue(),'guest','Even customer-hosted requests start with Guest');
    const reference=await form.getByLabel('Record reference',{exact:true}).inputValue();
    assert.match(reference,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(await form.getByRole('checkbox').isChecked(),false);
    await form.getByRole('button',{name:'Verify & assign',exact:true}).click();
    await form.getByRole('alert').getByText('Check the supporting record, customer permission and JAZZ visibility, then tick the confirmation.',{exact:true}).waitFor();
    assert.equal(decisions.length,0);
    await form.getByRole('checkbox').check();
    await hints.locator('li').nth(1).getByRole('button',{name:'Use this site'}).click();
    assert.equal(await form.getByRole('checkbox').isChecked(),false,'Changing the suggested site clears confirmation');
    assert.equal(await form.getByLabel('Record reference',{exact:true}).inputValue(),reference);
    await first.getByRole('button',{name:'Use this site'}).click();
    await form.getByRole('checkbox').check();
    await form.getByRole('button',{name:'Verify & assign',exact:true}).click();
    await dialog.getByText('Your entries are retained.',{exact:false}).waitFor();
    assert.equal(await form.getByLabel('Record reference',{exact:true}).inputValue(),reference);
    await form.getByRole('button',{name:'Verify & assign',exact:true}).click();
    await page.locator('#access-message').getByText('Verified. This customer now has access to the site.',{exact:true}).waitFor();
    assert.deepEqual(decisions[0],decisions[1],'Retry preserves the reference, verification and idempotency key');
    assert.equal(decisions[1].verification.source,'authorized_email');assert.equal(decisions[1].verification.permission,'guest');
    assert.equal(decisions[1].verification.reference,reference);
    await page.getByRole('button',{name:'Review customer@example.invalid',exact:true}).click();
    assert.notEqual(await dialog.locator('[name=reference]').inputValue(),reference,'A new review form gets its own reference');
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.evaluate(()=>window.workspace.destroy());
    assert.equal(await page.locator('[data-site-hints]').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${label}: address hints across pages, permission links, escaped labels, defaults, confirmation, retries and cleanup`);
    await context.close();
  }
} finally { await browser.close(); }
