// The app's whole state (one JSON row), read/written by the server for the PIN session owner.
import { admin, safeError } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await admin().from("app_state").select("data").eq("user_id", uid).maybeSingle();
  if (error) return Response.json({ error: safeError(error, "state GET") }, { status: 500 });
  return Response.json({ data: data?.data ?? null });
}

export async function PUT(req: Request) {
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { data?: { updatedAt?: number } } | null;
  if (!body?.data || typeof body.data !== "object") return Response.json({ error: "bad body" }, { status: 400 });
  const { error } = await admin().from("app_state").upsert({ user_id: uid, data: body.data, updated_at: new Date(body.data.updatedAt || Date.now()).toISOString() });
  if (error) return Response.json({ error: safeError(error, "state PUT") }, { status: 500 });
  return Response.json({ ok: true });
}
