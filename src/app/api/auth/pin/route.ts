// GET: is the server ready and does a PIN exist? POST: log in with the PIN (or create it the first time).
import { logicalDate, wallClock } from "@/lib/date";
import { safeError, serverEnv } from "@/lib/server/push";
import { MAX_FAILS, checkPin, getOwner, logFail, recentFails, setPin, signToken, validPin, verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const { env } = serverEnv();
  if (!env.url || !env.serviceKey) return Response.json({ server: false, hasPin: false });
  try {
    const o = await getOwner();
    return Response.json({ server: true, hasPin: !!o.pin });
  } catch (e) {
    return Response.json({ server: false, hasPin: false, error: safeError(e, "auth/pin GET") });
  }
}

export async function POST(req: Request) {
  const { env } = serverEnv();
  if (!env.url || !env.serviceKey) return Response.json({ error: "server not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { pin?: string; newPin?: string };
  let owner: Awaited<ReturnType<typeof getOwner>>;
  try { owner = await getOwner(); } catch (e) { return Response.json({ error: safeError(e, "auth/pin POST") }, { status: 500 }); }

  // Change PIN (needs a valid session + the current PIN).
  if (body.newPin !== undefined) {
    if (verifyToken(req) !== owner.id) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!validPin(body.newPin)) return Response.json({ error: "PIN ต้องเป็นตัวเลข 4-6 หลัก" }, { status: 400 });
    if (owner.pin && !(validPin(body.pin) && checkPin(body.pin, owner.pin))) return Response.json({ error: "PIN เดิมไม่ถูกต้อง" }, { status: 401 });
    await setPin(owner.id, body.newPin);
    return Response.json({ ok: true, token: signToken(owner.id) });
  }

  if (!validPin(body.pin)) return Response.json({ error: "PIN ต้องเป็นตัวเลข 4-6 หลัก" }, { status: 400 });

  // First run: the first PIN entered becomes the owner's PIN (claim once).
  if (!owner.pin) {
    await setPin(owner.id, body.pin);
    return Response.json({ ok: true, created: true, token: signToken(owner.id) });
  }

  const fails = await recentFails(owner.id);
  if (fails >= MAX_FAILS) return Response.json({ error: "ใส่ผิดหลายครั้ง ลองใหม่ใน 15 นาที" }, { status: 429 });
  if (!checkPin(body.pin, owner.pin)) {
    await logFail(owner.id, logicalDate(wallClock()));
    return Response.json({ error: "PIN ไม่ถูกต้อง", left: MAX_FAILS - fails - 1 }, { status: 401 });
  }
  return Response.json({ ok: true, token: signToken(owner.id) });
}
