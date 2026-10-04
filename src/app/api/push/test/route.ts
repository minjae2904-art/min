// "Send test" button in Settings. Auth = the PIN session token.
import { getPushConfig, requestOrigin } from "@/lib/server/config";
import { admin, sendToRows, serverEnv, type PushRow } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { missing } = serverEnv();
  if (missing.length) return Response.json({ error: "missing env", missing }, { status: 500 });
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await getPushConfig(requestOrigin(req));
  if (!cfg) return Response.json({ error: "missing env", missing: ["krob_config (run supabase/v0.7-config.sql)"] }, { status: 500 });
  const { data: rows } = await admin().from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", uid);
  const sent = await sendToRows((rows ?? []) as PushRow[], { title: "Krob", body: "การแจ้งเตือนใช้งานได้แล้ว", tag: "test", url: "/settings" }, cfg);
  return Response.json({ ok: true, devices: rows?.length ?? 0, sent });
}
