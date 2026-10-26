"use client";

import { useSearchParams } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { AppBar, Segmented } from "@/components/ui";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-insights";
import { insightsHref, parseInsightsTab, type InsightsTab } from "@/lib/intent";
import { useBrain } from "@/lib/useBrain";
import { BalanceView } from "./BalanceView";
import { ReviewView } from "./ReviewView";
import { StatsView } from "./StatsView";

const m = msgs(C);

// One brain engine for both brain segments, so switching สมดุล <-> รีวิว keeps its state (AI busy, evals).
function BrainTabs({ tab }: { tab: "balance" | "review" }) {
  const b = useBrain("brief");
  return tab === "balance" ? <BalanceView b={b} /> : <ReviewView b={b} />;
}

// Insights tab (/insights?tab=balance|stats|review). Must render inside <Suspense> (useSearchParams).
export function InsightsView() {
  const tab = parseInsightsTab(useSearchParams().get("tab"));
  const tabs: [InsightsTab, string][] = [["balance", m("insightsView.tab.balance")], ["stats", m("insightsView.tab.stats")], ["review", m("insightsView.tab.review")]];
  return (
    <TabPage>
    <main className="screen">
      <AppBar title={m("insightsView.title")} />
      <h1 className="large-title">{m("insightsView.title")}</h1>
      {/* replaceState keeps useSearchParams in sync without a navigation (Next docs: Native History API). */}
      <Segmented label={m("insightsView.title")} value={tab} options={tabs} onChange={(v) => window.history.replaceState(null, "", insightsHref(v))} />
      {tab === "stats" ? <StatsView /> : <BrainTabs tab={tab} />}
    </main>
    </TabPage>
  );
}
