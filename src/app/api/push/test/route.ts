// "Send test" button in Settings. Auth = the PIN session token.
import { admin, sendToRows, serverEnv, type PushRow } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { missing } = serverEnv();
  if (missing.length) return Response.json({ error: "missing env", missing }, { status: 500 });
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data: rows } = await admin().from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", uid);
  const sent = await sendToRows((rows ?? []) as PushRow[], { title: "Krob", body: "การแจ้งเตือนใช้งานได้แล้ว", tag: "test", url: "/settings" });
  return Response.json({ ok: true, devices: rows?.length ?? 0, sent });
}
