import test from 'node:test';
import assert from 'node:assert/strict';
import {selectContacts,reviewState,pilotEmailDraft} from '../admin/pilot.js';
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

test('outreach composer targets one recipient and excludes private tracking/source details',()=>{
 const contact={...rows[0],name:'Zoë & Alex',email:'solar+pilot@example.invalid',tracking:{stage:'not_contacted',note:'Private relationship notes'},notes:'Private source',sites:[{name:'Sensitive roof',url:'https://private.invalid'}]};
 const before=structuredClone(contact),draft=pilotEmailDraft(contact),url=new URL(draft.gmail);
 assert.equal(url.origin,'https://mail.google.com');assert.equal(url.searchParams.get('to'),contact.email);
 assert.equal(url.searchParams.get('body'),draft.body);assert.equal(url.searchParams.get('su'),draft.subject);
 assert.match(draft.body,/Hi Zoë & Alex,/);assert.match(draft.body,/Reply here/);
 for(const value of ['Private relationship notes','Private source','Sensitive roof','private.invalid'])assert.ok(!draft.body.includes(value));
 assert.equal(url.searchParams.has('cc'),false);assert.equal(url.searchParams.has('bcc'),false);assert.equal(url.searchParams.has('from'),false);
 assert.equal(new URL(draft.mailto).searchParams.get('body'),draft.body);assert.deepEqual(contact,before);
});

test('holds and declines suppress drafts even when account-created labels take precedence',()=>{
 for(const stage of ['on_hold','not_interested']){
  assert.ok(pilotEmailDraft({...rows[0],tracking:{stage},outreachStatus:'account_created',account:{state:'created'}}).reason);
 }
 assert.ok(pilotEmailDraft({...rows[1],outreachStatus:'follow_up',tracking:{stage:'follow_up',version:1}}).gmail);
});

test('composer rejects multiple recipients and header injection; unknown names use a neutral greeting',()=>{
 for(const email of ['', 'a@example.invalid,b@example.invalid','a@example.invalid; b@example.invalid','a@example.invalid\r\nBcc:b@example.invalid','a@example.invalid?bcc=other@example.invalid']){
  assert.ok(pilotEmailDraft({...rows[0],email}).reason,email);
 }
 assert.match(pilotEmailDraft({...rows[0],name:'<img onerror=alert(1)>'}).body,/^Hi,\n/);
});

test('existing accounts get adoption copy instead of another signup invitation',()=>{
 const draft=pilotEmailDraft({...rows[0],account:{state:'created'}});
 assert.match(draft.body,/your Moose account/);assert.match(draft.subject,/your solar systems/);
});
