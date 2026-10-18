// The app's whole state (one JSON row), read/written by the server for the PIN session owner.
import { admin, safeError } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

type Stored = { updatedAt?: number; days?: unknown };
const dayCount = (d: unknown) => (d && typeof d === "object" && !Array.isArray(d) ? Object.keys(d).length : 0);

export async function GET(req: Request) {
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await admin().from("app_state").select("data").eq("user_id", uid).maybeSingle();
  if (error) return Response.json({ error: safeError(error, "state GET") }, { status: 500 });
  return Response.json({ data: data?.data ?? null });
}

// body.base = updatedAt of the server copy the client last saw: 409 "stale" when another device wrote since
// (old builds send no base and write unconditionally). 409 "empty-state" stops a blank device from wiping the
// logged days unless the client insists with x-krob-force: 1.
export async function PUT(req: Request) {
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { data?: Stored; base?: unknown } | null;
  const d = body?.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return Response.json({ error: "bad body" }, { status: 400 });
  if (typeof d.updatedAt !== "number" || !Number.isFinite(d.updatedAt)) return Response.json({ error: "bad updatedAt" }, { status: 400 });
  let updatedAt: string;
  try { updatedAt = new Date(d.updatedAt).toISOString(); } catch { return Response.json({ error: "bad updatedAt" }, { status: 400 }); }

  const db = admin();
  const { data: row, error: readErr } = await db.from("app_state").select("data").eq("user_id", uid).maybeSingle();
  if (readErr) return Response.json({ error: safeError(readErr, "state PUT read") }, { status: 500 });
  const cur = (row?.data ?? null) as Stored | null;
  if (typeof body.base === "number" && cur && (cur.updatedAt ?? 0) !== body.base) return Response.json({ error: "stale", data: cur }, { status: 409 });
  if (cur && dayCount(cur.days) > 0 && dayCount(d.days) === 0 && req.headers.get("x-krob-force") !== "1") return Response.json({ error: "empty-state" }, { status: 409 });

  const { error } = await db.from("app_state").upsert({ user_id: uid, data: d, updated_at: updatedAt });
  if (error) return Response.json({ error: safeError(error, "state PUT") }, { status: 500 });
  return Response.json({ ok: true });
}
