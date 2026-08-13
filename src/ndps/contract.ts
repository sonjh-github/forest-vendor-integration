import type { InvokeRequest, RegisterRequest } from "../shared/vendor-contract.js";

const deviceTypes = new Set(["TVWS_BASE", "TVWS_CPE", "TVWS_NMS", "BACKHAUL_ROUTER", "COMMUNICATION_VEHICLE", "OTHER"]);
const media = new Set(["TVWS", "ETHERNET", "LTE", "5G", "LEO", "WIFI", "OTHER", "UNKNOWN"]);
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

export function assertNdpsRegisterRequest(value: unknown): asserts value is RegisterRequest {
  object(value, "NDPS 요청 본문");
  if (value.vendor !== "NDPS") throw new Error("vendor는 NDPS여야 합니다.");
  text(value.reportedByDeviceId, "reportedByDeviceId");
  iso(value.observedAt, "observedAt");
  if (!Array.isArray(value.devices) || value.devices.length === 0) throw new Error("devices는 한 건 이상이어야 합니다.");
  for (const [index, device] of value.devices.entries()) {
    object(device, `devices[${index}]`);
    text(device.vendorDeviceId, `devices[${index}].vendorDeviceId`);
    if (!deviceTypes.has(String(device.deviceType))) throw new Error(`devices[${index}].deviceType은 NDPS 지원 장비가 아닙니다.`);
  }
  const ids = new Set(value.devices.map((device) => (device as Record<string, unknown>).vendorDeviceId));
  if (ids.size !== value.devices.length) throw new Error("devices의 vendorDeviceId가 중복되었습니다.");
  if (!ids.has(value.reportedByDeviceId)) throw new Error("reportedByDeviceId는 devices에 포함되어야 합니다.");
  for (const [index, device] of value.devices.entries()) {
    if (device.connectedTo == null) continue;
    object(device.connectedTo, `devices[${index}].connectedTo`);
    text(device.connectedTo.vendorDeviceId, `devices[${index}].connectedTo.vendorDeviceId`);
    if (!media.has(String(device.connectedTo.medium))) throw new Error(`devices[${index}].connectedTo.medium은 NDPS 지원 통신방식이 아닙니다.`);
    if (!evidence.has(String(device.connectedTo.evidenceType))) throw new Error(`devices[${index}].connectedTo.evidenceType이 올바르지 않습니다.`);
    if (!ids.has(device.connectedTo.vendorDeviceId)) throw new Error(`devices[${index}].connectedTo가 미등록 NDPS 장비를 참조합니다.`);
  }
}

export function assertNdpsInvokeRequest(value: unknown): asserts value is InvokeRequest {
  object(value, "NDPS 요청 본문");
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
    if (!media.has(String(hop.medium))) throw new Error(`activePath[${index}].medium은 NDPS 지원 통신방식이 아닙니다.`);
    if (!evidence.has(String(hop.evidenceType))) throw new Error(`activePath[${index}].evidenceType이 올바르지 않습니다.`);
  }
  object(value.data, "data");
  text(value.data.baseDeviceId, "data.baseDeviceId");
  text(value.data.cpeDeviceId, "data.cpeDeviceId");
  iso(value.data.observedAt, "data.observedAt");
  if (!["ONLINE", "DEGRADED", "OFFLINE"].includes(String(value.data.operationalStatus))) throw new Error("data.operationalStatus가 올바르지 않습니다.");
}
