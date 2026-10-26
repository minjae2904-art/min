// URL helpers for in-app deep links (spec Round B section 7). Pure parts are tested in intent.test.ts.
import type { RunKind } from "./model";

// Insights tab segments: /insights?tab=balance|stats|review (balance is the default and has no query).
export const INSIGHTS_TABS = ["balance", "stats", "review"] as const;
export type InsightsTab = (typeof INSIGHTS_TABS)[number];
export const parseInsightsTab = (v: string | null | undefined): InsightsTab => (INSIGHTS_TABS as readonly string[]).includes(v ?? "") ? (v as InsightsTab) : "balance";
export const insightsHref = (t: InsightsTab) => (t === "balance" ? "/insights" : `/insights?tab=${t}`);

// Today deep links: /?do=water|weigh|trade|live|quick|golive|plan|shut (shared by "+", the accessory and pushes).
// v1.8 push deep links add care (&r=<routine id>), sing and meal2.
export const INTENTS = ["water", "weigh", "trade", "live", "quick", "golive", "plan", "shut", "care", "sing", "meal2"] as const;
export type Intent = (typeof INTENTS)[number];
export const parseIntent = (v: string | null | undefined): Intent | null => (INTENTS as readonly string[]).includes(v ?? "") ? (v as Intent) : null;
export const intentHref = (i: Intent, r?: string) => (i === "care" && r ? `/?do=care&r=${r}` : `/?do=${i}`);
export const parseRoutineParam = (v: unknown): string | null => (typeof v === "string" && /^[a-z0-9-]{1,24}$/.test(v) ? v : null);

// A same-origin app path from a push payload or a service worker message; anything else becomes "/".
// Mirrored by safeUrl in public/sw.js (shared cases in __tests__/url-cases.ts).
export function safeAppUrl(u: unknown): string {
  if (typeof u !== "string" || u.length > 200 || !u.startsWith("/") || u.startsWith("//") || u.includes("\\")) return "/";
  return /^\/[\w\-./?=&%]*$/.test(u) ? u : "/";
}

// Window events between the shell (Nav) and Today; no-ops on the server.
export function sendIntent(i: Intent) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Intent>("krob-intent", { detail: i })); }
export function openQuickLog() { if (typeof window !== "undefined") window.dispatchEvent(new Event("krob-quicklog")); }
// v1.7: open the Live mode overlay (Nav listens); no-op on the server.
export function openLive(k: RunKind = "live") { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<RunKind>("krob-live", { detail: k })); }
export function fireConfetti() { if (typeof window !== "undefined") window.dispatchEvent(new Event("krob-confetti")); }
