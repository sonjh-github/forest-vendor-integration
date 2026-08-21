import type { InvokeRequest, RegisterRequest } from "../shared/vendor-contract.js";
import { persistMessage } from "../core/client.js";
import { prepareCoreRequest, registerCoreDevices } from "../core/device-registry.js";
import { writeMappings } from "../core/mapping-cache.js";

export function registerJininfraDevices(request: RegisterRequest) {
  return registerCoreDevices("JININFRA", request);
}

export async function invokeJininfra(request: InvokeRequest, mode: "VALIDATE_ONLY" | "DELIVER", idempotencyKey?: string) {
  const prepared = prepareCoreRequest("JININFRA", request);
  const result = await persistMessage("JININFRA", prepared.request, prepared.mappings, prepared.normalized, mode, idempotencyKey, null);
  writeMappings("JININFRA", result.mapping.mappedDevices);
  return result;
}
