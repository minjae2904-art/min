// Daily AI quota shared by the coach and the brain, counted in notification_log (PK user_id, date, key).
// Insert-first reservation: insert our own row, then count; over the cap -> delete our row and refuse.
// Two exactly simultaneous calls at the edge can both be refused, never both allowed past the cap.
// Any DB error fails closed ({ok: false, error: true}); callers fall back to rules / a 503.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Quota = { ok: true; remaining: number; refund: () => Promise<void> } | { ok: false; sub?: boolean; error?: boolean };

export async function takeQuota(db: SupabaseClient, uid: string, date: string, key: string, opt: { limit: number; prefix?: string; sub?: number }): Promise<Quota> {
  const log = () => db.from("notification_log");
  const refund = async () => { try { await log().delete().eq("user_id", uid).eq("date", date).eq("key", key); } catch { /* best effort */ } };
  const count = async (like: string) => {
    const { count: n, error } = await log().select("*", { head: true, count: "exact" }).eq("user_id", uid).eq("date", date).like("key", like);
    if (error || typeof n !== "number") throw new Error("count");
    return n;
  };
  try {
    const { error } = await log().insert({ user_id: uid, date, key });
    if (error) return { ok: false, error: true };
  } catch { return { ok: false, error: true }; }
  try {
    const total = await count("ai:%");
    if (total > opt.limit) { await refund(); return { ok: false }; }
    if (opt.prefix && opt.sub !== undefined && (await count(opt.prefix + "%")) > opt.sub) { await refund(); return { ok: false, sub: true }; }
    return { ok: true, remaining: Math.max(0, opt.limit - total), refund };
  } catch {
    await refund();
    return { ok: false, error: true };
  }
}
