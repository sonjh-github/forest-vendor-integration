import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CORE_SERVER_URL, resolveCoreServerUrl } from "../src/config.js";

test("CORE_SERVER_URL이 없으면 배포된 Core를 사용한다", () => {
  assert.equal(resolveCoreServerUrl({}), DEFAULT_CORE_SERVER_URL);
});

test("CORE_SERVER_URL 재정의와 후행 슬래시 제거를 지원한다", () => {
  assert.equal(resolveCoreServerUrl({ CORE_SERVER_URL: " http://forest-core-server:18020/ " }), "http://forest-core-server:18020");
});
