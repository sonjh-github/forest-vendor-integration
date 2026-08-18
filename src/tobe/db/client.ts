import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function numberValue(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  host: process.env.HOST?.trim() || "0.0.0.0",
  port: numberValue("PORT", 18010),
  healthSchema: process.env.SUPABASE_HEALTH_SCHEMA?.trim() || "core",
  healthTable: process.env.SUPABASE_HEALTH_TABLE?.trim() || "disaster_event",
};

export const supabase = createClient(required("SUPABASE_URL").replace(/\/$/, ""), required("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { headers: { "X-Client-Info": "forest-vendor-proxy/hono" } },
});
