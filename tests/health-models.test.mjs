import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonHtml } from '../admin/health-models.js';

export const comparisonFixture = (systemId = 'site-a', date = '2026-10-27') => ({
  systemId, name: systemId === 'site-a' ? 'MIIGWETCH I' : 'MIIGWETCH X', date, timezone: 'America/Toronto', minDate: '2026-09-29', maxDate: '2026-10-29',
  source: { state: 'stale', latestDate: '2026-10-27', scoredAt: '2026-10-29T01:07:33Z', scoredInverters: 1, missingInverters: 1, configuredInverters: 2, unmappedInverters: 0, schedule: 'Daily at 21:00 America/Toronto', environment: 'GCP daily export' },
  twin: { state: 'available', availability: 'available', actualKwh: 0, expectedKwh: 10, performanceRatio: 0, reason: 'below_threshold', calculatedAt: '2026-10-28T05:00:00Z' },
  inverters: [{ label: 'Inv-01', deviceId: 'full-device-id-one', name: 'Inverter <one>', monitoringStatus: 'yellow', monitoringReason: 'provider_offline', conformal: { tier: 'GREEN', score: 0 }, xgb: { tier: 'RED', score: 0.8 } },
    { label: 'Inv-02', deviceId: 'full-device-id-two', name: 'Inverter two', monitoringStatus: null, conformal: null, xgb: null }],
});

test('daily comparison keeps zero, unavailable, stale and model flags distinct', () => {
  const html = comparisonHtml(comparisonFixture());
  assert.match(html, /0 kWh/); assert.match(html, /Unusualness: 0/); assert.match(html, /Predicted loss: 80%/);
  assert.match(html, /Delayed update/); assert.match(html, /Red · model flag/); assert.match(html, /Not scored/);
  assert.match(html, /do not confirm a physical fault or send an alert/);
});

test('model evidence escapes upstream text and does not fabricate missing source results', () => {
  const data = comparisonFixture(); data.name = '<script>alert(1)</script>'; data.inverters[0].name = '<img onerror=alert(1)>';
  data.twin.performanceRatio = null; data.twin.actualKwh = null; data.twin.expectedKwh = null;
  data.source.state = 'unavailable'; data.sourceError = 'not_configured';
  const html = comparisonHtml(data);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img '));
  assert.match(html, /&lt;script&gt;/); assert.match(html, /GCP connection is not configured/); assert.match(html, /Unavailable/);
});
