"use client";

import { getLang, langHeader, type Lang } from "../i18n/core";
import type { Mode } from "./brain/types";

// Client side of /api/ai/brain plus the local caches. The plan is untrusted: useBrain re-validates it against the
// local candidates (validateAiOutput) before anything is shown.
export type BrainReply = {
  src: "ai" | "rules"; plan?: unknown; provider?: string; remaining?: number; reason?: string; cached?: boolean;
  syncFirst?: boolean; unauthorized?: boolean; error?: string;
};
export type CachedPlan = { at: number; src: "ai" | "rules"; provider?: string; plan: unknown };

const CACHE = "krob-brain-v1";
const REQ = "krob-brain-req:";
const NOKEY = "krob-brain-nokey"; // date of the last "no-key" answer (AI buttons hidden for that day)
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
const del = (k: string) => { try { localStorage.removeItem(k); } catch {} };

export async function askBrain(token: string | null, mode: Mode, rev: number): Promise<BrainReply> {
  if (!token) return { src: "rules", unauthorized: true };
  const r = await fetch("/api/ai/brain", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...langHeader() },
    body: JSON.stringify({ mode, rev }), signal: AbortSignal.timeout(65_000),
  }).catch(() => null);
  if (!r) return { src: "rules", error: "network" };
  if (r.status === 401) return { src: "rules", unauthorized: true };
  if (r.status === 409) return { src: "rules", syncFirst: true };
  const j = (await r.json().catch(() => null)) as BrainReply | null;
  if (!r.ok || !j || (j.src !== "ai" && j.src !== "rules")) return { src: "rules", error: `http-${r.status}` };
  return j;
}

export async function getBrain(token: string | null, mode: Mode): Promise<{ plan: unknown; provider?: string; at?: number } | null> {
  if (!token) return null;
  const r = await fetch(`/api/ai/brain?mode=${mode}`, { headers: { authorization: `Bearer ${token}`, ...langHeader() }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { plan?: unknown; provider?: string; at?: number } | null;
  return j?.plan ? { plan: j.plan, provider: typeof j.provider === "string" ? j.provider : undefined, at: typeof j.at === "number" ? j.at : undefined } : null;
}

function readAll(): Record<string, CachedPlan> {
  try { const j = JSON.parse(get(CACHE) ?? "{}"); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
// v1.9: keyed by language too (an English plan never shows in Thai and vice versa).
export function readCache(date: string, mode: Mode, lang: Lang = getLang()): CachedPlan | null {
  const e = readAll()[`${date}:${mode}:${lang}`];
  return e && typeof e === "object" && typeof e.at === "number" ? e : null;
}
// Keeps the 10 newest entries.
export function writeCache(date: string, mode: Mode, e: CachedPlan, lang: Lang = getLang()) {
  const all = { ...readAll(), [`${date}:${mode}:${lang}`]: e };
  set(CACHE, JSON.stringify(Object.fromEntries(Object.entries(all).sort(([, a], [, b]) => (b?.at ?? 0) - (a?.at ?? 0)).slice(0, 10))));
}

// One automatic brief per logical day: set before the call, never retried. Memory backs storage that throws.
const mem = new Set<string>();
export const reqGuard = {
  has: (date: string) => mem.has(date) || get(REQ + date) !== null,
  set: (date: string) => {
    mem.add(date);
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(REQ) && k !== REQ + date) localStorage.removeItem(k); } } catch {}
    set(REQ + date, "1");
  },
};

let noKeyMem: string | null = null;
export const noKey = {
  is: (date: string) => noKeyMem === date || get(NOKEY) === date,
  set: (date: string) => { noKeyMem = date; set(NOKEY, date); },
  clear: () => { noKeyMem = null; del(NOKEY); },
};

// Logout: forget every brain key on this device (AI text about the user included).
export function clearBrainCache() {
  mem.clear();
  noKeyMem = null;
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith("krob-brain-")) localStorage.removeItem(k); } } catch {}
}
