// URL helpers for in-app deep links (spec Round B section 7). Pure parts are tested in intent.test.ts.

// Insights tab segments: /insights?tab=balance|stats|review (balance is the default and has no query).
export const INSIGHTS_TABS = ["balance", "stats", "review"] as const;
export type InsightsTab = (typeof INSIGHTS_TABS)[number];
export const parseInsightsTab = (v: string | null | undefined): InsightsTab => (INSIGHTS_TABS as readonly string[]).includes(v ?? "") ? (v as InsightsTab) : "balance";
export const insightsHref = (t: InsightsTab) => (t === "balance" ? "/insights" : `/insights?tab=${t}`);

// Today deep links: /?do=water|weigh|trade|live|quick (shared by "+", the accessory and future pushes).
export const INTENTS = ["water", "weigh", "trade", "live", "quick"] as const;
export type Intent = (typeof INTENTS)[number];
export const parseIntent = (v: string | null | undefined): Intent | null => (INTENTS as readonly string[]).includes(v ?? "") ? (v as Intent) : null;
export const intentHref = (i: Intent) => `/?do=${i}`;

// Window events between the shell (Nav) and Today; no-ops on the server.
export function sendIntent(i: Intent) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Intent>("krob-intent", { detail: i })); }
export function openQuickLog() { if (typeof window !== "undefined") window.dispatchEvent(new Event("krob-quicklog")); }
export function fireConfetti() { if (typeof window !== "undefined") window.dispatchEvent(new Event("krob-confetti")); }
