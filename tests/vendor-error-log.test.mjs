import {test} from 'node:test';
import assert from 'node:assert/strict';
import {logState,errorLogRows,collectionCoverage,siteLogContext,healthCheckCodes} from '../admin/vendor-error-log.js';
test('error log keeps manufacturer history distinct from current fault and collection availability',()=>{
 const row={systemName:'<script>site</script>',systemId:'fixture',firstRecordedAt:'2026-11-13T12:00:00Z',interpretation:{source:'fronius',code:'996',namespace:'Legacy',label:'Gateway not reporting',condition:'GATEWAY_NOT_REPORTING',meaning:'No fresh monitoring',guidance:'Check connection',providerMessage:'<img onerror=bad()>',deviceIds:['<device>']}};
 assert.match(logState(row),/Historical message/);
 const html=errorLogRows([row]);assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;device&gt;'));
 assert.match(logState({...row,interpretation:{source:'enphase'},noLongerReportedAt:'2026-11-13'}),/No longer reported/);
 assert.match(logState({...row,interpretation:{source:'enphase'}}),/Open at last observation/);
 assert.match(errorLogRows([]),/does not establish/);
 assert.match(collectionCoverage({total:2,available:0,unavailable:1,partial:0,stale:0,notChecked:1,attention:[]}),/Unavailable collection does not mean there are no errors/);
});

test('a site with no codes still shows its offline warning, confirmation and incomplete historical coverage',()=>{
 const site={systemName:'<site>',source:'fronius',health:{current:{status:'red',retrievedAt:'2026-11-16T12:00Z'},inverters:[{name:'Primo',deviceId:'<device>',warning:true,fresh:false,warningEvidence:{state:'offline',observedAt:'2026-10-06T12:00Z'}}]},incidents:{open:1,confirmed:1},collection:{state:'available',messageCount:0},history:{retainedMessages:0},historyImports:[]};
 const html=siteLogContext(site);assert.match(html,/Reported offline/);assert.match(html,/Confirmed fault/);assert.match(html,/Older manufacturer history has not been imported/);assert.match(html,/Latest reading is not fresh/);assert(!html.includes('<site>'));assert(!html.includes('<device>'));
 assert.match(siteLogContext(null),/Filter to one site/);
 assert.match(healthCheckCodes({state:'available',evidence:[]}),/Known health conditions may still exist/);
 assert.match(healthCheckCodes({state:'unavailable',evidence:null}),/unavailable or incomplete/);
 const codes=healthCheckCodes({state:'available',evidence:[{source:'enphase',code:'79',label:'No power reported',providerMessage:'<script>raw</script>',deviceIds:[]}]});
 assert.match(codes,/enphase 79/);assert(!codes.includes('<script>'));assert.match(codes,/does not create another event/);
});
