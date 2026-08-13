import type { Vendor } from "../types.js";

export type VendorDevice = {
  vendorDeviceId: string;
  deviceType: string;
  serialNumber?: string | null;
  modelName?: string | null;
  firmwareVersion?: string | null;
  connectedTo?: {
    vendorDeviceId: string;
    medium: string;
    evidenceType: string;
    bidirectional?: boolean;
    attributes?: Record<string, unknown>;
  } | null;
  attributes?: Record<string, unknown>;
};

export type DeclaredLink = {
  fromDeviceId: string;
  toDeviceId: string;
  medium: string;
  evidenceType: string;
  bidirectional?: boolean;
  attributes?: Record<string, unknown>;
};

export type RegisterRequest = {
  vendor: Vendor;
  reportedByDeviceId: string;
  observedAt: string;
  topologyVersion?: string | null;
  devices: VendorDevice[];
};

export function topologyLinks(request: RegisterRequest): DeclaredLink[] {
  return request.devices.flatMap((device) => device.connectedTo ? [{
    fromDeviceId: device.vendorDeviceId,
    toDeviceId: device.connectedTo.vendorDeviceId,
    medium: device.connectedTo.medium,
    evidenceType: device.connectedTo.evidenceType,
    bidirectional: device.connectedTo.bidirectional,
    attributes: device.connectedTo.attributes,
  }] : []);
}

export type InvokeRequest = {
  payloadType?: string;
  context: {
    eventExternalId: string;
    sourceSystem: string;
    occurredAt: string;
    sentAt?: string | null;
    sourceDeviceId: string;
    reportedByDeviceId: string;
  };
  activePath: Array<{
    sequence: number;
    fromDeviceId: string;
    toDeviceId: string;
    medium: string;
    evidenceType: string;
    observedAt?: string | null;
    status?: string;
    attributes?: Record<string, unknown>;
  }>;
  observations?: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
};

const deviceIdKeys = new Set(["vendorDeviceId", "reportedByDeviceId", "sourceDeviceId", "fromDeviceId", "toDeviceId", "gatewayDeviceId", "baseDeviceId", "cpeDeviceId", "terminalDeviceId", "baseStationDeviceId"]);
const deviceIdArrayKeys = new Set(["receivedTerminalDeviceIds"]);

export function collectDeviceIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) collectDeviceIds(item, output);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    if (deviceIdKeys.has(key) && typeof item === "string" && item) output.add(item);
    else if (deviceIdArrayKeys.has(key) && Array.isArray(item)) item.forEach((id) => typeof id === "string" && id && output.add(id));
    else collectDeviceIds(item, output);
  }
  return output;
}
