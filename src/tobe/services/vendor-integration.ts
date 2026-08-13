import { randomUUID } from "node:crypto";
import { supabase } from "../db/client.js";
import { collectDeviceIds, topologyLinks, type InvokeRequest, type RegisterRequest } from "../../shared/vendor-contract.js";
import { mappingDictionary, type MappingResult } from "../db/asset-mapping.js";
import type { Vendor } from "../../types.js";

type ExternalVendor = Exclude<Vendor, "TOBE">;

export async function registerTopology(vendor: ExternalVendor, request: RegisterRequest, mappings: MappingResult[]) {
  const links = topologyLinks(request);
  const unmappedDeviceIds = mappings.filter((item) => !item.mapped).map((item) => item.vendorDeviceId);
  if (unmappedDeviceIds.length === 0) {
    const { error } = await supabase.schema("core").from("vendor_topology_snapshot").upsert({ vendor_code: vendor, reported_by_device_id: request.reportedByDeviceId, observed_at: request.observedAt, topology_version: request.topologyVersion ?? null, devices: request.devices, links }, { onConflict: "vendor_code,reported_by_device_id,observed_at" });
    if (error) throw error;
  }
  return {
    vendor,
    registrationStatus: unmappedDeviceIds.length === 0 ? "MAPPED" : unmappedDeviceIds.length === mappings.length ? "UNMAPPED" : "PARTIALLY_MAPPED",
    mappedDevices: mappings,
    unmappedDeviceIds,
    linksAccepted: unmappedDeviceIds.length === 0 ? links.length : 0,
    checkedAt: new Date().toISOString(),
  };
}

function normalizeIds(value: unknown, ids: Map<string, string>, key?: string): unknown {
  const scalarKeys = new Set(["reportedByDeviceId", "sourceDeviceId", "fromDeviceId", "toDeviceId", "gatewayDeviceId", "baseDeviceId", "cpeDeviceId", "terminalDeviceId", "baseStationDeviceId"]);
  if (typeof value === "string" && key && scalarKeys.has(key)) return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => key === "receivedTerminalDeviceIds" && typeof item === "string" ? ids.get(item) ?? item : normalizeIds(item, ids));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, normalizeIds(item, ids, childKey)]));
  return value;
}

export async function invokeVendor(vendor: ExternalVendor, request: InvokeRequest, mappings: MappingResult[], deliveryMode: "VALIDATE_ONLY" | "DELIVER", requestIdHeader?: string, defaultPayloadType: string | null = null) {
  const unmappedDeviceIds = mappings.filter((item) => !item.mapped).map((item) => item.vendorDeviceId);
  const idMap = mappingDictionary(mappings);
  const requestId = requestIdHeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestIdHeader) ? requestIdHeader : randomUUID();
  const normalized = normalizeIds(request, idMap) as InvokeRequest;
  if (unmappedDeviceIds.length) return { requestId, accepted: false, mode: deliveryMode, mapping: { allMapped: false, mappedDevices: mappings, unmappedDeviceIds }, normalizedPath: [], persisted: false, recordId: null, processedAt: new Date().toISOString() };
  const normalizedPath = request.activePath.map((hop) => ({ sequence: hop.sequence, fromAssetId: idMap.get(hop.fromDeviceId)!, toAssetId: idMap.get(hop.toDeviceId)!, medium: hop.medium, evidenceType: hop.evidenceType }));
  if (deliveryMode === "DELIVER") {
    const { data: existing, error: findError } = await supabase.schema("core").from("vendor_integration_message").select("request_id,vendor_code").eq("request_id", requestId).maybeSingle();
    if (findError) throw findError;
    if (existing) {
      if (existing.vendor_code !== vendor) throw Object.assign(new Error("동일 Idempotency-Key가 다른 업체 요청에 사용되었습니다."), { code: "23505" });
      return { requestId, accepted: true, duplicate: true, mode: deliveryMode, mapping: { allMapped: true, mappedDevices: mappings, unmappedDeviceIds: [] }, normalizedPath, persisted: true, recordId: requestId, processedAt: new Date().toISOString() };
    }
    const { error } = await supabase.schema("core").from("vendor_integration_message").insert({ request_id: requestId, vendor_code: vendor, event_external_id: request.context.eventExternalId, payload_type: request.payloadType ?? defaultPayloadType, delivery_mode: deliveryMode, source_device_id: request.context.sourceDeviceId, reported_by_device_id: request.context.reportedByDeviceId, occurred_at: request.context.occurredAt, status: "PERSISTED", payload: request, normalized_payload: normalized });
    if (error) throw error;
  }
  return { requestId, accepted: true, duplicate: false, mode: deliveryMode, mapping: { allMapped: true, mappedDevices: mappings, unmappedDeviceIds: [] }, normalizedPath, persisted: deliveryMode === "DELIVER", recordId: deliveryMode === "DELIVER" ? requestId : null, processedAt: new Date().toISOString() };
}
