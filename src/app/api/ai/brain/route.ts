// Krob Brain AI: ranks and explains the rules engine's candidates. Never writes app_state; the client applies
// nothing without a tap. Any failure answers {src: "rules"} so the client keeps its own rules brief.
// Prompts and responses are never logged (safeError codes only).
import { createHash } from "node:crypto";
import { reqLang, withLang } from "@/i18n";
import { buildAiContext, stableStringify, userText } from "@/lib/brain/context";
import { brainReport } from "@/lib/brain/report";
import { SCHEMA_V, planSchema, systemBrain, validateAiOutput } from "@/lib/brain/schema";
import type { Mode } from "@/lib/brain/types";
import { logicalDate, wallClock } from "@/lib/date";
import { normalize } from "@/lib/model";
import { aiModel, aiProvider, completeJson } from "@/lib/server/ai";
import { admin, safeError, serverEnv } from "@/lib/server/push";
import { takeQuota } from "@/lib/server/quota";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const rules = (reason: string) => Response.json({ src: "rules", reason });

export async function POST(req: Request) {
  let refund: (() => Promise<void>) | null = null;
  try {
    if (!aiProvider()) return rules("no-key");
    const lang = reqLang(req);
    const { env } = serverEnv();
    if (!env.url || !env.serviceKey) return Response.json({ error: "missing env" }, { status: 500 });
    const uid = verifyToken(req);
    if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { mode?: unknown; rev?: unknown };
    const mode: Mode = body.mode === "weekly" ? "weekly" : "brief";

    const db = admin();
    const { data: row, error } = await db.from("app_state").select("data").eq("user_id", uid).maybeSingle();
    if (error) { safeError(error, "ai brain read"); return rules("error"); }
    if (!row?.data) return rules("no-data");
    const data = row.data as { updatedAt?: number };
    // The server must analyse what the phone shows: the client flushes first and sends its revision.
    if ((data.updatedAt ?? 0) !== body.rev) return Response.json({ error: "sync-first" }, { status: 409 });
    const s = normalize(data);
    if (!s.settings.brainAi) return rules("off");

    const today = logicalDate(wallClock());
    // Synchronous text generation in the request language (no await inside withLang).
    const built = withLang(lang, () => {
      const report = brainReport(s, today, mode);
      if (!report.candidates.length && report.balance.b === null) return null;
      const ctx = buildAiContext(report, s, today, mode);
      return { report, ctx, text: userText(ctx, mode) };
    });
    if (!built) return rules("no-data");
    const { report, ctx, text } = built;
    // th adds nothing to the hash, so Thai cache rows stay valid across the update.
    const hash = createHash("sha256").update(SCHEMA_V + mode + aiModel() + (lang === "th" ? "" : lang) + stableStringify(ctx)).digest("hex");

    // Cache hit is free. A missing table (v1.3-brain.sql not run) just reads as a miss.
    const hit = await db.from("ai_cache").select("plan, provider").eq("user_id", uid).eq("date", today).eq("mode", mode).eq("hash", hash).maybeSingle();
    if (!hit.error && hit.data) {
      const plan = validateAiOutput(hit.data.plan, report.candidates, mode, lang);
      if (plan) return Response.json({ src: "ai", cached: true, provider: hit.data.provider, plan });
    }

    const prefix = `ai:brain:${mode}:`;
    const q = await takeQuota(db, uid, today, prefix + Date.now(), { limit: 20, prefix, sub: mode === "brief" ? 3 : 2 });
    if (!q.ok) return rules(q.sub ? "sub-quota" : q.error ? "quota-error" : "quota");
    refund = q.refund;

    const r = await completeJson(systemBrain(lang), text, planSchema(lang), mode, lang);
    if ("error" in r) safeError(`${r.status}`, "ai brain model");
    const plan = "json" in r ? validateAiOutput(r.json, report.candidates, mode, lang) : null;
    if (!plan || !("json" in r)) { await q.refund(); return rules("ai-failed"); }
    refund = null;

    // Best effort: without v1.3-brain.sql the table is missing and caching silently does nothing.
    // lang tags the row so GET never hands a plan in another language to a second device.
    await db.from("ai_cache").upsert({ user_id: uid, date: today, mode, hash, plan: { ...plan, lang }, provider: r.provider });
    return Response.json({ src: "ai", provider: r.provider, plan, remaining: q.remaining });
  } catch (e) {
    safeError(e, "ai brain");
    if (refund) await refund();
    return rules("error");
  }
}

// Newest cached plan for today (a second device uses it when its local cache is empty). No quota.
export async function GET(req: Request) {
  try {
    const { env } = serverEnv();
    if (!env.url || !env.serviceKey) return Response.json({ plan: null });
    const uid = verifyToken(req);
    if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
    const mode: Mode = new URL(req.url).searchParams.get("mode") === "weekly" ? "weekly" : "brief";
    const lang = reqLang(req);
    const today = logicalDate(wallClock());
    const { data, error } = await admin().from("ai_cache").select("plan, provider, created_at")
      .eq("user_id", uid).eq("date", today).eq("mode", mode).order("created_at", { ascending: false }).limit(10);
    // Rows are per language: take the newest one in the request's language (legacy rows without lang are th).
    const row = error ? undefined : (data ?? []).find((r) => ((r.plan as { lang?: unknown } | null)?.lang ?? "th") === lang);
    if (!row) return Response.json({ plan: null });
    return Response.json({ plan: row.plan, provider: row.provider, at: Date.parse(row.created_at) });
  } catch (e) {
    safeError(e, "ai brain GET");
    return Response.json({ plan: null });
  }
}
