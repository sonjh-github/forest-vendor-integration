import assert from "node:assert/strict";
import test from "node:test";
import { assertInvokeRequest, assertRegisterRequest, parseVendor } from "../src/shared/contract.js";
import { app } from "../src/app.js";

const observedAt = "2026-09-01T05:10:00.000Z";
const vendor = parseVendor("ndps");
const register = {
  vendor: "NDPS",
  sourceDeviceId: "DEVICE-1",
  reportedByDeviceId: "NMS-1",
  observedAt,
  devices: [
    { vendorDeviceId: "NMS-1", deviceType: "CONTROLLER" },
    { vendorDeviceId: "DEVICE-1", deviceType: "FIELD_DEVICE" },
  ],
};
const invoke = {
  context: { eventExternalId: "EVENT-1", sourceSystem: "vendor-system", occurredAt: observedAt, sourceDeviceId: "DEVICE-1", reportedByDeviceId: "NMS-1" },
  activePath: [{
    sequence: 1,
    fromDeviceId: "DEVICE-1",
    toDeviceId: "NMS-1",
    medium: "VENDOR_DEFINED_MEDIUM",
    evidenceType: "OBSERVED",
    observations: [{ receivedAt: observedAt, channel: "CH-1", rssiDbm: -71, snrDb: 18.5, selected: true }],
  }],
  data: { vendorDefinedField: true },
};

test("공통 register 계약은 URL vendor와 요청 vendor가 같으면 허용한다", () => {
  assert.doesNotThrow(() => assertRegisterRequest(register, vendor));
});

test("register는 reportedByDeviceId 없이 devices만으로 등록 대상을 확인한다", () => {
  const withoutReporter = structuredClone(register) as Partial<typeof register>;
  delete withoutReporter.reportedByDeviceId;
  assert.doesNotThrow(() => assertRegisterRequest(withoutReporter, vendor));
});

test("공통 invoke 계약은 경로별 observations를 허용한다", () => {
  assert.doesNotThrow(() => assertInvokeRequest(invoke));
});

test("최상위 observations는 거부한다", () => {
  assert.throws(() => assertInvokeRequest({ ...invoke, observations: [] }), /activePath\[\]\.observations/);
});

test("경로에 observations가 없으면 거부한다", () => {
  const withoutObservations = structuredClone(invoke);
  delete (withoutObservations.activePath[0] as Partial<(typeof invoke.activePath)[number]>).observations;
  assert.throws(() => assertInvokeRequest(withoutObservations), /observations는 배열/);
});

test("지원하지 않는 URL vendor는 거부한다", () => {
  assert.throws(() => parseVendor("unknown"), /지원하지 않는 vendor/);
});

test("공통 /{vendor}/invoke 라우트는 최상위 observations를 400으로 거부한다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true });
  try {
    const response = await app.request("/ndps/invoke?mode=VALIDATE_ONLY", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...invoke, observations: [] }),
    });
    assert.equal(response.status, 400);
    const body = await response.json() as { error?: { message?: string } };
    assert.match(body.error?.message ?? "", /activePath\[\]\.observations/);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
