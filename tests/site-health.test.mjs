import { test } from "node:test";
import assert from "node:assert/strict";
import { healthState, healthCause, healthDuration } from "../admin/site-health.js";
test("admin health language requires staff confirmation for red and preserves account scope", () => {
  assert.match(healthState("pending"), /Yellow/);
  assert.match(healthState("confirmed"), /Red/);
  assert.match(healthState("resolved"), /Recovered/);
  assert.match(healthCause({ kind: "production" }), /this account/);
  assert.equal(
    healthCause({
      kind: "inverter",
      deviceId: "17",
      reason: "provider_offline",
    }),
    "17: reported offline",
  );
});
test("issue duration uses elapsed recorded time and handles unavailable or future evidence", () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  assert.equal(healthDuration('2026-10-06T08:15:00Z', now), '3d 3h');
  assert.equal(healthDuration('2026-10-09T10:15:00Z', now), '1h 45m');
  assert.equal(healthDuration('2026-10-09T11:59:30Z', now), 'Less than a minute');
  assert.equal(healthDuration(null, now), 'Not recorded');
  assert.equal(healthDuration('2026-10-10T00:00:00Z', now), 'Not recorded');
  assert.match(healthCause({kind:'inverter',deviceId:'17',reason:'below_70_percent'}), /below 70%/);
});
