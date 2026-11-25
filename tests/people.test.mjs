import test from 'node:test';
import assert from 'node:assert/strict';
import {connectedSites,selectAccounts,selectSites} from '../admin/people.js';
const users=[{id:'b',name:'Zoë',email:'z@example.invalid',role:'technician',connected_sites:[{id:'f:1',name:'Same roof',provider:'fronius'},{id:'f:1',name:'Same roof',provider:'fronius'},{id:'e:2',name:'Same roof',provider:'enphase'}]}, {id:'a',name:'Alex',email:'a@example.invalid',role:'owner',systems:[]}];
test('connected site lists deduplicate by site ID and retain distinct same-name sites',()=>{
  assert.equal(connectedSites(users[0]).length,2);
  assert.equal(connectedSites({systems:['Same roof','Same roof']}).length,2);
  assert.deepEqual(connectedSites({connected_sites:[],systems:['Stale']}),[]);
});
test('account search includes hidden connected sites, vendor, ID, role, email and accents',()=>{
  for(const q of ['zoe','same roof','FRONIUS','e:2','technician','z@example'])assert.deepEqual(selectAccounts(users,q).map(u=>u.id),['b']);
  assert.deepEqual(selectAccounts(users,'unmatched'),[]);
  assert.equal(selectAccounts(users,'   ').length,2);
});
test('account and site sorting is stable and does not mutate source records',()=>{
  assert.deepEqual(selectAccounts(users,'','name-asc').map(u=>u.id),['a','b']);
  assert.deepEqual(selectAccounts(users,'','sites-desc').map(u=>u.id),['b','a']);
  assert.deepEqual(selectAccounts(users,'','sites-asc').map(u=>u.id),['a','b']);
  assert.equal(users[0].id,'b');
  const sites=connectedSites(users[0]);assert.deepEqual(selectSites(sites,'','vendor-asc').map(s=>s.id),['e:2','f:1']);
  assert.deepEqual(selectSites(sites,'FRONIUS').map(s=>s.id),['f:1']);
});
