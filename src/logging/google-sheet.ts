import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

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
  private readonly db: DatabaseSync;
  private active = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly endpoint = GOOGLE_SHEET_LOG_URL,
    private readonly requestTimeoutMs = 30_000,
    private readonly concurrency = 8,
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
    databasePath = ":memory:",
  ) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS pending_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        row_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS pending_log_due ON pending_log(next_attempt_at, id);`);
    queueMicrotask(() => this.drain());
  }

  enqueue(row: GoogleSheetLogRow): void {
    this.db.prepare("INSERT INTO pending_log(row_json) VALUES(?)").run(JSON.stringify(row));
    this.drain();
  }

  private drain(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    while (this.active < this.concurrency) {
      // Keep the current operational view fresh while draining historical backlog.
      const row = this.db.prepare("SELECT * FROM pending_log WHERE next_attempt_at<=? ORDER BY id DESC LIMIT 1")
        .get(Date.now()) as { id: number; row_json: string; attempts: number } | undefined;
      if (!row) break;
      // Lease survives a restart; only acknowledged writes are removed.
      this.db.prepare("UPDATE pending_log SET next_attempt_at=? WHERE id=?")
        .run(Date.now() + this.requestTimeoutMs + 1_000, row.id);
      this.active++;
      void this.send(row).finally(() => { this.active--; this.drain(); });
    }
    if (this.active < this.concurrency) {
      const next = this.db.prepare("SELECT MIN(next_attempt_at) AS due FROM pending_log").get() as { due: number | null };
      if (next.due !== null) {
        this.timer = setTimeout(() => this.drain(), Math.max(1, next.due - Date.now()));
        this.timer.unref();
      }
    }
  }

  private async send(row: { id: number; row_json: string; attempts: number }): Promise<void> {
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: row.row_json,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      const body = await response.text();
      if (!response.ok || /^\s*</.test(body)) {
        throw new Error(`HTTP ${response.status}: ${body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(-1_000)}`);
      }
      if (/^\s*[{[]/.test(body)) {
        const result = JSON.parse(body) as { success?: boolean; error?: unknown };
        if (result.success === false || result.error) throw new Error(`Receiver rejected log: ${body.slice(0, 1_000)}`);
      }
      this.db.prepare("DELETE FROM pending_log WHERE id=?").run(row.id);
    } catch (error) {
      const delay = Math.min(60_000, 1_000 * 2 ** Math.min(row.attempts, 6));
      this.db.prepare("UPDATE pending_log SET attempts=attempts+1,next_attempt_at=? WHERE id=?")
        .run(Date.now() + delay, row.id);
      console.error(`Google Sheet 로그 전송 실패 (재시도 ${delay}ms): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const googleSheetLogForwarder = new GoogleSheetLogForwarder(
  GOOGLE_SHEET_LOG_URL, 30_000, 8, undefined,
  process.env.NODE_ENV === "production" ? "/app/data/log-queue.sqlite" : ":memory:",
);

export const coreDbLogForwarder = new GoogleSheetLogForwarder(
  `${config.coreServerUrl}/internal/v1/vendor-request-logs`,
  config.coreRequestTimeoutMs,
  4,
  undefined,
  process.env.NODE_ENV === "production" ? "/app/data/core-log-queue.sqlite" : ":memory:",
);
