// AI output schema, frozen system prompt and the output validator (pure, client-importable: no node or SDK imports).
// The same PLAN_SCHEMA goes to Gemini responseFormat, the legacy responseJsonSchema and Claude structured output.
// Limits live in descriptions only (no min/max/length keywords); validateAiOutput enforces them.
import { msgs, type Lang } from "../../i18n";
import * as M from "../../i18n/msg/lib-brain-11";
import { AREAS, GAP_IDS, TIP_IDS, type AiPlan, type AreaKey, type Candidate, type GapId, type Mode, type TipId } from "./types";

const m = msgs(M);

export const SCHEMA_V = "1";

// Frozen per language, no dates or ids, so providers can cache it. Text lives in lib-brain-11 (th = the original prompt).
export const SYSTEM_BRAIN = m.in("th", "schema.system");

function buildSchema(lang: Lang) {
  const d = (k: "headline" | "summary" | "note" | "why" | "ifThen" | "tipWhy" | "question") => m.in(lang, `schema.desc.${k}`);
  return {
    type: "object", additionalProperties: false,
    required: ["headline", "summary", "focus", "areaNotes", "picks", "tips", "question", "dataGaps"],
    properties: {
      headline: { type: "string", description: d("headline") },
      summary: { type: "string", description: d("summary") },
      focus: { type: "array", description: "0-2 areas", items: { type: "string", enum: AREAS } },
      areaNotes: {
        type: "array", description: "at most 9; empty in brief mode",
        items: {
          type: "object", additionalProperties: false, required: ["area", "note"],
          properties: { area: { type: "string", enum: AREAS }, note: { type: "string", description: d("note") } },
        },
      },
      picks: {
        type: "array", description: "brief at most 2, weekly at most 5; ids from data.candidates only; best first",
        items: {
          type: "object", additionalProperties: false, required: ["id", "variant", "why", "ifThen"],
          properties: {
            id: { type: "string" },
            variant: { type: "integer", description: "0-based index into that candidate's v list" },
            why: { type: "string", description: d("why") },
            ifThen: { type: "string", description: d("ifThen") },
          },
        },
      },
      tips: {
        type: "array", description: "at most 3",
        items: {
          type: "object", additionalProperties: false, required: ["tip", "why"],
          properties: { tip: { type: "string", enum: TIP_IDS }, why: { type: "string", description: d("tipWhy") } },
        },
      },
      question: { type: "string", description: d("question") },
      dataGaps: { type: "array", items: { type: "string", enum: GAP_IDS } },
    },
  } as const;
}
export const PLAN_SCHEMA = buildSchema("th");

export const TEXT_MAX = { headline: 80, summary: 400, note: 140, why: 160, ifThen: 120, tipWhy: 120, question: 120 } as const;

// Per-language prompt, schema and caps (Round E). English text runs longer than Thai, so non-th caps are 30% higher
// (the en schema descriptions state the same limits). SYSTEM_BRAIN, PLAN_SCHEMA and TEXT_MAX stay the th values (tests).
type Caps = { readonly [K in keyof typeof TEXT_MAX]: number };
const SCALED: Caps = Object.fromEntries(Object.entries(TEXT_MAX).map(([k, v]) => [k, Math.round(v * 1.3)])) as Caps;
export const textMax = (lang: Lang): Caps => (lang === "th" ? TEXT_MAX : SCALED);
export const systemBrain = (lang: Lang): string => m.in(lang, "schema.system");
const schemas = new Map<Lang, Record<string, unknown>>([["th", PLAN_SCHEMA]]);
export function planSchema(lang: Lang): Record<string, unknown> {
  let v = schemas.get(lang);
  if (!v) { v = buildSchema(lang); schemas.set(lang, v); }
  return v;
}

// Plain text only: no control chars/newlines, no markdown or HTML openers, no links.
export function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const plain = Array.from(v, (c) => { const n = c.charCodeAt(0); return n < 32 || (n >= 127 && n < 160) ? " " : c; }).join("");
  const out = plain.replace(/\*\*/g, "").replace(/[`#<]/g, "").replace(/\s+/g, " ").trim();
  // Check links after stripping so "h**ttps://" cannot reassemble into a URL.
  return /http/i.test(out) ? "" : out.slice(0, max).trim();
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const inSet = <T extends string>(set: readonly T[]) => (v: unknown): v is T => typeof v === "string" && (set as readonly string[]).includes(v);
const isArea = inSet<AreaKey>(AREAS), isTip = inSet<TipId>(TIP_IDS), isGap = inSet<GapId>(GAP_IDS);

// Model output is untrusted: rebuild it key by key (unknown keys dropped), enforce enums and caps,
// and keep only picks that name one of the engine's candidates. null = nothing usable.
// lang: output language; picks the text caps (textMax).
export function validateAiOutput(raw: unknown, candidates: Candidate[], mode: Mode, lang: Lang = "th"): AiPlan | null {
  if (!isObj(raw)) return null;
  const cap = textMax(lang);
  const brief = mode === "brief";
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const picks: AiPlan["picks"] = [];
  for (const p of list(raw.picks)) {
    if (picks.length >= (brief ? 2 : 5)) break;
    if (!isObj(p) || typeof p.id !== "string") continue;
    const cand = byId.get(p.id);
    if (!cand || (brief && cand.weeklyOnly) || picks.some((x) => x.id === p.id)) continue;
    const v = p.variant;
    const variant = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < cand.variants.length ? v : 0;
    picks.push({ id: cand.id, variant, why: sanitizeText(p.why, cap.why), ifThen: sanitizeText(p.ifThen, cap.ifThen) });
  }
  const headline = sanitizeText(raw.headline, cap.headline);
  if (!picks.length && !headline) return null;
  const focus = [...new Set(list(raw.focus).filter(isArea))].slice(0, 2);
  const areaNotes: AiPlan["areaNotes"] = [];
  if (!brief) for (const n of list(raw.areaNotes)) {
    if (areaNotes.length >= 9) break;
    if (!isObj(n) || !isArea(n.area) || areaNotes.some((x) => x.area === n.area)) continue;
    const note = sanitizeText(n.note, cap.note);
    if (note) areaNotes.push({ area: n.area, note });
  }
  const tips: AiPlan["tips"] = [];
  for (const t of list(raw.tips)) {
    if (tips.length >= 3) break;
    if (!isObj(t) || !isTip(t.tip) || tips.some((x) => x.tip === t.tip)) continue;
    tips.push({ tip: t.tip, why: sanitizeText(t.why, cap.tipWhy) });
  }
  return {
    headline, summary: brief ? "" : sanitizeText(raw.summary, cap.summary), focus, areaNotes, picks, tips,
    question: sanitizeText(raw.question, cap.question), dataGaps: [...new Set(list(raw.dataGaps).filter(isGap))],
  };
}
