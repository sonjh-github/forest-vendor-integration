export const DEFAULT_CORE_SERVER_URL = "https://api.forest.tobeunicorn.kr";

export function resolveCoreServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CORE_SERVER_URL?.trim() || DEFAULT_CORE_SERVER_URL).replace(/\/$/, "");
}

function numberValue(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  host: process.env.HOST?.trim() || "0.0.0.0",
  port: numberValue("PORT", 18010),
  coreServerUrl: resolveCoreServerUrl(),
  coreRequestTimeoutMs: numberValue("CORE_REQUEST_TIMEOUT_MS", 5_000),
  mappingCacheTtlMs: numberValue("DEVICE_MAPPING_CACHE_TTL_MS", 300_000),
  negativeMappingCacheTtlMs: numberValue("DEVICE_MAPPING_NEGATIVE_CACHE_TTL_MS", 30_000),
};
