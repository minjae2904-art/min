// "Send test" button in Settings. Auth = the PIN session token.
import { msgs, reqLang } from "@/i18n";
import * as M from "@/i18n/msg/app-api-push-test";
import { getPushConfig, requestOrigin } from "@/lib/server/config";
import { admin, sendToRows, serverEnv, type PushRow } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";
const m = msgs(M);

export async function POST(req: Request) {
  const lang = reqLang(req);
  const { missing } = serverEnv();
  if (missing.length) return Response.json({ error: "missing env", missing }, { status: 500 });
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await getPushConfig(requestOrigin(req));
  if (!cfg) return Response.json({ error: "missing env", missing: ["krob_config (run supabase/v0.7-config.sql)"] }, { status: 500 });
  const { data: rows } = await admin().from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", uid);
  const { sent, failed } = await sendToRows((rows ?? []) as PushRow[], { title: "Krob", body: m.in(lang, "test.body"), tag: "test", url: "/settings/notifications" }, cfg);
  return Response.json({ ok: true, devices: rows?.length ?? 0, sent, failed });
}
