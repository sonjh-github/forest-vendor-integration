import assert from "node:assert/strict";
import test from "node:test";
import { assertJininfraInvokeRequest, assertJininfraRegisterRequest } from "../src/jininfra/contract.js";

// 아래 장비번호·인원번호·좌표·시각은 실제 업체 규격 확정 전 사용하는 테스트 전용 임시 값이다.
const observedAt = "2026-08-13T09:00:00.000Z";
const jininfraRegisterFixture = { vendor: "JININFRA", reportedByDeviceId: "GW-1", observedAt, devices: [{ vendorDeviceId: "GW-1", deviceType: "RTK_LPWA_GATEWAY" }, { vendorDeviceId: "TERM-1", deviceType: "RTK_TERMINAL" }] };
const gatewayFixture = (operationalStatus: string, medium?: string) => ({
  payloadType: "RTK_LPWA_GATEWAY",
  context: { eventExternalId: "E-1", sourceSystem: "jininfra", occurredAt: observedAt, sourceDeviceId: "GW-1", reportedByDeviceId: "GW-1" },
  activePath: medium ? [{ sequence: 1, fromDeviceId: "TERM-1", toDeviceId: "GW-1", medium, evidenceType: "OBSERVED" }] : [],
  data: { gatewayDeviceId: "GW-1", observedAt, operationalStatus, rtcmAvailable: operationalStatus !== "OFFLINE", connectedTerminals: operationalStatus === "OFFLINE" ? 0 : 2 },
});
const terminalFixture = (positioningMethod: string, activeLink: string) => ({
  payloadType: "RTK_TERMINAL",
  context: { eventExternalId: "E-1", sourceSystem: "jininfra", occurredAt: observedAt, sourceDeviceId: "TERM-1", reportedByDeviceId: "GW-1" },
  activePath: [{ sequence: 1, fromDeviceId: "TERM-1", toDeviceId: "GW-1", medium: activeLink, evidenceType: "OBSERVED" }],
  data: { terminalDeviceId: "TERM-1", personExternalId: "PERSON-1", observedAt, geometry: { type: "Point", coordinates: [128.1, 35.1] }, positioningMethod, activeLink },
});
const wrongDeviceFixture = { vendor: "JININFRA", reportedByDeviceId: "NMS-1", observedAt, devices: [{ vendorDeviceId: "NMS-1", deviceType: "TVWS_NMS" }] };

// 정상 시나리오: 게이트웨이 상태와 단말 위치 조합을 검증한다.
test("진인프라: RTK 단말·LPWA 게이트웨이 장비 등록 (임시 값)", () => {
  assert.doesNotThrow(() => assertJininfraRegisterRequest(jininfraRegisterFixture));
});

for (const operationalStatus of ["ONLINE", "DEGRADED", "OFFLINE"]) {
  test(`진인프라: 게이트웨이 ${operationalStatus} 상태 수신 (임시 값)`, () => {
    assert.doesNotThrow(() => assertJininfraInvokeRequest(gatewayFixture(operationalStatus)));
  });
}

for (const positioningMethod of ["RTK_FIXED", "RTK_FLOAT", "GNSS"]) for (const activeLink of ["LPWA", "LTE"]) {
  test(`진인프라: 단말 ${positioningMethod}/${activeLink} 위치 수신 (임시 값)`, () => {
    assert.doesNotThrow(() => assertJininfraInvokeRequest(terminalFixture(positioningMethod, activeLink)));
  });
}

test("진인프라: 긴급 단말·배터리·정확도 상태 수신 (임시 값)", () => {
  const emergencyFixture = terminalFixture("RTK_FIXED", "LPWA");
  emergencyFixture.data = { ...emergencyFixture.data, horizontalAccuracyM: 0.03, batteryPercent: 18, emergency: true };
  assert.doesNotThrow(() => assertJininfraInvokeRequest(emergencyFixture));
});

test("진인프라: RTCM 보정정보와 다중 단말 수신 (임시 값)", () => {
  const rtcmFixture = gatewayFixture("ONLINE");
  rtcmFixture.data = { ...rtcmFixture.data, rtcmFormat: "RTCM 3.x", rtcmAvailable: true, correctionAgeSeconds: 1.2, connectedTerminals: 3, receivedTerminalDeviceIds: ["TERM-1", "TERM-2", "TERM-3"] };
  assert.doesNotThrow(() => assertJininfraInvokeRequest(rtcmFixture));
});

// 거부 시나리오: 다른 업체 규격과 잘못된 위치·페이로드를 차단한다.
test("진인프라: TVWS 장비 유형 거부 (임시 값)", () => {
  assert.throws(() => assertJininfraRegisterRequest(wrongDeviceFixture));
});

test("진인프라: TVWS 통신 경로 거부 (임시 값)", () => {
  assert.throws(() => assertJininfraInvokeRequest(gatewayFixture("ONLINE", "TVWS")));
});

test("진인프라: 미지원 payloadType 거부 (임시 값)", () => {
  const unsupportedPayloadFixture = { ...gatewayFixture("ONLINE"), payloadType: "UNKNOWN", data: {} };
  assert.throws(() => assertJininfraInvokeRequest(unsupportedPayloadFixture));
});

test("진인프라: 잘못된 GeoJSON 위치 거부 (임시 값)", () => {
  const invalidGeometryFixture = terminalFixture("GNSS", "LTE");
  invalidGeometryFixture.data.geometry = { type: "LineString", coordinates: [] };
  assert.throws(() => assertJininfraInvokeRequest(invalidGeometryFixture));
});
