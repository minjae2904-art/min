import { describe, expect, it } from "vitest";
import { PLAN_SCHEMA, SYSTEM_BRAIN, sanitizeText, validateAiOutput } from "../brain/schema";
import type { BrainAction, Candidate } from "../brain/types";

type Node = { type?: unknown; properties?: Record<string, Node>; required?: readonly string[]; additionalProperties?: unknown; items?: Node; [k: string]: unknown };
const FORBIDDEN = ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "pattern", "$ref", "nullable", "oneOf", "anyOf"];

function walk(n: Node, path: string, out: string[]): number {
  for (const k of FORBIDDEN) if (k in n) out.push(`${path}: ${k}`);
  if (typeof n.type !== "string") out.push(`${path}: type must be one string`);
  let child = 0;
  if (n.type === "object") {
    if (n.additionalProperties !== false) out.push(`${path}: additionalProperties`);
    const keys = Object.keys(n.properties ?? {}).sort();
    if (JSON.stringify([...(n.required ?? [])].sort()) !== JSON.stringify(keys)) out.push(`${path}: required`);
    for (const [k, v] of Object.entries(n.properties ?? {})) child = Math.max(child, walk(v, `${path}.${k}`, out));
  }
  if (n.type === "array") {
    if (!n.items) out.push(`${path}: items`);
    else child = Math.max(child, walk(n.items, `${path}[]`, out));
  }
  return 1 + child;
}

const tip = (ref: "mvd"): BrainAction => ({ k: "tip", ref });
const cand = (id: string, n = 2, weeklyOnly = false): Candidate => ({
  id, rule: "R15", area: "trading", sev: 1, prio: 1, sig: id, title: "", why: "", ifThen: "", ev: {}, tips: [],
  variants: Array.from({ length: n }, () => ({ label: "", actions: [tip("mvd")] })), evalSpec: null, ...(weeklyOnly ? { weeklyOnly } : {}),
});
const CANDS = [cand("R15:a"), cand("R16:b", 1), cand("R20:c", 2, true), cand("R08:d", 3)];
const base = { headline: "นอน 80 ดีมาก", summary: "", focus: [], areaNotes: [], picks: [], tips: [], question: "", dataGaps: [] };

describe("PLAN_SCHEMA", () => {
  it("is strict, flat and keyword-safe for both providers", () => {
    const errs: string[] = [];
    const depth = walk(PLAN_SCHEMA as unknown as Node, "$", errs);
    expect(errs).toEqual([]);
    expect(depth).toBeLessThanOrEqual(4);
  });
  it("system prompt is frozen text (no dates)", () => {
    expect(SYSTEM_BRAIN).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_BRAIN.endsWith("ตอบเป็น JSON ตาม schema เท่านั้น")).toBe(true);
  });
});

describe("validateAiOutput", () => {
  it("strips unknown keys at every level", () => {
    const p = validateAiOutput({ ...base, extra: 1, picks: [{ id: "R15:a", variant: 0, why: "w", ifThen: "i", x: 2 }], tips: [{ tip: "mvd", why: "", y: 3 }] }, CANDS, "brief")!;
    expect(Object.keys(p).sort()).toEqual(["areaNotes", "dataGaps", "focus", "headline", "picks", "question", "summary", "tips"]);
    expect(Object.keys(p.picks[0]).sort()).toEqual(["id", "ifThen", "variant", "why"]);
    expect(Object.keys(p.tips[0]).sort()).toEqual(["tip", "why"]);
  });
  it("drops unknown, duplicate and weeklyOnly-in-brief picks", () => {
    const picks = [{ id: "nope" }, { id: "R20:c", variant: 0 }, { id: "R15:a", variant: 1 }, { id: "R15:a", variant: 0 }, { id: "R16:b", variant: 0 }];
    expect(validateAiOutput({ ...base, picks }, CANDS, "brief")!.picks.map((x) => x.id)).toEqual(["R15:a", "R16:b"]);
    expect(validateAiOutput({ ...base, picks }, CANDS, "weekly")!.picks.map((x) => x.id)).toEqual(["R20:c", "R15:a", "R16:b"]);
  });
  it("out-of-range or non-integer variant becomes 0", () => {
    const picks = [{ id: "R15:a", variant: 5 }, { id: "R08:d", variant: 1.5 }, { id: "R16:b", variant: "0" }];
    expect(validateAiOutput({ ...base, picks }, CANDS, "weekly")!.picks.map((x) => x.variant)).toEqual([0, 0, 0]);
    expect(validateAiOutput({ ...base, picks: [{ id: "R08:d", variant: 2 }] }, CANDS, "weekly")!.picks[0].variant).toBe(2);
  });
  it("sanitizes and truncates text", () => {
    expect(sanitizeText("a<script>alert(1)</script>b", 200)).not.toContain("<");
    expect(sanitizeText("ดูที่ https://x.y", 200)).toBe("");
    expect(sanitizeText("HTTP link", 200)).toBe("");
    expect(sanitizeText("h**ttps://x", 200)).toBe("");
    expect(sanitizeText("ht`tp://x", 200)).toBe("");
    expect(sanitizeText("บรรทัด1\nบรรทัด2\t`code` **หนา** # หัว", 200)).toBe("บรรทัด1 บรรทัด2 code หนา หัว");
    const p = validateAiOutput({ ...base, headline: "ก".repeat(200), question: "q".repeat(300), summary: "s".repeat(900),
      areaNotes: [{ area: "sleep", note: "n".repeat(300) }], picks: [{ id: "R15:a", variant: 0, why: "w".repeat(300), ifThen: "i".repeat(300) }] }, CANDS, "weekly")!;
    expect(p.headline.length).toBe(80);
    expect(p.question.length).toBe(120);
    expect(p.summary.length).toBe(400);
    expect(p.areaNotes[0].note.length).toBe(140);
    expect(p.picks[0].why.length).toBe(160);
    expect(p.picks[0].ifThen.length).toBe(120);
  });
  it("enforces enums", () => {
    const p = validateAiOutput({ ...base, focus: ["sleep", "money", "sleep", 3], tips: [{ tip: "buy-btc", why: "" }, { tip: "voice-ent", why: "x" }],
      dataGaps: ["weigh", "bogus"], areaNotes: [{ area: "stocks", note: "x" }, { area: "voice", note: "ok" }] }, CANDS, "weekly")!;
    expect(p.focus).toEqual(["sleep"]);
    expect(p.tips).toEqual([{ tip: "voice-ent", why: "x" }]);
    expect(p.dataGaps).toEqual(["weigh"]);
    expect(p.areaNotes).toEqual([{ area: "voice", note: "ok" }]);
  });
  it("applies caps per mode", () => {
    const AREA9 = ["sleep", "nutrition", "training", "voice", "trading", "projects", "leisure", "recovery", "consistency"];
    const raw = {
      ...base, summary: "สรุป", focus: ["sleep", "voice", "training"],
      areaNotes: AREA9.map((area) => ({ area, note: "x" })),
      tips: ["mvd", "voice-ent", "talk-support", "last-match"].map((t) => ({ tip: t, why: "" })),
      picks: CANDS.map((c) => ({ id: c.id, variant: 0 })),
    };
    const b = validateAiOutput(raw, CANDS, "brief")!, w = validateAiOutput(raw, CANDS, "weekly")!;
    expect([b.picks.length, b.areaNotes.length, b.summary, b.focus.length, b.tips.length]).toEqual([2, 0, "", 2, 3]);
    expect([w.picks.length, w.areaNotes.length, w.summary]).toEqual([4, 9, "สรุป"]);
    const many = Array.from({ length: 7 }, (_, i) => cand(`R0${i}:z`));
    expect(validateAiOutput({ ...base, picks: many.map((c) => ({ id: c.id, variant: 0 })) }, many, "weekly")!.picks).toHaveLength(5);
  });
  it("returns null when nothing usable", () => {
    expect(validateAiOutput(null, CANDS, "brief")).toBeNull();
    expect(validateAiOutput("text", CANDS, "brief")).toBeNull();
    expect(validateAiOutput([base], CANDS, "brief")).toBeNull();
    expect(validateAiOutput({ ...base, headline: "", picks: [{ id: "nope", variant: 0 }] }, CANDS, "brief")).toBeNull();
    expect(validateAiOutput({ ...base, headline: "http://x" }, CANDS, "brief")).toBeNull();
    expect(validateAiOutput({ ...base, headline: "", picks: [{ id: "R15:a", variant: 0 }] }, CANDS, "brief")).not.toBeNull();
  });
});
