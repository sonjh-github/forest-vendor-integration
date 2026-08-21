import { collectDeviceIds, type InvokeRequest, type RegisterRequest } from "../shared/vendor-contract.js";
import { fetchMappings } from "./client.js";
import { readMappings } from "./mapping-cache.js";
import { writeMappings } from "./mapping-cache.js";
import type { ExternalVendor, MappingResult } from "./types.js";

function normalizeIds(value: unknown, ids: Map<string, string>, key?: string): unknown {
  const scalarKeys = new Set(["reportedByDeviceId", "sourceDeviceId", "fromDeviceId", "toDeviceId", "gatewayDeviceId", "baseDeviceId", "cpeDeviceId", "terminalDeviceId", "baseStationDeviceId"]);
  if (typeof value === "string" && key && scalarKeys.has(key)) return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => key === "receivedTerminalDeviceIds" && typeof item === "string" ? ids.get(item) ?? item : normalizeIds(item, ids));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, normalizeIds(item, ids, childKey)]));
  return value;
}

export function prepareCoreRequest(vendor: ExternalVendor, request: InvokeRequest): { request: InvokeRequest; mappings: MappingResult[]; normalized: boolean } {
  const ids = [...collectDeviceIds(request)];
  const { hits, misses } = readMappings(vendor, ids);
  if (misses.length) return { request, mappings: hits, normalized: false };
  const dictionary = new Map(hits.filter((item) => item.assetId).map((item) => [item.vendorDeviceId, item.assetId!]));
  return { request: normalizeIds(request, dictionary) as InvokeRequest, mappings: hits, normalized: true };
}

export async function registerCoreDevices(vendor: ExternalVendor, request: RegisterRequest) {
  const deviceIds = [...collectDeviceIds(request)];
  const deviceTypes = Object.fromEntries(request.devices.map((device) => [device.vendorDeviceId, device.deviceType]));
  const mappings = await fetchMappings(vendor, deviceIds, deviceTypes);
  writeMappings(vendor, mappings);
  const unmappedDeviceIds = mappings.filter((item) => !item.mapped).map((item) => item.vendorDeviceId);
  return {
    vendor,
    registrationStatus: unmappedDeviceIds.length === 0 ? "MAPPED" : unmappedDeviceIds.length === mappings.length ? "UNMAPPED" : "PARTIALLY_MAPPED",
    mappedDevices: mappings,
    unmappedDeviceIds,
    checkedAt: new Date().toISOString(),
  };
}
