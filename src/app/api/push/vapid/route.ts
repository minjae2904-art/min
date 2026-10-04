// Public VAPID key for subscribing (public by design). Also records the app URL for the cron job.
import { getPushConfig, requestOrigin } from "@/lib/server/config";
import { safeError, serverEnv } from "@/lib/server/push";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (serverEnv().missing.length) return Response.json({ error: "server not configured" }, { status: 503 });
  try {
    const cfg = await getPushConfig(requestOrigin(req));
    if (!cfg) return Response.json({ error: "run supabase/v0.7-config.sql" }, { status: 503 });
    return Response.json({ publicKey: cfg.vapidPublic });
  } catch (e) {
    return Response.json({ error: safeError(e, "push/vapid") }, { status: 500 });
  }
}
