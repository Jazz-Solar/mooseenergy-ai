import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utilityEvidenceHtml, loadUtilityEvidence } from '../admin/utility-evidence.js';
test('utility evidence hides disabled cohort and preserves missing values and incomplete coverage',()=>{
 assert.equal(utilityEvidenceHtml({visible:false}),'');
 const html=utilityEvidenceHtml({visible:true,state:'connected',evidence:{meter:'<script>bad</script>',direction:'export',totalKwh:null,coverage:0.5,complete:false,generationComparable:false,findings:['Zero export does not establish an outage.']}});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/No usable readings/);assert.match(html,/50% coverage/);assert.match(html,/Missing readings are not zero/);assert.match(html,/inverter production for the same period: Unavailable/);
});
test('net export stays separate from expected solar unless generation arrangement verified',()=>{
 const data={visible:true,state:'connected',inverter:{actualKwh:10,expectedKwh:15,availability:'available'},evidence:{meter:'A',direction:'export',totalKwh:0,coverage:1,complete:true,generationComparable:false,findings:[]}};
 assert.match(utilityEvidenceHtml(data),/0.00 kWh measured/);assert.doesNotMatch(utilityEvidenceHtml(data),/Expected generation: 15/);
 data.evidence.generationComparable=true;assert.match(utilityEvidenceHtml(data),/Expected generation: 15/);
});

test('staff evidence consumes the same unwrapped Edge response as the app',async()=>{
 const expected={visible:true,state:'connected',evidence:{meter:'Hydro fixture',direction:'export',totalKwh:null,coverage:0,complete:false,generationComparable:false,findings:[]}};
 let calls=0;const result=await loadUtilityEvidence(async(name,body)=>{calls++;assert.equal(name,'utility-connection');assert.deepEqual(body,{action:'evidence',systemId:'e:site'});return expected;},'e:site');
 assert.equal(result,expected);assert.equal(calls,1);assert.match(utilityEvidenceHtml(result),/Hydro fixture/);
});
