import type { Vendor } from "../types.js";

export type ExternalVendor = Exclude<Vendor, "TOBE">;
export type MappingResult = {
  vendorDeviceId: string;
  assetId: string | null;
  mapped: boolean;
  assetExists: boolean;
  mappingStatus: "ACTIVE" | "PENDING" | "SUSPENDED" | "UNMAPPED" | "CONFLICT";
};
