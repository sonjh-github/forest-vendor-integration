import assert from "node:assert/strict";
import test from "node:test";
import { assertNdpsInvokeRequest, assertNdpsRegisterRequest } from "../src/ndps/contract.js";

// 아래 장비번호와 시각은 실제 업체 규격 확정 전 사용하는 테스트 전용 임시 값이다.
const observedAt = "2026-08-13T09:00:00.000Z";
const ndpsTopologyFixture = {
  vendor: "NDPS", reportedByDeviceId: "NMS-1", observedAt,
  devices: [{ vendorDeviceId: "NMS-1", deviceType: "TVWS_NMS", connectedTo: null }, { vendorDeviceId: "BASE-1", deviceType: "TVWS_BASE", connectedTo: { vendorDeviceId: "NMS-1", medium: "ETHERNET", evidenceType: "DECLARED" } }, { vendorDeviceId: "CPE-1", deviceType: "TVWS_CPE", connectedTo: { vendorDeviceId: "BASE-1", medium: "TVWS", evidenceType: "DECLARED" } }],
};
const ndpsInvokeFixture = (operationalStatus: string, medium = "TVWS") => ({
  context: { eventExternalId: "E-1", sourceSystem: "ndps", occurredAt: observedAt, sourceDeviceId: "CPE-1", reportedByDeviceId: "NMS-1" },
  activePath: [{ sequence: 1, fromDeviceId: "CPE-1", toDeviceId: "BASE-1", medium, evidenceType: "OBSERVED" }],
  data: { baseDeviceId: "BASE-1", cpeDeviceId: "CPE-1", observedAt, operationalStatus },
});
const ndpsWrongDeviceFixture = { vendor: "NDPS", reportedByDeviceId: "GW-1", observedAt, devices: [{ vendorDeviceId: "GW-1", deviceType: "RTK_LPWA_GATEWAY" }] };
const ndpsUnknownConnectionFixture = { vendor: "NDPS", reportedByDeviceId: "NMS-1", observedAt, devices: [{ vendorDeviceId: "NMS-1", deviceType: "TVWS_NMS", connectedTo: { vendorDeviceId: "UNKNOWN", medium: "TVWS", evidenceType: "DECLARED" } }] };

// 정상 시나리오: 고정 토폴로지와 장비 상태 변형을 검증한다.
test("NDPS: NMS·Base·CPE와 TVWS/Ethernet 링크 등록 (임시 값)", () => {
  assert.doesNotThrow(() => assertNdpsRegisterRequest(ndpsTopologyFixture));
});

for (const operationalStatus of ["ONLINE", "DEGRADED", "OFFLINE"]) {
  test(`NDPS: ${operationalStatus} 상태 수신 (임시 값)`, () => {
    assert.doesNotThrow(() => assertNdpsInvokeRequest(ndpsInvokeFixture(operationalStatus)));
  });
}

test("NDPS: 양방향 TVWS 연결과 품질 지표 수신 (임시 값)", () => {
  const qualityFixture = {
    ...ndpsInvokeFixture("ONLINE"),
    observations: [{ sourceDeviceId: "CPE-1", gatewayDeviceId: "BASE-1", medium: "TVWS", receivedAt: observedAt, rssiDbm: -71, snrDb: 18.5 }],
    data: { ...ndpsInvokeFixture("ONLINE").data, channel: "CH-21", throughputMbps: 18.2, latencyMs: 42, packetLossPct: 0.3, connectedTerminals: 4 },
  };
  assert.doesNotThrow(() => assertNdpsInvokeRequest(qualityFixture));
});

test("NDPS: 백홀 LTE 경로 상태 수신 (임시 값)", () => {
  const backhaulFixture = { ...ndpsInvokeFixture("DEGRADED"), activePath: [{ sequence: 1, fromDeviceId: "CPE-1", toDeviceId: "BASE-1", medium: "TVWS", evidenceType: "OBSERVED" }, { sequence: 2, fromDeviceId: "BASE-1", toDeviceId: "NMS-1", medium: "LTE", evidenceType: "DECLARED" }] };
  assert.doesNotThrow(() => assertNdpsInvokeRequest(backhaulFixture));
});

// 거부 시나리오: 다른 업체 장비·통신방식·불완전 데이터가 섞이지 않도록 검증한다.
test("NDPS: RTK·LPWA 장비 유형 거부 (임시 값)", () => {
  assert.throws(() => assertNdpsRegisterRequest(ndpsWrongDeviceFixture));
});

test("NDPS: LPWA 통신 경로 거부 (임시 값)", () => {
  assert.throws(() => assertNdpsInvokeRequest(ndpsInvokeFixture("ONLINE", "LPWA")));
});

test("NDPS: 등록되지 않은 링크 장비 거부 (임시 값)", () => {
  assert.throws(() => assertNdpsRegisterRequest(ndpsUnknownConnectionFixture));
});

test("NDPS: 필수 상태값 누락 거부 (임시 값)", () => {
  const missingStatusFixture = { ...ndpsInvokeFixture("ONLINE"), data: { baseDeviceId: "BASE-1", cpeDeviceId: "CPE-1", observedAt } };
  assert.throws(() => assertNdpsInvokeRequest(missingStatusFixture));
});
