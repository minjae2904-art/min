import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { takeQuota } from "../server/quota";

type Row = { user_id: string; date: string; key: string };
// Minimal notification_log stand-in: insert / select(count).eq().like() / delete().eq() chains.
function fakeDb(rows: Row[] = [], fail: { insert?: boolean; count?: boolean } = {}) {
  const chain = (run: (f: Partial<Row>, like?: string) => unknown) => {
    const f: Partial<Row> = {};
    let like: string | undefined;
    const c = {
      eq(k: keyof Row, v: string) { f[k] = v; return c; },
      like(_k: string, p: string) { like = p; return c; },
      then(res: (v: unknown) => void) { res(run(f, like)); },
    };
    return c;
  };
  const match = (r: Row, f: Partial<Row>, like?: string) =>
    (Object.keys(f) as (keyof Row)[]).every((k) => r[k] === f[k]) && (!like || r.key.startsWith(like.replace(/%$/, "")));
  const db = {
    from: () => ({
      insert: async (r: Row) => {
        if (fail.insert || rows.some((x) => x.user_id === r.user_id && x.date === r.date && x.key === r.key)) return { error: { message: "boom" } };
        rows.push(r);
        return { error: null };
      },
      select: () => chain((f, like) => (fail.count ? { count: null, error: { message: "boom" } } : { count: rows.filter((r) => match(r, f, like)).length, error: null })),
      delete: () => chain((f) => { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], f)) rows.splice(i, 1); return { error: null }; }),
    }),
  };
  return { db: db as unknown as SupabaseClient, rows };
}
const fill = (n: number, prefix = "ai:", date = "2026-10-20") => Array.from({ length: n }, (_, i) => ({ user_id: "u", date, key: `${prefix}${i}` }));

describe("takeQuota", () => {
  it("allows under the limit and keeps its row", async () => {
    const { db, rows } = fakeDb(fill(5));
    const q = await takeQuota(db, "u", "2026-10-20", "ai:coach:1", { limit: 20 });
    expect(q).toMatchObject({ ok: true, remaining: 14 });
    expect(rows).toHaveLength(6);
  });
  it("refuses over the limit and deletes its own row", async () => {
    const { db, rows } = fakeDb([...fill(20), ...fill(3, "push:")]);
    const q = await takeQuota(db, "u", "2026-10-20", "ai:coach:1", { limit: 20 });
    expect(q).toEqual({ ok: false });
    expect(rows).toHaveLength(23);
    expect(rows.some((r) => r.key === "ai:coach:1")).toBe(false);
  });
  it("only counts the same user and date", async () => {
    const { db } = fakeDb([...fill(20, "ai:", "2026-10-19"), ...fill(20).map((r) => ({ ...r, user_id: "x" }))]);
    expect((await takeQuota(db, "u", "2026-10-20", "ai:coach:1", { limit: 20 })).ok).toBe(true);
  });
  it("enforces the sub-cap", async () => {
    const { db, rows } = fakeDb(fill(3, "ai:brain:brief:"));
    const q = await takeQuota(db, "u", "2026-10-20", "ai:brain:brief:9", { limit: 20, prefix: "ai:brain:brief:", sub: 3 });
    expect(q).toEqual({ ok: false, sub: true });
    expect(rows).toHaveLength(3);
    const w = await takeQuota(db, "u", "2026-10-20", "ai:brain:weekly:9", { limit: 20, prefix: "ai:brain:weekly:", sub: 2 });
    expect(w).toMatchObject({ ok: true, remaining: 16 });
  });
  it("refund deletes the reservation", async () => {
    const { db, rows } = fakeDb(fill(2));
    const q = await takeQuota(db, "u", "2026-10-20", "ai:brain:brief:1", { limit: 20, prefix: "ai:brain:brief:", sub: 3 });
    expect(rows).toHaveLength(3);
    if (q.ok) await q.refund();
    expect(rows).toHaveLength(2);
  });
  it("fails closed on DB errors", async () => {
    expect(await takeQuota(fakeDb([], { insert: true }).db, "u", "2026-10-20", "ai:coach:1", { limit: 20 })).toEqual({ ok: false, error: true });
    const f = fakeDb([], { count: true });
    expect(await takeQuota(f.db, "u", "2026-10-20", "ai:coach:1", { limit: 20 })).toEqual({ ok: false, error: true });
    expect(f.rows).toHaveLength(0);
  });
});
