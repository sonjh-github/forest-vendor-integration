import { Hono } from "hono";
import { readTobeHealth } from "./services/health.js";

export const tobeRoutes = new Hono();
tobeRoutes.get("/health", async (c) => c.json({ data: await readTobeHealth() }));
