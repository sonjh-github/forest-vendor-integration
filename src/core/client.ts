import { config } from "../config.js";
import type { InvokeRequest } from "../shared/vendor-contract.js";
import type { ExternalVendor, MappingResult } from "./types.js";

export class CoreServerError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

export function fetchMappings(vendor: ExternalVendor, deviceIds: string[], deviceTypes: Record<string, string>): Promise<MappingResult[]> {
  return coreRequest("/internal/v1/device-mappings/resolve", { method: "POST", body: JSON.stringify({ vendor, deviceIds, deviceTypes }) });
}

async function coreRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.coreServerUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(config.coreRequestTimeoutMs),
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new CoreServerError("본 서버 요청 시간이 초과되었습니다.", 504, "CORE_TIMEOUT");
    throw new CoreServerError("본 서버에 연결할 수 없습니다.", 502, "CORE_UNAVAILABLE");
  }
  const payload = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !payload?.data) throw new CoreServerError(payload?.error?.message ?? `본 서버가 HTTP ${response.status}을 반환했습니다.`, response.status >= 500 ? 502 : response.status, payload?.error?.code ?? "CORE_REQUEST_FAILED");
  return payload.data;
}

export function persistMessage(vendor: ExternalVendor, request: InvokeRequest, mappings: MappingResult[], normalized: boolean, mode: "VALIDATE_ONLY" | "DELIVER", idempotencyKey?: string, defaultPayloadType: string | null = null) {
  return coreRequest<{ accepted: boolean; mapping: { mappedDevices: MappingResult[]; unmappedDeviceIds: string[] }; [key: string]: unknown }>("/internal/v1/vendor-messages", { method: "POST", body: JSON.stringify({ vendor, request, mappings, normalized, mode, idempotencyKey, defaultPayloadType }) });
}

export function fetchVendorHealth(vendor: ExternalVendor) {
  return coreRequest<Record<string, unknown>>(`/internal/v1/vendors/${vendor}/health`);
}
