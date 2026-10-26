// AI coach: analyses the user's own summarized data with Claude and answers in the request language.
// Needs GEMINI_API_KEY or ANTHROPIC_API_KEY (+ the Supabase service key to read app_state) in Vercel env.
import { msgs, reqLang, withLang } from "@/i18n";
import * as M from "@/i18n/msg/app-api-ai-coach";
import { aiSummary } from "@/lib/ai-summary";
import { logicalDate, wallClock } from "@/lib/date";
import { normalize } from "@/lib/model";
import { aiProvider, complete, type AiResult, type AiTurn } from "@/lib/server/ai";
import { admin, serverEnv } from "@/lib/server/push";
import { takeQuota } from "@/lib/server/quota";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 20;
// Prompts and errors per request language; m.in(lang, "coach.system") is frozen (no dates/IDs) so it stays cacheable.
const m = msgs(M);

export async function POST(req: Request) {
  const { env } = serverEnv();
  if (!aiProvider()) return Response.json({ error: "missing env", missing: ["GEMINI_API_KEY"] }, { status: 500 });
  if (!env.url || !env.serviceKey) return Response.json({ error: "missing env", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 500 });

  const db = admin();
  const lang = reqLang(req); // language of the answer, the prompts, the data summary and the error texts
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { mode?: "coach" | "ask"; question?: string; history?: unknown };
  const question = (body.question ?? "").trim().slice(0, 500);
  // Up to 2 earlier Q/A pairs (oldest first) so a follow-up like "แล้วควรทำยังไง" keeps its context.
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((h): h is { q: string; a: string } => !!h && typeof h === "object" && typeof (h as { q?: unknown }).q === "string" && typeof (h as { a?: unknown }).a === "string")
    .slice(-2)
    .map((h) => ({ q: h.q.trim().slice(0, 500), a: h.a.trim().slice(0, 1500) }))
    .filter((h) => h.q && h.a);
  if (body.mode === "ask" && !question) return Response.json({ error: "empty question" }, { status: 400 });

  const now = wallClock();
  const today = logicalDate(now);
  const { data: st } = await db.from("app_state").select("data").eq("user_id", uid).maybeSingle();
  if (!st) return Response.json({ error: m.in(lang, "coach.err.noData") }, { status: 400 });
  const s = normalize(st.data);
  const summary = withLang(lang, () => aiSummary(s, today));
  const identity = s.settings.aiSendIdentity && s.profile.identity ? m.in(lang, "coach.identity", { identity: s.profile.identity }) : "";

  // Daily cap shared with the brain (notification_log keys ai:*): reserved before the call, refunded on error.
  const q = await takeQuota(db, uid, today, `ai:coach:${Date.now()}`, { limit: DAILY_LIMIT });
  if (!q.ok) return q.error
    ? Response.json({ error: m.in(lang, "coach.err.quotaCheck") }, { status: 503 })
    : Response.json({ error: m.in(lang, "coach.err.quota", { n: DAILY_LIMIT }) }, { status: 429 });

  // Earlier turns carry only the question; the data summary stays in the final user turn so it is always current.
  const turns: AiTurn[] = history.flatMap((h) => [{ role: "user" as const, text: h.q }, { role: "assistant" as const, text: h.a }]);
  const task = body.mode === "ask" ? m.in(lang, "coach.ask", { question }) : m.in(lang, "coach.task");
  turns.push({ role: "user", text: m.in(lang, "coach.turn", { summary, identity, task }) });
  const r = await complete(m.in(lang, "coach.system"), turns, lang).catch((): AiResult => ({ error: m.in(lang, "coach.err.connect"), status: 502 }));
  if ("error" in r) { await q.refund(); return Response.json({ error: r.error }, { status: r.status }); }
  return Response.json({ ok: true, text: r.text, remaining: q.remaining });
}
