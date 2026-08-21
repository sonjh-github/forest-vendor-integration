import { Hono } from "hono";
import { errorCode, errorMessage, errorStatus } from "../shared/route-support.js";
import { fetchVendorHealth } from "../core/client.js";
import { assertNdpsInvokeRequest, assertNdpsRegisterRequest } from "./contract.js";
import { invokeNdps, registerNdpsDevices } from "./integration.js";

export const ndpsRoutes = new Hono();

ndpsRoutes.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    assertNdpsRegisterRequest(body);
    const data = await registerNdpsDevices(body);
    return c.json({ data }, data.registrationStatus === "MAPPED" ? 200 : 207);
  } catch (error) {
    const status = errorStatus(error);
    return c.json({ error: { code: errorCode("REGISTER", status), message: errorMessage(error), retryable: status >= 500 } }, status);
  }
});

ndpsRoutes.post("/invoke", async (c) => {
  try {
    const mode = c.req.query("mode")?.toUpperCase() ?? "DELIVER";
    if (mode !== "VALIDATE_ONLY" && mode !== "DELIVER") return c.json({ error: { code: "INVALID_DELIVERY_MODE", message: "mode는 VALIDATE_ONLY 또는 DELIVER여야 합니다.", retryable: false } }, 400);
    const body = await c.req.json();
    assertNdpsInvokeRequest(body);
    const data = await invokeNdps(body, mode, c.req.header("Idempotency-Key"));
    return data.accepted ? c.json({ data }, 200) : c.json({ error: { code: "UNMAPPED_DEVICES", message: "UUID가 매핑되지 않은 업체 장비가 있습니다.", retryable: false, unmappedDeviceIds: data.mapping.unmappedDeviceIds } }, 404);
  } catch (error) {
    const status = errorStatus(error);
    return c.json({ error: { code: errorCode("INVOKE", status), message: errorMessage(error), retryable: status >= 500 } }, status);
  }
});

ndpsRoutes.get("/health", async (c) => c.json({ data: await fetchVendorHealth("NDPS") }));
