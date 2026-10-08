import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertTiming, observedHours } from '../admin/alert-monitoring.js';
const row={state:'ready',blockers:[],emailEligibleNow:false,recipients:[{due:true,queued:0}]};
test('notification readiness distinguishes qualification, transport queue and daily cooldown',()=>{
 assert.match(alertTiming(row),/fresh daylight check/);
 assert.match(alertTiming({...row,emailEligibleNow:true}),/Eligible for notification/);
 assert.match(alertTiming({...row,emailEligibleNow:true,recipients:[{queued:1}]}),/queued/);
 assert.match(alertTiming({...row,emailEligibleNow:true,recipients:[{due:false}]}),/interval/);
 assert.match(alertTiming({...row,blockers:['daylight_unavailable']}),/missing/);
 assert.equal(observedHours(47.82),'47.8');assert.equal(observedHours(null),'0.0');
});
