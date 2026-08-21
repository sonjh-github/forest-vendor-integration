export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "요청 처리에 실패했습니다.";
}

export function errorStatus(error: unknown): 400 | 409 | 502 | 504 {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number(error.status);
    if (status === 409 || status === 502 || status === 504) return status;
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const detail = errorMessage(error).toLowerCase();
  if (code === "23505") return 409;
  if (detail.includes("timeout") || detail.includes("timed out")) return 504;
  if (code.startsWith("CORE_") || detail.includes("본 서버")) return 502;
  return 400;
}

export function errorCode(operation: "REGISTER" | "INVOKE", status: number) {
  if (status === 409) return operation === "REGISTER" ? "MAPPING_CONFLICT" : "IDEMPOTENCY_CONFLICT";
  if (status === 502) return "PROCESSING_FAILURE";
  if (status === 504) return "PROCESSING_TIMEOUT";
  return `${operation}_FAILED`;
}
