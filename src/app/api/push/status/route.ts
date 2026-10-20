// Settings > สถานะระบบ: which server pieces are ready. Returns only booleans/counts, never secret values.
import { getPushConfig } from "@/lib/server/config";
import { admin, serverEnv } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

// Cheap health probe for the Today banner: last cron tick + this user's device count. No table probes, no config.
export async function GET(req: Request) {
  const { env } = serverEnv();
  if (!env.url || !env.serviceKey) return Response.json({ lastTick: null, devices: 0 });
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = admin();
  const [{ data: hb }, { count }] = await Promise.all([
    db.from("krob_heartbeat").select("at").eq("id", 1).maybeSingle(),
    db.from("push_subscriptions").select("*", { head: true, count: "exact" }).eq("user_id", uid),
  ]);
  return Response.json({ lastTick: hb?.at ?? null, devices: count ?? 0 });
}

export async function POST(req: Request) {
  const { env, missing } = serverEnv();
  const envOk = {
    NEXT_PUBLIC_SUPABASE_URL: !!env.url,
    SUPABASE_SERVICE_ROLE_KEY: !!env.serviceKey,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!env.vapidPublic,
    VAPID_PRIVATE_KEY: !!env.vapidPrivate,
    VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
    CRON_SECRET: !!process.env.CRON_SECRET?.trim(),
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY?.trim(),
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY?.trim(),
    TELEGRAM: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  };
  if (!env.url || !env.serviceKey) return Response.json({ env: envOk, tables: null, lastTick: null, devices: null });

  const db = admin();
  const uid = verifyToken(req);
  // Signed-out callers still get the env booleans (no values) so setup can be checked from outside; the rest needs a session.
  if (!uid) return Response.json({ env: envOk, tables: null, lastTick: null, devices: null, auth: false });

  const exists = async (t: string) => !(await db.from(t).select("*", { head: true, count: "exact" }).limit(1)).error;
  // ai_cache (v1.3-brain.sql) is optional: reported apart from `tables` so it never blocks the push checks.
  const [subs, log, beat, conf, aiCache] = await Promise.all([exists("push_subscriptions"), exists("notification_log"), exists("krob_heartbeat"), exists("krob_config"), exists("ai_cache")]);
  const cfg = conf ? await getPushConfig() : null;
  const push = { config: conf, vapid: !!cfg?.vapidPublic, source: cfg?.source ?? null, appUrl: cfg?.appUrl ?? null, cronSecret: !!cfg?.cronSecret };
  const { data: hb } = beat ? await db.from("krob_heartbeat").select("at").eq("id", 1).maybeSingle() : { data: null };
  const { count } = subs ? await db.from("push_subscriptions").select("*", { head: true, count: "exact" }).eq("user_id", uid) : { count: null };
  return Response.json({ env: envOk, missing, push, tables: { push_subscriptions: subs, notification_log: log, krob_heartbeat: beat, krob_config: conf }, lastTick: hb?.at ?? null, devices: count, aiCache });
}
