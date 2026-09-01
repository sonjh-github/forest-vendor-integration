import type { InvokeRequest, RegisterRequest } from "./vendor-contract.js";
import type { ExternalVendor } from "../core/types.js";

const vendors = new Set<ExternalVendor>(["NDPS", "JININFRA"]);
const evidenceTypes = new Set(["OBSERVED", "DECLARED", "INFERRED", "UNKNOWN"]);

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

export function parseVendor(value: string): ExternalVendor {
  const vendor = value.toUpperCase() as ExternalVendor;
  if (!vendors.has(vendor)) throw new Error("지원하지 않는 vendor입니다.");
  return vendor;
}

export function assertRegisterRequest(value: unknown, pathVendor: ExternalVendor): asserts value is RegisterRequest {
  object(value, "register 요청 본문");
  if (value.vendor !== undefined && value.vendor !== pathVendor) throw new Error(`vendor를 보내는 경우 URL의 ${pathVendor}와 같아야 합니다.`);
  value.vendor = pathVendor;
  text(value.sourceDeviceId, "sourceDeviceId");
  if (value.reportedByDeviceId !== undefined) text(value.reportedByDeviceId, "reportedByDeviceId");
  iso(value.observedAt, "observedAt");
  if (!Array.isArray(value.devices) || value.devices.length === 0) throw new Error("devices는 한 건 이상이어야 합니다.");
  for (const [index, device] of value.devices.entries()) {
    object(device, `devices[${index}]`);
    text(device.vendorDeviceId, `devices[${index}].vendorDeviceId`);
    text(device.deviceType, `devices[${index}].deviceType`);
  }
  const ids = new Set(value.devices.map((device) => (device as Record<string, unknown>).vendorDeviceId));
  if (ids.size !== value.devices.length) throw new Error("devices의 vendorDeviceId가 중복되었습니다.");
  if (!ids.has(value.sourceDeviceId)) throw new Error("sourceDeviceId는 devices에 포함되어야 합니다.");
  if (value.reportedByDeviceId !== undefined && !ids.has(value.reportedByDeviceId)) throw new Error("reportedByDeviceId를 보내는 경우 devices에 포함되어야 합니다.");
}

export function assertInvokeRequest(value: unknown): asserts value is InvokeRequest {
  object(value, "invoke 요청 본문");
  if ("observations" in value) throw new Error("최상위 observations는 사용할 수 없습니다. activePath[].observations를 사용하세요.");
  object(value.context, "context");
  text(value.context.eventExternalId, "context.eventExternalId");
  text(value.context.sourceSystem, "context.sourceSystem");
  iso(value.context.occurredAt, "context.occurredAt");
  text(value.context.sourceDeviceId, "context.sourceDeviceId");
  if (value.context.reportedByDeviceId !== undefined) text(value.context.reportedByDeviceId, "context.reportedByDeviceId");
  if (value.relatedDeviceIds !== undefined && (!Array.isArray(value.relatedDeviceIds) || !value.relatedDeviceIds.every((id) => typeof id === "string" && id.trim()))) throw new Error("relatedDeviceIds는 비어 있지 않은 장비번호 배열이어야 합니다.");
  if (!Array.isArray(value.activePath)) throw new Error("activePath는 배열이어야 합니다.");
  for (const [hopIndex, hop] of value.activePath.entries()) {
    object(hop, `activePath[${hopIndex}]`);
    if (!Number.isInteger(hop.sequence) || Number(hop.sequence) < 1) throw new Error(`activePath[${hopIndex}].sequence가 올바르지 않습니다.`);
    text(hop.fromDeviceId, `activePath[${hopIndex}].fromDeviceId`);
    text(hop.toDeviceId, `activePath[${hopIndex}].toDeviceId`);
    text(hop.medium, `activePath[${hopIndex}].medium`);
    if (!evidenceTypes.has(String(hop.evidenceType))) throw new Error(`activePath[${hopIndex}].evidenceType이 올바르지 않습니다.`);
    if (!Array.isArray(hop.observations)) throw new Error(`activePath[${hopIndex}].observations는 배열이어야 합니다.`);
    for (const [observationIndex, observation] of hop.observations.entries()) {
      object(observation, `activePath[${hopIndex}].observations[${observationIndex}]`);
      iso(observation.receivedAt, `activePath[${hopIndex}].observations[${observationIndex}].receivedAt`);
      if (observation.selected !== undefined && typeof observation.selected !== "boolean") throw new Error(`activePath[${hopIndex}].observations[${observationIndex}].selected는 boolean이어야 합니다.`);
      for (const key of ["rssiDbm", "snrDb"] as const) {
        if (observation[key] !== undefined && observation[key] !== null && typeof observation[key] !== "number") throw new Error(`activePath[${hopIndex}].observations[${observationIndex}].${key}는 숫자여야 합니다.`);
      }
    }
  }
  object(value.data, "data");
}
