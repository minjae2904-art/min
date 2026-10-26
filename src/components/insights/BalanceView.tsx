"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Sparkline } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { BalanceDials } from "@/components/brain/BalanceDials";
import { Ring } from "@/components/brain/BrainCard";
import { ProposalCard } from "@/components/brain/ProposalCard";
import { RollNum, Section } from "@/components/ui";
import { msgs, withLang } from "@/i18n";
import { rich, useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components-insights";
import { AREA_LABEL, CONFLICT_LABEL, EV_LABEL, evText, logMoreDays, lowDataHeadline } from "@/lib/brain/copy";
import { composeBrief } from "@/lib/brain/report";
import type { AreaKey } from "@/lib/brain/types";
import { addDays } from "@/lib/date";
import { patternConf } from "@/lib/honest";
import { play } from "@/lib/sound";
import type { BrainApi } from "@/lib/useBrain";

const m = msgs(C);

// Insights > สมดุล (was the top of /balance): score, dials, conflicts, patterns, top proposals.
export function BalanceView({ b }: { b: BrainApi }) {
  const { s, report, brief, today } = b;
  const router = useRouter();
  const lang = useLang();
  const bal = report.balance;
  const score = (k: AreaKey | null) => report.areas.find((a) => a.key === k)?.score ?? "-";
  // Top 5: the brief's picks (AI or rules) first, then the next candidates that are not hidden.
  const props = useMemo(() => withLang(lang, () => {
    const more = composeBrief(report, null, "weekly", s.brain, today).items;
    return [...brief.items, ...more.filter((m) => !brief.items.some((x) => x.cand.id === m.cand.id))].slice(0, 5);
  }), [report, s.brain, today, brief.items, lang]);
  const weeks = s.brain.weeks.map((w) => Number(w[1])).filter((v) => v >= 0);
  const load = report.load.length ? Math.round(report.load.reduce((a, x) => a + x, 0) / report.load.length) : null;
  const workBusy = report.plan.some((p) => p.work && p.load > 0.9);
  const logged = report.sigs.filter((d) => d.logged && d.date < today && d.date >= addDays(today, -13)).length; // same window as useBrainToday

  return (
    <>
      {bal.b === null && (
        <div className="card">
          <EmptyState art="streaming" compact title={logged < 3 ? logMoreDays(3 - logged) : lowDataHeadline()} action={{ label: m("balanceView.goToday"), onClick: () => { play("nav"); router.push("/"); } }} />
        </div>
      )}

      <div className="card balance-head">
        <Ring value={bal.b} size={64} />
        <div className="row-main">
          <div className="balance-num">{rich(m("balanceView.score"), { num: <b className="num">{bal.b === null ? "-" : <RollNum value={bal.b} />}</b> })}</div>
          {bal.best && bal.weakest && bal.best !== bal.weakest && <div className="row-sub">{m("balanceView.lean", { best: AREA_LABEL[bal.best], bestScore: score(bal.best), weak: AREA_LABEL[bal.weakest], weakScore: score(bal.weakest) })}</div>}
          {load !== null && <div className="row-sub">{m("balanceView.load", { load, busy: workBusy ? m("balanceView.workBusy") : "" })}</div>}
        </div>
        <Sparkline values={bal.b === null ? weeks : [...weeks, bal.b]} label={m("balanceView.spark")} domain={[0, 100]} tone="var(--accent)" w={80} />
      </div>

      <BalanceDials b={b} />

      {report.conflicts.length > 0 && (
        <Section header={m("balanceView.conflicts")}>
          {report.conflicts.map((c) => (
            <div key={c.id} className="insight"><span className={`insight-dot ${c.sev === 3 ? "is-high" : ""}`} />
              <span><b>{CONFLICT_LABEL[c.id]}</b>{Object.keys(c.ev).some((k) => EV_LABEL[k]) ? ` · ${Object.entries(c.ev).filter(([k]) => EV_LABEL[k]).map(([k, v]) => evText(k, v)).join(" · ")}` : ""}</span></div>
          ))}
        </Section>
      )}

      {report.patterns.length > 0 && (
        <Section header={m("balanceView.patterns.header")} footer={m("balanceView.patterns.footer")}>
          {report.patterns.map((p) => <div key={p.id} className="insight"><span className="insight-dot" /><span className="insight-body"><span>{p.text}</span><span className="conf-tag">{patternConf(p.conf)}</span></span></div>)}
        </Section>
      )}

      <div className="section-header">{m("balanceView.props.header")}</div>
      {!props.length && <div className="card brain-line">{m("balanceView.props.empty")}</div>}
      {props.map((it) => <ProposalCard key={it.cand.id} item={it} b={b} full />)}
    </>
  );
}
