// Settings > สถานะระบบ: which server pieces are ready. Returns only booleans/counts, never secret values.
import { admin, serverEnv } from "@/lib/server/push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { env, missing } = serverEnv();
  const envOk = {
    NEXT_PUBLIC_SUPABASE_URL: !!env.url,
    SUPABASE_SERVICE_ROLE_KEY: !!env.serviceKey,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!env.vapidPublic,
    VAPID_PRIVATE_KEY: !!env.vapidPrivate,
    VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
    CRON_SECRET: !!process.env.CRON_SECRET,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    TELEGRAM: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  };
  if (!env.url || !env.serviceKey) return Response.json({ env: envOk, tables: null, lastTick: null, devices: null });

  const db = admin();
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const exists = async (t: string) => !(await db.from(t).select("*", { head: true, count: "exact" }).limit(1)).error;
  const [subs, log, beat] = await Promise.all([exists("push_subscriptions"), exists("notification_log"), exists("krob_heartbeat")]);
  const { data: hb } = beat ? await db.from("krob_heartbeat").select("at").eq("id", 1).maybeSingle() : { data: null };
  const { count } = subs ? await db.from("push_subscriptions").select("*", { head: true, count: "exact" }).eq("user_id", u.user.id) : { count: null };
  return Response.json({ env: envOk, missing, tables: { push_subscriptions: subs, notification_log: log, krob_heartbeat: beat }, lastTick: hb?.at ?? null, devices: count });
}
