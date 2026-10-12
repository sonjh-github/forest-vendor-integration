import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { isDockerHealthCheck } from "../src/app.js";
import { classifyRequest, GoogleSheetLogForwarder } from "../src/logging/google-sheet.js";

test("Docker 전용 헬스체크만 접근 로그에서 제외한다", () => {
  assert.equal(isDockerHealthCheck("GET", "/", "docker"), true);
  assert.equal(isDockerHealthCheck("GET", "/", undefined), false);
  assert.equal(isDockerHealthCheck("POST", "/", "docker"), false);
  assert.equal(isDockerHealthCheck("GET", "/ndps/health", "docker"), false);
});

test("요청 경로와 mode를 시트 로그 구분값으로 변환한다", () => {
  assert.equal(classifyRequest("GET", "https://device.example/"), "HEALTH");
  assert.equal(classifyRequest("GET", "https://device.example/ndps/health"), "HEALTH");
  assert.equal(classifyRequest("POST", "https://device.example/ndps/register"), "REGISTER");
  assert.equal(
    classifyRequest("POST", "https://device.example/ndps/invoke?mode=VALIDATE_ONLY"),
    "VALIDATE_ONLY",
  );
  assert.equal(classifyRequest("POST", "https://device.example/jininfra/invoke?mode=DELIVER"), "DELIVER");
  assert.equal(classifyRequest("POST", "https://device.example/jininfra/invoke"), "DELIVER");
  assert.equal(classifyRequest("GET", "https://device.example/unknown"), "OTHER");
});

test("Google Sheet 로그는 요청 응답과 분리된 큐에서 지정된 열 이름으로 전송한다", async () => {
  let requestBody = "";
  let resolveRequest!: () => void;
  const requested = new Promise<void>((resolve) => { resolveRequest = resolve; });
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    resolveRequest();
    return new Response(null, { status: 200 });
  };
  const forwarder = new GoogleSheetLogForwarder("https://example.test/log", 1_000, 10, fetcher);

  forwarder.enqueue({
    timestamp: "2026-08-27 12:34:56.789",
    method: "POST",
    url: "https://device.example/ndps/register",
    status: 200,
    "구분": "REGISTER",
    durationMs: 12,
    "user-agent": "node",
    "request.body": { vendor: "NDPS" },
    "response.body": { status: "MAPPED" },
  });

  await requested;
  assert.deepEqual(JSON.parse(requestBody), {
    timestamp: "2026-08-27 12:34:56.789",
    method: "POST",
    url: "https://device.example/ndps/register",
    status: 200,
    "구분": "REGISTER",
    durationMs: 12,
    "user-agent": "node",
    "request.body": { vendor: "NDPS" },
    "response.body": { status: "MAPPED" },
  });
});


test("HTTP 200이어도 Apps Script HTML 오류를 전송 실패로 기록한다", async () => {
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (message: unknown) => { errors.push(String(message)); };
  try {
    const forwarder = new GoogleSheetLogForwarder("https://example.test/log", 1_000, 10,
      async () => new Response("<!DOCTYPE html><p>Script error: permission denied</p>", { status: 200 }));
    forwarder.enqueue({ timestamp: "2026-10-12 15:00:00", method: "GET", url: "https://device.example/",
      status: 200, "구분": "HEALTH", durationMs: 1, "user-agent": "test", "request.body": null, "response.body": null });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const failure = errors.find((message) => message.includes("Google Sheet 로그 전송 실패"));
    assert.ok(failure);
    assert.match(failure, /HTTP 200/);
    assert.match(failure, /permission denied/);
  } finally {
    console.error = originalError;
  }
});


test("몰린 로그를 동시 처리하고 전송 실패한 행을 재시도한다", async () => {
  const attempts = new Map<string, number>();
  let active = 0;
  let maxActive = 0;
  const delivered = new Set<string>();
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (message: unknown) => errors.push(String(message));
  try {
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
      const row = JSON.parse(String(init?.body)) as { timestamp: string };
      attempts.set(row.timestamp, (attempts.get(row.timestamp) ?? 0) + 1);
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      if (row.timestamp === "row-0" && attempts.get(row.timestamp) === 1) return new Response("busy", { status: 503 });
      delivered.add(row.timestamp);
      return new Response("ok");
    };
    const forwarder = new GoogleSheetLogForwarder("https://example.test/log", 1_000, 2, fetcher);
    for (let i = 0; i < 20; i++) forwarder.enqueue({timestamp: `row-${i}`, method: "GET", url: "https://device.example/",
      status: 200, "구분": "HEALTH", durationMs: 1, "user-agent": "test", "request.body": null, "response.body": null });
    const deadline = Date.now() + 3_000;
    while (delivered.size < 20 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(delivered.size, 20);
    assert.equal(maxActive, 2);
    assert.equal(attempts.get("row-0"), 2);
    assert.ok(errors.some((message) => message.includes("HTTP 503")));
  } finally { console.error = originalError; }
});


test("프로세스 재시작 후 디스크에 남은 로그를 다시 전송한다", () => {
  const directory = mkdtempSync(join(tmpdir(), "forest-log-queue-"));
  const databasePath = join(directory, "queue.sqlite");
  const setup = `import { GoogleSheetLogForwarder } from './src/logging/google-sheet.ts';
    const queue = new GoogleSheetLogForwarder('https://example.test', 1000, 1,
      async () => { throw new Error('offline'); }, ${JSON.stringify(databasePath)});
    queue.enqueue({timestamp:'restart-check',method:'GET',url:'https://device.example/',status:200,
      '구분':'HEALTH',durationMs:1,'user-agent':'test','request.body':null,'response.body':null});
    setTimeout(() => process.exit(0), 50);`;
  const resume = `import { GoogleSheetLogForwarder } from './src/logging/google-sheet.ts';
    new GoogleSheetLogForwarder('https://example.test', 1000, 1,
      async (_input, init) => { console.log(JSON.parse(init.body).timestamp); setTimeout(() => process.exit(0), 20); return new Response('ok'); },
      ${JSON.stringify(databasePath)});
    setTimeout(() => process.exit(1), 5000);`;
  try {
    const first = spawnSync(process.execPath, ['--import','tsx','--input-type=module'], { input: setup, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    const second = spawnSync(process.execPath, ['--import','tsx','--input-type=module'], { input: resume, encoding: 'utf8', timeout: 10_000 });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /restart-check/);
  } finally { rmSync(directory, {recursive:true, force:true}); }
});
