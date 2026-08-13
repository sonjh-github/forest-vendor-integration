import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./tobe/db/client.js";

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
  console.log(`[forest-vendor-proxy] http://${config.host}:${config.port}`);
});
