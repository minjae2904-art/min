import { describe, expect, it } from "vitest";
import { INSIGHTS_TABS, INTENTS, insightsHref, intentHref, parseInsightsTab, parseIntent } from "../intent";

describe("insights tab helpers", () => {
  it("parseInsightsTab defaults to balance", () => {
    expect(parseInsightsTab(null)).toBe("balance");
    expect(parseInsightsTab(undefined)).toBe("balance");
    expect(parseInsightsTab("")).toBe("balance");
    expect(parseInsightsTab("nope")).toBe("balance");
    expect(parseInsightsTab("STATS")).toBe("balance");
  });
  it("parseInsightsTab accepts every known tab", () => {
    for (const t of INSIGHTS_TABS) expect(parseInsightsTab(t)).toBe(t);
  });
  it("insightsHref drops the query for balance", () => {
    expect(insightsHref("balance")).toBe("/insights");
    expect(insightsHref("stats")).toBe("/insights?tab=stats");
    expect(insightsHref("review")).toBe("/insights?tab=review");
  });
  it("href round-trips through parse", () => {
    for (const t of INSIGHTS_TABS) expect(parseInsightsTab(new URL(insightsHref(t), "http://x").searchParams.get("tab"))).toBe(t);
  });
});

describe("today intents", () => {
  it("parseIntent accepts known intents only", () => {
    for (const i of INTENTS) expect(parseIntent(i)).toBe(i);
    expect(parseIntent(null)).toBeNull();
    expect(parseIntent(undefined)).toBeNull();
    expect(parseIntent("")).toBeNull();
    expect(parseIntent("WATER")).toBeNull();
    expect(parseIntent("delete")).toBeNull();
  });
  it("intentHref builds /?do= and round-trips", () => {
    expect(intentHref("water")).toBe("/?do=water");
    expect(intentHref("live")).toBe("/?do=live");
    for (const i of INTENTS) expect(parseIntent(new URL(intentHref(i), "http://x").searchParams.get("do"))).toBe(i);
  });
});
