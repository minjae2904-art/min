// Save / remove this device's Web Push subscription for the PIN session owner.
import { getPushConfig, requestOrigin } from "@/lib/server/config";
import { admin, safeError } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string; p256dh?: string; auth?: string; ua?: string };
  if (!b.endpoint || !b.p256dh || !b.auth) return Response.json({ error: "bad subscription" }, { status: 400 });
  const { error } = await admin().from("push_subscriptions").upsert({ user_id: uid, endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth, ua: b.ua?.slice(0, 200) }, { onConflict: "endpoint" });
  if (error) return Response.json({ error: safeError(error, "push/subscribe") }, { status: 500 });
  await getPushConfig(requestOrigin(req)); // remember the app URL for the cron job
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (b.endpoint) await admin().from("push_subscriptions").delete().eq("user_id", uid).eq("endpoint", b.endpoint);
  return Response.json({ ok: true });
}
