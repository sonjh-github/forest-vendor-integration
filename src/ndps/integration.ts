import type { InvokeRequest, RegisterRequest } from "../shared/vendor-contract.js";
import { persistMessage } from "../core/client.js";
import { prepareCoreRequest, registerCoreDevices } from "../core/device-registry.js";
import { writeMappings } from "../core/mapping-cache.js";

export function registerNdpsDevices(request: RegisterRequest) {
  return registerCoreDevices("NDPS", request);
}

export async function invokeNdps(request: InvokeRequest, mode: "VALIDATE_ONLY" | "DELIVER", idempotencyKey?: string) {
  const prepared = prepareCoreRequest("NDPS", request);
  const result = await persistMessage("NDPS", prepared.request, prepared.mappings, prepared.normalized, mode, idempotencyKey, "TVWS");
  writeMappings("NDPS", result.mapping.mappedDevices);
  return result;
}
