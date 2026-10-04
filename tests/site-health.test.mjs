import { test } from "node:test";
import assert from "node:assert/strict";
import { healthState, healthCause } from "../admin/site-health.js";
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
