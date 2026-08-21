import assert from "node:assert/strict";
import test from "node:test";

process.env.CORE_SERVER_URL = "http://core.test";
process.env.CORE_REQUEST_TIMEOUT_MS = "1000";

const request = {
  context: { eventExternalId: "E-1", sourceSystem: "ndps", occurredAt: "2026-08-21T00:00:00.000Z", sourceDeviceId: "CPE-1", reportedByDeviceId: "NMS-1" },
  activePath: [{ sequence: 1, fromDeviceId: "CPE-1", toDeviceId: "BASE-1", medium: "TVWS", evidenceType: "OBSERVED" }],
  data: { baseDeviceId: "BASE-1", cpeDeviceId: "CPE-1", observedAt: "2026-08-21T00:00:00.000Z", operationalStatus: "ONLINE" },
};

test("invoke는 캐시 MISS/HIT 모두 core에 HTTP 요청을 한 번만 보낸다", async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const mappings = ["CPE-1", "NMS-1", "BASE-1"].map((vendorDeviceId, index) => ({ vendorDeviceId, assetId: `00000000-0000-4000-8000-00000000000${index}`, mapped: true, assetExists: true, mappingStatus: "ACTIVE" }));
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ data: { accepted: true, mapping: { allMapped: true, mappedDevices: mappings, unmappedDeviceIds: [] }, persisted: true } }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const { invokeNdps } = await import("../src/ndps/integration.js");
  const { clearMappingCache } = await import("../src/core/mapping-cache.js");
  clearMappingCache();

  await invokeNdps(request, "DELIVER");
  assert.equal(requestBodies.length, 1);
  assert.equal(requestBodies[0]?.normalized, false);

  await invokeNdps(request, "DELIVER");
  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[1]?.normalized, true);
  assert.equal((requestBodies[1]?.request as typeof request).context.sourceDeviceId, mappings[0]?.assetId);
});
