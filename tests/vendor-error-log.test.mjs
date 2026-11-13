import {test} from 'node:test';
import assert from 'node:assert/strict';
import {logState,errorLogRows,collectionCoverage} from '../admin/vendor-error-log.js';
test('error log keeps manufacturer history distinct from current fault and collection availability',()=>{
 const row={systemName:'<script>site</script>',systemId:'fixture',firstRecordedAt:'2026-11-13T12:00:00Z',interpretation:{source:'fronius',code:'996',namespace:'Legacy',label:'Gateway not reporting',condition:'GATEWAY_NOT_REPORTING',meaning:'No fresh monitoring',guidance:'Check connection',providerMessage:'<img onerror=bad()>',deviceIds:['<device>']}};
 assert.match(logState(row),/Historical message/);
 const html=errorLogRows([row]);assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;device&gt;'));
 assert.match(logState({...row,interpretation:{source:'enphase'},noLongerReportedAt:'2026-11-13'}),/No longer reported/);
 assert.match(logState({...row,interpretation:{source:'enphase'}}),/Open at last observation/);
 assert.match(errorLogRows([]),/does not establish/);
 assert.match(collectionCoverage({total:2,available:0,unavailable:1,partial:0,stale:0,notChecked:1,attention:[]}),/Unavailable collection does not mean there are no errors/);
});
