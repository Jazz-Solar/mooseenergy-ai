import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSiteHints, siteLabel } from '../admin/site-hints.js';

const site=(number,display_name,display_address)=>({system_id:`f:aaaaaaaa-aaaa-4aaa-8aaa-${String(number).padStart(12,'0')}`,display_name,display_address});

test('address and title hints normalize punctuation and street abbreviations, with the matching street number first',()=>{
  const matching=site(1,'Cedar rooftop','42 Cedar Road, Ottawa');
  const adjacent=site(2,'Cedar neighbour','19 Cedar Road, Ottawa');
  const unrelated=site(3,'Birch roof','42 Birch Road, Toronto');
  const hints=rankSiteHints({address:'42 CEDAR Rd.'},[adjacent,unrelated,matching]);
  assert.equal(hints[0].system_id,matching.system_id);
  assert.equal(hints[0].reason,'Address matches the request');
  assert.ok(!hints.some(hint=>hint.system_id===unrelated.system_id),'A shared street number alone is not a hint');
  assert.equal(rankSiteHints({address:'Cedar rooftop'},[matching])[0].reason,'Site name matches the request');
  assert.equal(rankSiteHints({title:'Cédar rooftop'},[matching])[0].system_id,matching.system_id);
});

test('exact IDs outrank name matches, discovery hints remain available and duplicates retain canonical addresses',()=>{
  const first=site(1,'Exact requested roof','19 Birch Street'), second=site(2,'Cedar roof','42 Cedar Road');
  const request={address:'42 Cedar Road',fronius_system_id:first.system_id.slice(2),candidates:[{systemId:second.system_id,displayName:'Provider name',matchReason:'location'}]};
  const hints=rankSiteHints(request,[second,first]);
  assert.equal(hints[0].system_id,first.system_id);
  assert.equal(hints.length,2);
  assert.equal(hints[1].display_address,'42 Cedar Road');
  assert.equal(rankSiteHints({candidates:request.candidates},[])[0].system_id,second.system_id);
});

test('unrelated/empty requests stay empty, results are bounded, and labels explicitly handle missing addresses',()=>{
  const catalog=Array.from({length:20},(_,i)=>site(i,'Cedar roof '+i,'Cedar Road'));
  assert.deepEqual(rankSiteHints({},catalog),[]);
  assert.deepEqual(rankSiteHints({address:'Unknown Maple Lane'},catalog),[]);
  assert.equal(rankSiteHints({address:'Cedar'},catalog).length,5);
  assert.deepEqual(rankSiteHints({candidates:[{systemId:'javascript:bad',matchReason:'id'}]},[]),[]);
  assert.ok(siteLabel(catalog[0]).includes('Cedar Road'));
  assert.ok(siteLabel(site(30,'Nameless address')).includes('Address not recorded'));
});
