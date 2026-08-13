import type { InvokeRequest, RegisterRequest } from "../shared/vendor-contract.js";

const deviceTypes = new Set(["RTK_TERMINAL", "RTK_LPWA_GATEWAY", "RTK_BASE_STATION", "NETWORK_CONTROLLER", "BACKHAUL_ROUTER", "COMMUNICATION_VEHICLE", "OTHER"]);
const media = new Set(["LPWA", "ETHERNET", "LTE", "5G", "LEO", "WIFI", "RF_400MHZ", "SERIAL", "OTHER", "UNKNOWN"]);
const evidence = new Set(["OBSERVED", "DECLARED", "INFERRED", "UNKNOWN"]);

function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name}은 객체여야 합니다.`);
}
function text(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}은 비어 있지 않은 문자열이어야 합니다.`);
}
function iso(value: unknown, name: string) {
  text(value, name);
  if (!Number.isFinite(Date.parse(value as string))) throw new Error(`${name}은 ISO 8601 시각이어야 합니다.`);
}

export function assertJininfraRegisterRequest(value: unknown): asserts value is RegisterRequest {
  object(value, "진인프라 요청 본문");
  if (value.vendor !== "JININFRA") throw new Error("vendor는 JININFRA여야 합니다.");
  text(value.reportedByDeviceId, "reportedByDeviceId");
  iso(value.observedAt, "observedAt");
  if (!Array.isArray(value.devices) || value.devices.length === 0) throw new Error("devices는 한 건 이상이어야 합니다.");
  for (const [index, device] of value.devices.entries()) {
    object(device, `devices[${index}]`);
    text(device.vendorDeviceId, `devices[${index}].vendorDeviceId`);
    if (!deviceTypes.has(String(device.deviceType))) throw new Error(`devices[${index}].deviceType은 진인프라 지원 장비가 아닙니다.`);
  }
  const ids = new Set(value.devices.map((device) => (device as Record<string, unknown>).vendorDeviceId));
  if (ids.size !== value.devices.length) throw new Error("devices의 vendorDeviceId가 중복되었습니다.");
  if (!ids.has(value.reportedByDeviceId)) throw new Error("reportedByDeviceId는 devices에 포함되어야 합니다.");
  for (const [index, device] of value.devices.entries()) {
    if (device.connectedTo == null) continue;
    object(device.connectedTo, `devices[${index}].connectedTo`);
    text(device.connectedTo.vendorDeviceId, `devices[${index}].connectedTo.vendorDeviceId`);
    if (!media.has(String(device.connectedTo.medium))) throw new Error(`devices[${index}].connectedTo.medium은 진인프라 지원 통신방식이 아닙니다.`);
    if (!evidence.has(String(device.connectedTo.evidenceType))) throw new Error(`devices[${index}].connectedTo.evidenceType이 올바르지 않습니다.`);
    if (!ids.has(device.connectedTo.vendorDeviceId)) throw new Error(`devices[${index}].connectedTo가 미등록 진인프라 장비를 참조합니다.`);
  }
}

export function assertJininfraInvokeRequest(value: unknown): asserts value is InvokeRequest {
  object(value, "진인프라 요청 본문");
  object(value.context, "context");
  text(value.context.eventExternalId, "context.eventExternalId");
  text(value.context.sourceSystem, "context.sourceSystem");
  iso(value.context.occurredAt, "context.occurredAt");
  text(value.context.sourceDeviceId, "context.sourceDeviceId");
  text(value.context.reportedByDeviceId, "context.reportedByDeviceId");
  if (!Array.isArray(value.activePath)) throw new Error("activePath는 배열이어야 합니다.");
  for (const [index, hop] of value.activePath.entries()) {
    object(hop, `activePath[${index}]`);
    if (!Number.isInteger(hop.sequence) || Number(hop.sequence) < 1) throw new Error(`activePath[${index}].sequence가 올바르지 않습니다.`);
    text(hop.fromDeviceId, `activePath[${index}].fromDeviceId`);
    text(hop.toDeviceId, `activePath[${index}].toDeviceId`);
    if (!media.has(String(hop.medium))) throw new Error(`activePath[${index}].medium은 진인프라 지원 통신방식이 아닙니다.`);
    if (!evidence.has(String(hop.evidenceType))) throw new Error(`activePath[${index}].evidenceType이 올바르지 않습니다.`);
  }
  object(value.data, "data");
  if (value.payloadType === "RTK_TERMINAL") {
    text(value.data.terminalDeviceId, "data.terminalDeviceId");
    text(value.data.personExternalId, "data.personExternalId");
    iso(value.data.observedAt, "data.observedAt");
    object(value.data.geometry, "data.geometry");
    if (value.data.geometry.type !== "Point" || !Array.isArray(value.data.geometry.coordinates) || value.data.geometry.coordinates.length < 2) throw new Error("data.geometry는 GeoJSON Point여야 합니다.");
    if (!["RTK_FIXED", "RTK_FLOAT", "GNSS"].includes(String(value.data.positioningMethod))) throw new Error("data.positioningMethod가 올바르지 않습니다.");
    if (!["LPWA", "LTE"].includes(String(value.data.activeLink))) throw new Error("data.activeLink가 올바르지 않습니다.");
    return;
  }
  if (value.payloadType !== "RTK_LPWA_GATEWAY") throw new Error("payloadType은 RTK_TERMINAL 또는 RTK_LPWA_GATEWAY여야 합니다.");
  text(value.data.gatewayDeviceId, "data.gatewayDeviceId");
  iso(value.data.observedAt, "data.observedAt");
  if (!["ONLINE", "DEGRADED", "OFFLINE"].includes(String(value.data.operationalStatus))) throw new Error("data.operationalStatus가 올바르지 않습니다.");
  if (typeof value.data.rtcmAvailable !== "boolean") throw new Error("data.rtcmAvailable은 boolean이어야 합니다.");
  if (!Number.isInteger(value.data.connectedTerminals) || Number(value.data.connectedTerminals) < 0) throw new Error("data.connectedTerminals가 올바르지 않습니다.");
}
