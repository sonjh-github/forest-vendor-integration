import assert from "node:assert/strict";
import { collectDeviceIds } from "../src/shared/vendor-contract.js";
import { resolveAssetMappings } from "../src/tobe/db/asset-mapping.js";
import { supabase } from "../src/tobe/db/client.js";
import { readTobeHealth, readVendorHealth } from "../src/tobe/services/health.js";

const collectedIds = collectDeviceIds({ reportedByDeviceId: "NMS-1", activePath: [{ fromDeviceId: "CPE-1", toDeviceId: "BASE-1" }] });
assert.deepEqual([...collectedIds].sort(), ["BASE-1", "CPE-1", "NMS-1"]);

console.log("[TOBE-DB] 1/6 Supabase 및 core 스키마 연결 확인");
const { count: assetCount, error: assetError } = await supabase.schema("core").from("asset").select("*", { head: true, count: "exact" });
assert.ifError(assetError);
assert.ok((assetCount ?? 0) > 0, "core.asset에 사전 등록된 자산이 없습니다.");

console.log("[TOBE-DB] 2/6 업체 연동 테이블 접근 확인");
for (const table of ["vendor_device_mapping", "vendor_topology_snapshot", "vendor_integration_message"]) {
  const { error } = await supabase.schema("core").from(table).select("*", { head: true, count: "exact" });
  assert.ifError(error);
}

console.log("[TOBE-DB] 3/6 asset_code를 기존 UUID로 매핑");
const knownDeviceId = "SIM-TVWS-BS-01";
const { data: knownAsset, error: knownAssetError } = await supabase.schema("core").from("asset").select("asset_id,asset_code").eq("asset_code", knownDeviceId).single();
assert.ifError(knownAssetError);
const [knownMapping] = await resolveAssetMappings("NDPS", [knownDeviceId], new Map([[knownDeviceId, "TVWS_BASE"]]));
assert.equal(knownMapping?.mapped, true);
assert.equal(knownMapping?.assetId, knownAsset.asset_id, "DB에 존재하는 UUID와 반환 UUID가 다릅니다.");

console.log("[TOBE-DB] 4/6 미등록 장비 UUID 자동 생성 금지 확인");
const unknownDeviceId = `UNREGISTERED-DEVICE-${Date.now()}`;
const [unknownMapping] = await resolveAssetMappings("NDPS", [unknownDeviceId]);
assert.equal(unknownMapping?.mapped, false);
assert.equal(unknownMapping?.assetId, null);
const { data: accidentallyCreated, error: accidentalError } = await supabase.schema("core").from("vendor_device_mapping").select("vendor_device_id,asset_id").eq("vendor_code", "NDPS").eq("vendor_device_id", unknownDeviceId).maybeSingle();
assert.ifError(accidentalError);
assert.equal(accidentallyCreated, null, "미등록 장비 매핑이 DB에 생성되었습니다.");

console.log("[TOBE-DB] 5/6 저장 메시지와 매핑 참조 무결성 확인");
const { data: latestMessages, error: messageError } = await supabase.schema("core").from("vendor_integration_message").select("request_id,vendor_code,status").order("received_at", { ascending: false }).limit(10);
assert.ifError(messageError);
assert.ok((latestMessages ?? []).length > 0, "업체 연동 테스트 메시지가 없습니다.");
assert.ok((latestMessages ?? []).every((row) => row.status === "PERSISTED"));
assert.ok((latestMessages ?? []).every((row) => row.vendor_code === "NDPS" || row.vendor_code === "JININFRA"));

console.log("[TOBE-DB] 6/6 투비 및 업체 수신 상태 조회");
const [tobeHealth, ndpsHealth, jininfraHealth] = await Promise.all([readTobeHealth(), readVendorHealth("NDPS"), readVendorHealth("JININFRA")]);
assert.equal(tobeHealth.databaseStatus, "REACHABLE");
assert.equal(ndpsHealth.databaseStatus, "REACHABLE");
assert.equal(jininfraHealth.databaseStatus, "REACHABLE");
assert.ok(ndpsHealth.lastPersistedAt);
assert.ok(jininfraHealth.lastPersistedAt);

console.log("[TOBE-DB] PASS connection=tables mapping=EXISTING_UUID unmapped=NOT_CREATED persistence=VALID health=REACHABLE");
