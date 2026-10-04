// PIN-only access for a single-user app. No email: the server owns one Supabase user ("owner"),
// verifies the PIN (scrypt hash kept in the owner's app_metadata, writable only with the service key)
// and hands out a signed token. All data access then goes through server routes with the service key.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { admin, serverEnv } from "./push";

const TOKEN_DAYS = 30;
export const MAX_FAILS = 5; // per 15 minutes
const FAIL_WINDOW_MS = 15 * 60_000;

const signingKey = () => createHash("sha256").update(`krob-session:${serverEnv().env.serviceKey}`).digest();
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(uid: string): string {
  const payload = b64(JSON.stringify({ uid, exp: Date.now() + TOKEN_DAYS * 86_400_000 }));
  return `${payload}.${b64(createHmac("sha256", signingKey()).update(payload).digest())}`;
}

// Returns the owner id if the bearer token is valid and unexpired.
export function verifyToken(req: Request): string | null {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !serverEnv().env.serviceKey) return null;
  const want = createHmac("sha256", signingKey()).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof uid === "string" && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")): string {
  return `scrypt$${salt}$${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function checkPin(pin: string, stored: string): boolean {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = Buffer.from(hashPin(pin, salt).split("$")[2], "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// The single owner: whoever already has app_state, else the first auth user, else a new one (no real email needed).
export async function getOwner(): Promise<{ id: string; pin: string | null; pinOff: boolean }> {
  const db = admin();
  const { data: row } = await db.from("app_state").select("user_id").limit(1).maybeSingle();
  let id = row?.user_id as string | undefined;
  if (!id) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
    id = data?.users[0]?.id;
  }
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({ email: `owner-${randomBytes(4).toString("hex")}@krob.local`, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message ?? "create owner failed");
    id = data.user.id;
  }
  const { data: u } = await db.auth.admin.getUserById(id);
  const meta = (u.user?.app_metadata ?? {}) as { krob_pin?: string; krob_pin_off?: boolean };
  return { id, pin: meta.krob_pin ?? null, pinOff: !!meta.krob_pin_off };
}

// Owner chose to open the app without a PIN (anyone with the link can then open it).
export async function setPinOff(uid: string, off: boolean) {
  const db = admin();
  const { data: u } = await db.auth.admin.getUserById(uid);
  await db.auth.admin.updateUserById(uid, { app_metadata: { ...(u.user?.app_metadata ?? {}), krob_pin_off: off } });
}

export async function setPin(uid: string, pin: string) {
  const db = admin();
  const { data: u } = await db.auth.admin.getUserById(uid);
  await db.auth.admin.updateUserById(uid, { app_metadata: { ...(u.user?.app_metadata ?? {}), krob_pin: hashPin(pin), krob_pin_off: false } });
}

// Failed attempts are logged in notification_log (key pinfail:<ts>) so brute force is throttled server-side.
export async function recentFails(uid: string): Promise<number> {
  const since = new Date(Date.now() - FAIL_WINDOW_MS).toISOString();
  const { count } = await admin().from("notification_log").select("*", { head: true, count: "exact" }).eq("user_id", uid).like("key", "pinfail:%").gte("sent_at", since);
  return count ?? 0;
}

export async function logFail(uid: string, date: string) {
  await admin().from("notification_log").insert({ user_id: uid, date, key: `pinfail:${Date.now()}` });
}

export const validPin = (p: unknown): p is string => typeof p === "string" && /^\d{4,6}$/.test(p);
