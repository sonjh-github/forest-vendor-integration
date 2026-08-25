import assert from "node:assert/strict";
import test from "node:test";
import { isDockerHealthCheck } from "../src/app.js";

test("Docker 전용 헬스체크만 접근 로그에서 제외한다", () => {
  assert.equal(isDockerHealthCheck("GET", "/", "docker"), true);
  assert.equal(isDockerHealthCheck("GET", "/", undefined), false);
  assert.equal(isDockerHealthCheck("POST", "/", "docker"), false);
  assert.equal(isDockerHealthCheck("GET", "/ndps/health", "docker"), false);
});
