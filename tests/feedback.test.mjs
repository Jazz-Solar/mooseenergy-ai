import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feedbackDeliveryCell,feedbackMessageCell} from '../admin/feedback.js';
test('feedback escapes content and only links validated Jira keys',()=>{
  const html=feedbackDeliveryCell({destination:'jira',issue_key:'MAI-42',issue_status:'In Progress',issue_priority:'High',checked_at:'2026-11-20T12:00:00Z'});
  assert.ok(html.includes('https://jazzsolar.atlassian.net/browse/MAI-42'));assert.ok(html.includes('In Progress'));assert.ok(html.includes('High'));
  const evil=feedbackDeliveryCell({destination:'jira',issue_key:'javascript:alert(1)',issue_status:'<img onerror=x>',priority:'medium'});
  assert.ok(!evil.includes('href='));assert.ok(evil.includes('&lt;img'));
  assert.ok(feedbackMessageCell({subject:'<script>',message:'&hello',id:'x',has_photo:true}).includes('&lt;script&gt;'));assert.ok(!feedbackMessageCell({id:'x',has_photo:true}).includes('data-feedback-photo'));
  assert.ok(feedbackDeliveryCell({destination:'hubspot',hubspot_ok:true,ticket:'100'}).includes('HubSpot · 100'));
  assert.ok(feedbackDeliveryCell({destination:'jira',delivery_status:'photo_pending'}).includes('Waiting for photo upload'));
});
