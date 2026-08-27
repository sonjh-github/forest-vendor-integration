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
