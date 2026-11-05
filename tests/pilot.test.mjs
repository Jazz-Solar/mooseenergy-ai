import test from 'node:test';
import assert from 'node:assert/strict';
import {selectContacts,reviewState} from '../admin/pilot.js';
const c=(id,name,priority,siteCount,providers=['Fronius'],status='pending')=>({id,name,priority,sites:Array.from({length:siteCount},()=>({name:'Community roof'})),providers,status,decision:'',email:`${id}@example.invalid`,phone:'',contactType:'Owner'});
const rows=[c('C001','Zoë',2,10),c('C002','Alex',1,2,['Enphase','Fronius'],'hold'),c('C003','Shared office',3,3,['Enphase'])];
test('pilot sorting is numeric, stable and leaves the source unchanged',()=>{
 assert.deepEqual(selectContacts(rows).map(c=>c.id),['C002','C001','C003']);
 assert.deepEqual(selectContacts(rows,{sort:'sites',direction:'desc'}).map(c=>c.sites.length),[10,3,2]);
 assert.deepEqual(selectContacts(rows,{sort:'contact'}).map(c=>c.name),['Alex','Shared office','Zoë']);
 assert.deepEqual(rows.map(c=>c.id),['C001','C002','C003']);
});
test('pilot filters combine priority, provider, review and case-insensitive search across contact/site fields',()=>{
 assert.deepEqual(selectContacts(rows,{priority:'1',provider:'Fronius',review:'Held',query:'ALEX community'}).map(c=>c.id),['C002']);
 assert.equal(selectContacts(rows,{query:'zoe'}).length,1);
 assert.equal(selectContacts(rows,{provider:'Enphase'}).length,2);
 assert.equal(selectContacts(rows,{priority:'5'}).length,0);
 assert.equal(selectContacts(rows,{query:'absent'}).length,0);
 assert.equal(reviewState(rows[1]),'Held');assert.equal(selectContacts(rows,{review:'No'}).length,0);
});
