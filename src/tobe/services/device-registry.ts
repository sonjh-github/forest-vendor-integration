import { collectDeviceIds, type InvokeRequest, type RegisterRequest } from "../../shared/vendor-contract.js";
import type { Vendor } from "../../types.js";
import { resolveAssetMappings } from "../db/asset-mapping.js";

type ExternalVendor = Exclude<Vendor, "TOBE">;

/** 업체 장비번호를 투비 DB의 기존 자산 UUID로 조회한다. UUID를 새로 만들지 않는다. */
export function lookupTobeDevices(vendor: ExternalVendor, request: RegisterRequest | InvokeRequest) {
  const deviceTypes = "devices" in request
    ? new Map(request.devices.map((device) => [device.vendorDeviceId, device.deviceType]))
    : new Map<string, string>();
  return resolveAssetMappings(vendor, [...collectDeviceIds(request)], deviceTypes);
}
