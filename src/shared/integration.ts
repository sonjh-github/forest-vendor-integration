import type { InvokeRequest, RegisterRequest } from "./vendor-contract.js";
import type { ExternalVendor } from "../core/types.js";
import { persistMessage } from "../core/client.js";
import { prepareCoreRequest, registerCoreDevices } from "../core/device-registry.js";
import { writeMappings } from "../core/mapping-cache.js";

export function registerDevices(vendor: ExternalVendor, request: RegisterRequest) {
  return registerCoreDevices(vendor, request);
}

export async function invoke(vendor: ExternalVendor, request: InvokeRequest, mode: "VALIDATE_ONLY" | "DELIVER", idempotencyKey?: string) {
  const prepared = prepareCoreRequest(vendor, request);
  const result = await persistMessage(vendor, prepared.request, prepared.mappings, prepared.normalized, mode, idempotencyKey, request.payloadType ?? null);
  writeMappings(vendor, result.mapping.mappedDevices);
  return result;
}
