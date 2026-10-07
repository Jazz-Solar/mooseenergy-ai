import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmationTarget,completionInput,handoffEndpoint} from '../auth/confirmation.js';
const id='12345678-1234-1234-1234-123456789abc',key='K'.repeat(43),code='fixture-auth-code';
const redirect=`https://mooseenergy.ai/auth/complete/dev/#id=${id}&key=${key}`;
const verify=new URL('https://vjgmkjqfzhnogawlgkrc.supabase.co/auth/v1/verify');
verify.search=new URLSearchParams({token:'test-token-1234567890',type:'signup',redirect_to:redirect});
test('confirmation accepts only pinned signup verification endpoints and matching redirects',()=>{
 assert.equal(confirmationTarget('#'+verify),verify.href);
 for(const target of ['https://evil.invalid',redirect.replace('/dev/','/production/'),redirect+'&key='+key,'moose://auth/callback']){
  const bad=new URL(verify);bad.searchParams.set('redirect_to',target);assert.throws(()=>confirmationTarget('#'+bad));
 }
 const recovery=new URL(verify);recovery.searchParams.set('type','recovery');assert.throws(()=>confirmationTarget('#'+recovery));
 const extra=new URL(verify);extra.searchParams.append('token','other');assert.throws(()=>confirmationTarget('#'+extra));
 const legacy=new URL(verify);legacy.searchParams.set('redirect_to','moose-dev://auth/callback');assert.equal(confirmationTarget('#'+legacy),legacy.href);
 assert.throws(()=>confirmationTarget('#'+verify.href.replace('.supabase.co','.supabase.co.evil.invalid')));
});
test('completion sends a PKCE code to the matching environment and never accepts session tokens',()=>{
 const complete=redirect.replace('/#',`/?code=${code}#`);
 assert.deepEqual(completionInput(complete),{environment:'dev',id,key,code});
 for(const bad of [complete+'&key='+key,complete.replace('?code=','?access_token='),complete.replace('/dev/','/evil/'),complete.replace(code,'a.b.c')])
  assert.throws(()=>completionInput(bad));
 assert.equal(handoffEndpoint('dev'),'https://vjgmkjqfzhnogawlgkrc.supabase.co/functions/v1/signup-handoff');
 assert.throws(()=>handoffEndpoint('__proto__'));
});
