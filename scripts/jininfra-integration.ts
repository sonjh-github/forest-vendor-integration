import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";

const observedAt = new Date().toISOString();
const register = {
  vendor: "JININFRA", sourceDeviceId: "SIM-RTK-BASE-01", reportedByDeviceId: "SIM-RTK-BASE-01", observedAt,
  devices: [
    { vendorDeviceId: "SIM-RTK-BASE-01", deviceType: "RTK_LPWA_GATEWAY" },
    { vendorDeviceId: "SIM-RTK-01", deviceType: "RTK_TERMINAL" },
  ],
};
const invoke = {
  payloadType: "RTK_LPWA_GATEWAY",
  context: { eventExternalId: "TEST-JININFRA", sourceSystem: "jininfra-test", occurredAt: observedAt, sourceDeviceId: "SIM-RTK-BASE-01", reportedByDeviceId: "SIM-RTK-BASE-01" },
  activePath: [{ sequence: 1, fromDeviceId: "SIM-RTK-01", toDeviceId: "SIM-RTK-BASE-01", medium: "LPWA", evidenceType: "OBSERVED", observations: [{ receivedAt: observedAt, rssiDbm: -76, snrDb: 13.2, selected: true }] }],
  data: { gatewayDeviceId: "SIM-RTK-BASE-01", observedAt, operationalStatus: "ONLINE", rtcmAvailable: true, connectedTerminals: 1, receivedTerminalDeviceIds: ["SIM-RTK-01"] },
};

const registerResponse = await app.request("/jininfra/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(register) });
const registerBody = await registerResponse.json() as { data?: { registrationStatus?: string } };
assert.equal(registerResponse.status, 200, JSON.stringify(registerBody));
assert.equal(registerBody.data?.registrationStatus, "MAPPED");

const validateResponse = await app.request("/jininfra/invoke?mode=VALIDATE_ONLY", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invoke) });
const validateBody = await validateResponse.json() as { data?: { accepted?: boolean; persisted?: boolean } };
assert.equal(validateResponse.status, 200, JSON.stringify(validateBody));
assert.equal(validateBody.data?.accepted, true);
assert.equal(validateBody.data?.persisted, false);

const requestId = randomUUID();
const deliverResponse = await app.request("/jininfra/invoke?mode=DELIVER", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(invoke) });
const deliverBody = await deliverResponse.json() as { data?: { persisted?: boolean; requestId?: string } };
assert.equal(deliverResponse.status, 200, JSON.stringify(deliverBody));
assert.equal(deliverBody.data?.persisted, true);
assert.equal(deliverBody.data?.requestId, requestId);

const duplicateResponse = await app.request("/jininfra/invoke?mode=DELIVER", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(invoke) });
const duplicateBody = await duplicateResponse.json() as { data?: { duplicate?: boolean } };
assert.equal(duplicateResponse.status, 200);
assert.equal(duplicateBody.data?.duplicate, true);

const healthResponse = await app.request("/jininfra/health");
const healthBody = await healthResponse.json() as { data?: { databaseStatus?: string } };
assert.equal(healthResponse.status, 200);
assert.equal(healthBody.data?.databaseStatus, "REACHABLE");

const unknownId = `JININFRA-UNMAPPED-${Date.now()}`;
const unmappedRegisterResponse = await app.request("/jininfra/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vendor: "JININFRA", sourceDeviceId: unknownId, reportedByDeviceId: unknownId, observedAt, devices: [{ vendorDeviceId: unknownId, deviceType: "RTK_LPWA_GATEWAY" }] }) });
const unmappedRegisterBody = await unmappedRegisterResponse.json() as { data?: { registrationStatus?: string; unmappedDeviceIds?: string[] } };
assert.equal(unmappedRegisterResponse.status, 207);
assert.equal(unmappedRegisterBody.data?.registrationStatus, "UNMAPPED");
assert.deepEqual(unmappedRegisterBody.data?.unmappedDeviceIds, [unknownId]);

const invalidModeResponse = await app.request("/jininfra/invoke?mode=UNKNOWN", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invoke) });
assert.equal(invalidModeResponse.status, 400);
console.log("[JININFRA] mapped=200 unmapped=207 validate=ACCEPTED deliver=PERSISTED duplicate=IGNORED invalidMode=400 health=REACHABLE");
