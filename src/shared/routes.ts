import { Hono } from "hono";
import { fetchVendorHealth } from "../core/client.js";
import { assertInvokeRequest, assertRegisterRequest, parseVendor } from "./contract.js";
import { invoke, registerDevices } from "./integration.js";
import { errorCode, errorMessage, errorStatus } from "./route-support.js";

export const vendorRoutes = new Hono();

vendorRoutes.post("/:vendor/register", async (c) => {
  try {
    const vendor = parseVendor(c.req.param("vendor"));
    const body = await c.req.json();
    assertRegisterRequest(body, vendor);
    const data = await registerDevices(vendor, body);
    return c.json({ data }, data.registrationStatus === "MAPPED" ? 200 : 207);
  } catch (error) {
    const status = errorStatus(error);
    return c.json({ error: { code: errorCode("REGISTER", status), message: errorMessage(error), retryable: status >= 500 } }, status);
  }
});

vendorRoutes.post("/:vendor/invoke", async (c) => {
  try {
    const vendor = parseVendor(c.req.param("vendor"));
    const mode = c.req.query("mode")?.toUpperCase() ?? "DELIVER";
    if (mode !== "VALIDATE_ONLY" && mode !== "DELIVER") return c.json({ error: { code: "INVALID_DELIVERY_MODE", message: "mode는 VALIDATE_ONLY 또는 DELIVER여야 합니다.", retryable: false } }, 400);
    const body = await c.req.json();
    assertInvokeRequest(body);
    const data = await invoke(vendor, body, mode, c.req.header("Idempotency-Key"));
    return data.accepted ? c.json({ data }, 200) : c.json({ error: { code: "UNMAPPED_DEVICES", message: "UUID가 매핑되지 않은 업체 장비가 있습니다.", retryable: false, unmappedDeviceIds: data.mapping.unmappedDeviceIds } }, 404);
  } catch (error) {
    const status = errorStatus(error);
    return c.json({ error: { code: errorCode("INVOKE", status), message: errorMessage(error), retryable: status >= 500 } }, status);
  }
});

vendorRoutes.get("/:vendor/health", async (c) => {
  try {
    return c.json({ data: await fetchVendorHealth(parseVendor(c.req.param("vendor"))) });
  } catch (error) {
    const status = errorStatus(error);
    return c.json({ error: { code: "HEALTH_FAILED", message: errorMessage(error), retryable: status >= 500 } }, status);
  }
});
