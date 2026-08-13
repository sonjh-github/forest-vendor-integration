import { Hono } from "hono";
import { jininfraRoutes } from "./jininfra/routes.js";
import { ndpsRoutes } from "./ndps/routes.js";
import { tobeRoutes } from "./tobe/routes.js";

export const app = new Hono();
app.get("/", (c) => c.json({ service: "forest-vendor-proxy", status: "ok" }));
app.route("/ndps", ndpsRoutes);
app.route("/jininfra", jininfraRoutes);
app.route("/tobe", tobeRoutes);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "지원하지 않는 경로입니다." } }, 404));
app.onError((error, c) => c.json({ error: { code: "PROCESSING_FAILURE", message: error.message, retryable: true } }, 502));
