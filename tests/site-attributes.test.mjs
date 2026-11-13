import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attributeValues,attributeFields} from '../admin/site-attributes.js';
import {vendorEvidenceCards} from '../admin/site-health.js';
test('Attribute form preserves dated tariffs and clears only explicitly blank overrides',()=>{
 const controls=Object.fromEntries([...attributeFields.map(([k])=>k),'model_mode','timezone','utility'].map(k=>[k,{value:'',validity:{badInput:false},labels:[{textContent:k}]}]));
 controls.max_dc_power_kw.value='20';controls.timezone.value='America/Toronto';
 const tariffs=[{rate:.3,currency:'CAD',startDate:'2026-01-01',endDate:'2026-12-31'}];
 const saved=attributeValues({elements:{namedItem:k=>controls[k]}},{max_dc_power_kw:10,tilt_degrees:20,tariff_periods:tariffs});
 assert.equal(saved.max_dc_power_kw,20);assert.equal(saved.tilt_degrees,undefined);assert.deepEqual(saved.tariff_periods,tariffs);
 controls.exact_latitude.value='91';assert.throws(()=>attributeValues({elements:{namedItem:k=>controls[k]}},{}));
});
test('Manufacturer cards render server meaning and preserve escaped references and uncertainty',()=>{
 const card=vendorEvidenceCards([{condition:'GATEWAY_NOT_REPORTING',label:'Gateway not reporting',meaning:'Data unavailable',guidance:'Review readings',source:'fronius',code:'996',state:'reported',providerMessage:'<script>bad</script>',deviceIds:['<device>']}]);
 assert(card.includes('GATEWAY_NOT_REPORTING'));assert(card.includes('current state unknown'));assert(card.includes('&lt;script&gt;'));assert(!card.includes('<script>'));assert(card.includes('&lt;device&gt;'));
});
