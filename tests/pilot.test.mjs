import test from 'node:test';
import assert from 'node:assert/strict';
import {selectContacts,reviewState} from '../admin/pilot.js';
const c=(id,name,priority,siteCount,providers=['Fronius'],status='pending')=>({id,name,priority,sites:Array.from({length:siteCount},()=>({name:'Community roof'})),providers,status,decision:'',tracking:{assigneeId:id==='C002'?'ketan':null},outreachStatus:status==='hold'?'on_hold':'not_contacted',email:`${id}@example.invalid`,phone:'',contactType:'Owner'});
const rows=[c('C001','Zoë',2,10),c('C002','Alex',1,2,['Enphase','Fronius'],'hold'),c('C003','Shared office',3,3,['Enphase'])];
test('pilot sorting is numeric, stable and leaves the source unchanged',()=>{
 assert.deepEqual(selectContacts(rows).map(c=>c.id),['C002','C001','C003']);
 assert.deepEqual(selectContacts(rows,{sort:'sites',direction:'desc'}).map(c=>c.sites.length),[10,3,2]);
 assert.deepEqual(selectContacts(rows,{sort:'contact'}).map(c=>c.name),['Alex','Shared office','Zoë']);
 assert.deepEqual(rows.map(c=>c.id),['C001','C002','C003']);
});
test('pilot filters combine priority, provider, review and case-insensitive search across contact/site fields',()=>{
 assert.deepEqual(selectContacts(rows,{priority:'1',provider:'Fronius',review:'on_hold',query:'ALEX community'}).map(c=>c.id),['C002']);
 assert.equal(selectContacts(rows,{query:'zoe'}).length,1);
 assert.equal(selectContacts(rows,{provider:'Enphase'}).length,2);
 assert.equal(selectContacts(rows,{priority:'5'}).length,0);
 assert.equal(selectContacts(rows,{query:'absent'}).length,0);
 assert.equal(reviewState(rows[1]),'On hold');assert.equal(selectContacts(rows,{review:'not_interested'}).length,0);
});

test('Pilot filters assignees and completed signup goals independently from source review labels',()=>{
 const contacts=[...rows,{...rows[0],id:'C004',account:{state:'created'},outreachStatus:'account_created'}];
 assert.equal(selectContacts(contacts,{assignee:'ketan'}).length,1);
 assert.equal(selectContacts(contacts,{assignee:'unassigned'}).length,3);
 assert.equal(selectContacts(contacts,{review:'account_created'})[0].id,'C004');
 assert.equal(reviewState(contacts[3]),'Account created');
});
