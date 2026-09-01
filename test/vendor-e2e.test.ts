import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../src/app.js";
import { clearMappingCache } from "../src/core/mapping-cache.js";

const observedAt = "2026-09-01T05:10:00.000Z";
const ids = ["SENSOR-001", "GATEWAY-001", "NMS-001", "CONTROLLER-001"];
const uuidById = new Map(ids.map((id, index) => [id, `30000000-0000-4000-8000-00000000000${index + 1}`]));

test("업체 관점의 register → validate → deliver → duplicate → health 전체 흐름", async () => {
  const originalFetch = globalThis.fetch;
  const coreMessages: Array<Record<string, unknown>> = [];
  const persistedKeys = new Set<string>();
  clearMappingCache();

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/internal/v1/device-mappings/resolve")) {
      const body = JSON.parse(String(init?.body)) as { deviceIds: string[] };
      const mappings = body.deviceIds.map((vendorDeviceId) => ({ vendorDeviceId, assetId: uuidById.get(vendorDeviceId) ?? null, mapped: uuidById.has(vendorDeviceId), assetExists: uuidById.has(vendorDeviceId), mappingStatus: uuidById.has(vendorDeviceId) ? "ACTIVE" : "UNMAPPED" }));
      return Response.json({ data: mappings });
    }
    if (url.endsWith("/internal/v1/vendor-messages")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown> & { idempotencyKey?: string; mode: string; mappings: unknown[] };
      coreMessages.push(body);
      const duplicate = Boolean(body.idempotencyKey && persistedKeys.has(body.idempotencyKey));
      if (body.mode === "DELIVER" && body.idempotencyKey) persistedKeys.add(body.idempotencyKey);
      return Response.json({ data: { requestId: body.idempotencyKey ?? "40000000-0000-4000-8000-000000000001", accepted: true, duplicate, mode: body.mode, mapping: { allMapped: true, mappedDevices: body.mappings, unmappedDeviceIds: [] }, normalizedPath: [], persisted: body.mode === "DELIVER", recordId: body.mode === "DELIVER" ? body.idempotencyKey : null, processedAt: observedAt } });
    }
    if (url.endsWith("/internal/v1/vendors/NDPS/health")) return Response.json({ data: { diagnosticStatus: "HEALTHY", databaseStatus: "REACHABLE" } });
    return Response.json({ ok: true });
  };

  try {
    const registerResponse = await app.request("/ndps/register", { method: "POST", headers: { "content-type": "application/json", "user-agent": "VENDOR-E2E" }, body: JSON.stringify({ sourceDeviceId: "SENSOR-001", observedAt, devices: ids.map((vendorDeviceId) => ({ vendorDeviceId, deviceType: "VENDOR_DEVICE" })) }) });
    assert.equal(registerResponse.status, 200);
    const registerBody = await registerResponse.json() as { data: { registrationStatus: string } };
    assert.equal(registerBody.data.registrationStatus, "MAPPED");

    const invoke = {
      payloadType: "DEVICE_STATUS",
      context: { eventExternalId: "EVENT-001", sourceSystem: "vendor-system", occurredAt: observedAt, sourceDeviceId: "SENSOR-001" },
      relatedDeviceIds: ["CONTROLLER-001"],
      activePath: [
        { sequence: 1, fromDeviceId: "SENSOR-001", toDeviceId: "GATEWAY-001", medium: "VENDOR_RADIO", evidenceType: "OBSERVED", observations: [{ receivedAt: observedAt, rssiDbm: -72, snrDb: 18.4 }] },
        { sequence: 2, fromDeviceId: "GATEWAY-001", toDeviceId: "NMS-001", medium: "ETHERNET", evidenceType: "DECLARED", observations: [] },
      ],
      data: { observedAt, operationalStatus: "ONLINE" },
    };

    const validateResponse = await app.request("/ndps/invoke?mode=VALIDATE_ONLY", { method: "POST", headers: { "content-type": "application/json", "user-agent": "VENDOR-E2E" }, body: JSON.stringify(invoke) });
    assert.equal(validateResponse.status, 200);
    const validateBody = await validateResponse.json() as { data: { persisted: boolean } };
    assert.equal(validateBody.data.persisted, false);

    const key = "50000000-0000-4000-8000-000000000001";
    const deliver = () => app.request("/ndps/invoke?mode=DELIVER", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": key, "user-agent": "VENDOR-E2E" }, body: JSON.stringify(invoke) });
    const deliverResponse = await deliver();
    assert.equal(deliverResponse.status, 200);
    assert.equal((await deliverResponse.json() as { data: { persisted: boolean } }).data.persisted, true);
    const duplicateResponse = await deliver();
    assert.equal((await duplicateResponse.json() as { data: { duplicate: boolean } }).data.duplicate, true);

    const normalized = (coreMessages[0]?.request as typeof invoke);
    assert.equal(normalized.context.sourceDeviceId, uuidById.get("SENSOR-001"));
    assert.equal(normalized.relatedDeviceIds[0], uuidById.get("CONTROLLER-001"));
    assert.equal(normalized.activePath[0]?.fromDeviceId, uuidById.get("SENSOR-001"));
    assert.equal(normalized.activePath[0]?.observations[0]?.rssiDbm, -72);

    const healthResponse = await app.request("/ndps/health", { headers: { "user-agent": "VENDOR-E2E" } });
    assert.equal(healthResponse.status, 200);
    const healthBody = await healthResponse.json() as { data: { diagnosticStatus: string; databaseStatus: string } };
    assert.deepEqual(healthBody.data, { diagnosticStatus: "HEALTHY", databaseStatus: "REACHABLE" });
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
