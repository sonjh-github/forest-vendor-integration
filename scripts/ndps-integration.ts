import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { supabase } from "../src/tobe/db/client.js";

const observedAt = new Date().toISOString();
const register = {
  vendor: "NDPS", reportedByDeviceId: "SIM-COMMAND-01", observedAt, topologyVersion: "ndps-test-1",
  devices: [
    { vendorDeviceId: "SIM-TVWS-BS-01", deviceType: "TVWS_BASE", connectedTo: { vendorDeviceId: "SIM-COMMAND-01", medium: "ETHERNET", evidenceType: "DECLARED" } },
    { vendorDeviceId: "SIM-TVWS-CPE-01", deviceType: "TVWS_CPE", connectedTo: { vendorDeviceId: "SIM-TVWS-BS-01", medium: "TVWS", evidenceType: "DECLARED" } },
    { vendorDeviceId: "SIM-COMMAND-01", deviceType: "TVWS_NMS", connectedTo: null },
  ],
};
const invoke = {
  context: { eventExternalId: "TEST-NDPS", sourceSystem: "ndps-test", occurredAt: observedAt, sourceDeviceId: "SIM-TVWS-CPE-01", reportedByDeviceId: "SIM-COMMAND-01" },
  activePath: [{ sequence: 1, fromDeviceId: "SIM-TVWS-CPE-01", toDeviceId: "SIM-TVWS-BS-01", medium: "TVWS", evidenceType: "OBSERVED" }],
  data: { baseDeviceId: "SIM-TVWS-BS-01", cpeDeviceId: "SIM-TVWS-CPE-01", observedAt, operationalStatus: "ONLINE" },
};

const registerResponse = await app.request("/ndps/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(register) });
const registerBody = await registerResponse.json() as { data?: { registrationStatus?: string } };
assert.equal(registerResponse.status, 200, JSON.stringify(registerBody));
assert.equal(registerBody.data?.registrationStatus, "MAPPED");

const validateResponse = await app.request("/ndps/invoke?mode=VALIDATE_ONLY", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invoke) });
const validateBody = await validateResponse.json() as { data?: { accepted?: boolean; persisted?: boolean } };
assert.equal(validateResponse.status, 200, JSON.stringify(validateBody));
assert.equal(validateBody.data?.accepted, true);
assert.equal(validateBody.data?.persisted, false);

const requestId = randomUUID();
const deliverResponse = await app.request("/ndps/invoke?mode=DELIVER", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(invoke) });
const deliverBody = await deliverResponse.json() as { data?: { persisted?: boolean; requestId?: string } };
assert.equal(deliverResponse.status, 200, JSON.stringify(deliverBody));
assert.equal(deliverBody.data?.persisted, true);
assert.equal(deliverBody.data?.requestId, requestId);

const { data: stored, error } = await supabase.schema("core").from("vendor_integration_message").select("vendor_code,status").eq("request_id", requestId).single();
assert.ifError(error);
assert.equal(stored.vendor_code, "NDPS");
assert.equal(stored.status, "PERSISTED");

const duplicateResponse = await app.request("/ndps/invoke?mode=DELIVER", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(invoke) });
const duplicateBody = await duplicateResponse.json() as { data?: { duplicate?: boolean } };
assert.equal(duplicateResponse.status, 200);
assert.equal(duplicateBody.data?.duplicate, true);

const healthResponse = await app.request("/ndps/health");
const healthBody = await healthResponse.json() as { data?: { databaseStatus?: string } };
assert.equal(healthResponse.status, 200);
assert.equal(healthBody.data?.databaseStatus, "REACHABLE");

const unknownId = `NDPS-UNMAPPED-${Date.now()}`;
const unmappedRegisterResponse = await app.request("/ndps/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vendor: "NDPS", reportedByDeviceId: unknownId, observedAt, devices: [{ vendorDeviceId: unknownId, deviceType: "TVWS_NMS", connectedTo: null }] }) });
const unmappedRegisterBody = await unmappedRegisterResponse.json() as { data?: { registrationStatus?: string; unmappedDeviceIds?: string[] } };
assert.equal(unmappedRegisterResponse.status, 207);
assert.equal(unmappedRegisterBody.data?.registrationStatus, "UNMAPPED");
assert.deepEqual(unmappedRegisterBody.data?.unmappedDeviceIds, [unknownId]);

const invalidModeResponse = await app.request("/ndps/invoke?mode=UNKNOWN", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invoke) });
assert.equal(invalidModeResponse.status, 400);
console.log("[NDPS] mapped=200 unmapped=207 validate=ACCEPTED deliver=PERSISTED duplicate=IGNORED invalidMode=400 health=REACHABLE");
