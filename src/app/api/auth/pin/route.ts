// GET: is the server ready and does a PIN exist? POST: log in with the PIN (or create it the first time).
import { msgs, reqLang } from "@/i18n";
import * as M from "@/i18n/msg/app-api-auth-pin";
import { logicalDate, wallClock } from "@/lib/date";
import { safeError, serverEnv } from "@/lib/server/push";
import { MAX_FAILS, checkPin, getOwner, logFail, recentFails, setPin, setPinOff, signToken, validPin, verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";
const m = msgs(M);

export async function GET() {
  const { env } = serverEnv();
  if (!env.url || !env.serviceKey) return Response.json({ server: false, hasPin: false });
  try {
    const o = await getOwner();
    return Response.json({ server: true, hasPin: !!o.pin, pinOff: o.pinOff, pinLen: o.pinLen });
  } catch (e) {
    return Response.json({ server: false, hasPin: false, error: safeError(e, "auth/pin GET") }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const { env } = serverEnv();
  const lang = reqLang(req);
  if (!env.url || !env.serviceKey) return Response.json({ error: "server not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { pin?: string; newPin?: string; open?: boolean; refresh?: boolean; disablePin?: boolean };
  let owner: Awaited<ReturnType<typeof getOwner>>;
  try { owner = await getOwner(); } catch (e) { return Response.json({ error: safeError(e, "auth/pin POST") }, { status: 500 }); }

  const authed = verifyToken(req) === owner.id;
  // Every branch that checks the current PIN shares the brute-force throttle.
  const locked = async () => (await recentFails(owner.id)) >= MAX_FAILS;
  const lockedRes = () => Response.json({ error: m.in(lang, "pin.err.locked") }, { status: 429 });
  const wrong = async (msg: string) => { await logFail(owner.id, logicalDate(wallClock())); return Response.json({ error: msg }, { status: 401 }); };

  // PIN switched off by the owner: opening needs no PIN.
  if (body.open) {
    if (!owner.pinOff) return Response.json({ error: m.in(lang, "pin.err.required") }, { status: 401 });
    return Response.json({ ok: true, token: signToken(owner.id) });
  }

  // Extend a valid session (so "don't ask again on this device" lasts beyond 30 days).
  if (body.refresh) {
    if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json({ ok: true, token: signToken(owner.id) });
  }

  // Turn the PIN off entirely (needs a valid session + the current PIN).
  if (body.disablePin) {
    if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (owner.pin) {
      if (await locked()) return lockedRes();
      if (!(validPin(body.pin) && checkPin(body.pin, owner.pin))) return wrong(m.in(lang, "pin.err.wrong"));
    }
    await setPinOff(owner.id, true);
    return Response.json({ ok: true, token: signToken(owner.id) });
  }

  // Change PIN, or turn it back on (needs a valid session and the current PIN whenever one exists, even while off).
  if (body.newPin !== undefined) {
    if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!validPin(body.newPin)) return Response.json({ error: m.in(lang, "pin.err.format") }, { status: 400 });
    if (owner.pin) {
      if (await locked()) return lockedRes();
      if (!(validPin(body.pin) && checkPin(body.pin, owner.pin))) return wrong(m.in(lang, "pin.err.wrongOld"));
    }
    await setPin(owner.id, body.newPin);
    return Response.json({ ok: true, token: signToken(owner.id) });
  }

  if (!validPin(body.pin)) return Response.json({ error: m.in(lang, "pin.err.format") }, { status: 400 });

  // First run: the first PIN entered becomes the owner's PIN (claim once).
  if (!owner.pin) {
    await setPin(owner.id, body.pin);
    return Response.json({ ok: true, created: true, token: signToken(owner.id) });
  }

  const fails = await recentFails(owner.id);
  if (fails >= MAX_FAILS) return lockedRes();
  if (!checkPin(body.pin, owner.pin)) {
    await logFail(owner.id, logicalDate(wallClock()));
    return Response.json({ error: m.in(lang, "pin.err.wrong"), left: MAX_FAILS - fails - 1 }, { status: 401 });
  }
  return Response.json({ ok: true, token: signToken(owner.id) });
}
