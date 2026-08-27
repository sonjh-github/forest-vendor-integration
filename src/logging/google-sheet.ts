export const GOOGLE_SHEET_LOG_URL = "https://script.google.com/macros/s/AKfycbwz8xbmTsbBzVz5Pc_r08QcF5gs6wTPXAUZn_X5ikyeJBQwKGoMqNc4SNmgrqg0k9NfcQ/exec";

export type GoogleSheetLogRow = {
  timestamp: string;
  method: string;
  url: string;
  status: number;
  "구분": RequestLogCategory;
  durationMs: number;
  "user-agent": string | null;
  "request.body": unknown;
  "response.body": unknown;
};

export type RequestLogCategory = "REGISTER" | "VALIDATE_ONLY" | "DELIVER" | "HEALTH" | "OTHER";

export function classifyRequest(method: string, url: string): RequestLogCategory {
  const normalizedMethod = method.toUpperCase();
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname.replace(/\/$/, "") || "/";

  if (normalizedMethod === "POST" && pathname.endsWith("/register")) return "REGISTER";

  if (normalizedMethod === "POST" && pathname.endsWith("/invoke")) {
    return parsedUrl.searchParams.get("mode")?.toUpperCase() === "VALIDATE_ONLY"
      ? "VALIDATE_ONLY"
      : "DELIVER";
  }

  if (normalizedMethod === "GET" && (pathname === "/" || pathname.endsWith("/health"))) {
    return "HEALTH";
  }

  return "OTHER";
}

type FetchLike = typeof fetch;

export class GoogleSheetLogForwarder {
  private readonly queue: GoogleSheetLogRow[] = [];
  private running = false;

  constructor(
    private readonly endpoint = GOOGLE_SHEET_LOG_URL,
    private readonly requestTimeoutMs = 3_000,
    private readonly maxQueueSize = 1_000,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  enqueue(row: GoogleSheetLogRow): void {
    if (this.queue.length >= this.maxQueueSize) {
      console.error("Google Sheet 로그 큐가 가득 차 로그를 건너뜁니다.");
      return;
    }

    this.queue.push(row);
    if (!this.running) {
      this.running = true;
      queueMicrotask(() => void this.drain());
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const row = this.queue.shift();
      if (!row) continue;

      try {
        const response = await this.fetcher(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(row),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        if (!response.ok) {
          console.error(`Google Sheet 로그 전송 실패: HTTP ${response.status}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Google Sheet 로그 전송 실패: ${message}`);
      }
    }

    this.running = false;
    if (this.queue.length > 0) {
      this.running = true;
      queueMicrotask(() => void this.drain());
    }
  }
}

export const googleSheetLogForwarder = new GoogleSheetLogForwarder();
