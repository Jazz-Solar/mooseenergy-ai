import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utilityEvidenceHtml } from '../admin/utility-evidence.js';
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
