import { config } from "../config.js";
import type { ExternalVendor, MappingResult } from "./types.js";

type Entry = { value: MappingResult; expiresAt: number };
const entries = new Map<string, Entry>();

function key(vendor: ExternalVendor, deviceId: string): string {
  return `${vendor}:${deviceId}`;
}

export function readMappings(vendor: ExternalVendor, deviceIds: string[]): { hits: MappingResult[]; misses: string[] } {
  const now = Date.now();
  const hits: MappingResult[] = [];
  const misses: string[] = [];
  for (const deviceId of deviceIds) {
    const cacheKey = key(vendor, deviceId);
    const entry = entries.get(cacheKey);
    if (!entry || entry.expiresAt <= now) {
      entries.delete(cacheKey);
      misses.push(deviceId);
    } else hits.push(entry.value);
  }
  return { hits, misses };
}

export function writeMappings(vendor: ExternalVendor, mappings: MappingResult[]): void {
  const now = Date.now();
  for (const mapping of mappings) {
    const ttl = mapping.mapped ? config.mappingCacheTtlMs : config.negativeMappingCacheTtlMs;
    entries.set(key(vendor, mapping.vendorDeviceId), { value: mapping, expiresAt: now + ttl });
  }
}

export function clearMappingCache(): void {
  entries.clear();
}
