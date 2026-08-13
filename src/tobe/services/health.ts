import { randomUUID } from "node:crypto";
import type { Vendor } from "../../types.js";
import { collectDeviceIds } from "../../shared/vendor-contract.js";
import { config, supabase } from "../db/client.js";

type ExternalVendor = Exclude<Vendor, "TOBE">;
type MappingRow = { vendor_device_id: string; asset_id: string; device_type: string; status: string; last_seen_at: string | null };
type MessageRow = { received_at: string; occurred_at: string; status: string; payload: unknown };
type TopologyRow = { observed_at: string; links: unknown[] };

export async function readVendorHealth(vendor: ExternalVendor) {
  const startedAt = new Date().toISOString();
  const [database, mappings, messages, topology] = await Promise.all([
    supabase.schema(config.healthSchema).from(config.healthTable).select("*", { head: true, count: "exact" }),
    supabase.schema("core").from("vendor_device_mapping").select("vendor_device_id,asset_id,device_type,status,last_seen_at").eq("vendor_code", vendor),
    supabase.schema("core").from("vendor_integration_message").select("received_at,occurred_at,status,payload").eq("vendor_code", vendor).order("received_at", { ascending: false }).limit(1),
    supabase.schema("core").from("vendor_topology_snapshot").select("observed_at,links").eq("vendor_code", vendor).order("observed_at", { ascending: false }).limit(1),
  ]);
  const firstError = database.error ?? mappings.error ?? messages.error ?? topology.error;
  if (firstError) throw firstError;
  const deviceRows = (mappings.data ?? []) as MappingRow[];
  const latest = ((messages.data ?? []) as MessageRow[])[0];
  const latestTopology = ((topology.data ?? []) as TopologyRow[])[0];
  const receivingIds = latest ? collectDeviceIds(latest.payload) : new Set<string>();
  const devices = deviceRows.map((row) => ({
    vendorDeviceId: row.vendor_device_id,
    assetId: row.asset_id,
    deviceType: row.device_type,
    status: receivingIds.has(row.vendor_device_id) ? "RECEIVING" : "UNVERIFIED",
    mappingStatus: row.status,
    evidenceType: latest ? "OBSERVED" : "DECLARED",
    lastSeenAt: row.last_seen_at,
  }));
  return {
    vendor,
    healthMode: "PASSIVE",
    diagnosticStatus: latest ? "HEALTHY" : "INCOMPLETE",
    diagnosticRunId: randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    proxyStatus: "UP",
    databaseStatus: "REACHABLE",
    registeredDevices: devices.length,
    receivingDevices: devices.filter((device) => device.status === "RECEIVING").length,
    unmappedDevices: 0,
    lastReceivedAt: latest?.received_at ?? null,
    lastPersistedAt: latest?.status === "PERSISTED" ? latest.received_at : null,
    devices,
    links: latestTopology?.links ?? [],
    networks: [],
    note: "업체 장비로 역방향 요청하지 않고, 투비 서버가 실제로 수신·저장한 기록을 기준으로 판정합니다.",
  };
}

export async function readTobeHealth() {
  const checkedAt = new Date().toISOString();
  const { error } = await supabase.schema(config.healthSchema).from(config.healthTable).select("*", { head: true, count: "exact" });
  if (error) throw error;
  return {
    vendor: "TOBE",
    healthMode: "PASSIVE",
    diagnosticStatus: "HEALTHY",
    diagnosticRunId: randomUUID(),
    startedAt: checkedAt,
    completedAt: new Date().toISOString(),
    proxyStatus: "UP",
    databaseStatus: "REACHABLE",
    registeredDevices: 0,
    receivingDevices: 0,
    unmappedDevices: 0,
    lastReceivedAt: null,
    lastPersistedAt: null,
    devices: [],
    links: [],
    networks: [],
  };
}
