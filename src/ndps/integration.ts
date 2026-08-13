import type { InvokeRequest, RegisterRequest } from "../shared/vendor-contract.js";
import { lookupTobeDevices } from "../tobe/services/device-registry.js";
import { invokeVendor, registerTopology } from "../tobe/services/vendor-integration.js";

export async function registerNdpsTopology(request: RegisterRequest) {
  // 1. 투비 DB에서 업체 장비번호에 대응하는 기존 UUID를 먼저 조회한다.
  const mappings = await lookupTobeDevices("NDPS", request);
  // 2. 조회 결과가 모두 매핑된 경우에만 토폴로지를 저장한다.
  return registerTopology("NDPS", request, mappings);
}

export async function invokeNdps(request: InvokeRequest, mode: "VALIDATE_ONLY" | "DELIVER", idempotencyKey?: string) {
  // 1. 수신 데이터에 포함된 모든 장비번호를 투비 DB에서 조회한다.
  const mappings = await lookupTobeDevices("NDPS", request);
  // 2. UUID 변환 결과를 사용해 검증하거나 저장한다.
  return invokeVendor("NDPS", request, mappings, mode, idempotencyKey, "TVWS");
}
