"use client";

import { useMemo } from "react";
import { BalanceDials } from "@/components/brain/BalanceDials";
import { Ring } from "@/components/brain/BrainCard";
import { ProposalCard } from "@/components/brain/ProposalCard";
import { Section } from "@/components/ui";
import { AREA_LABEL, CONFLICT_LABEL, EV_LABEL, LOW_DATA_HEADLINE, evText } from "@/lib/brain/copy";
import { composeBrief } from "@/lib/brain/report";
import type { AreaKey } from "@/lib/brain/types";
import type { BrainApi } from "@/lib/useBrain";

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${26 - ((v - min) / (max - min || 1)) * 24}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-label="สมดุลรายสัปดาห์"><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

// Insights > สมดุล (was the top of /balance): score, dials, conflicts, patterns, top proposals.
export function BalanceView({ b }: { b: BrainApi }) {
  const { s, report, brief, today } = b;
  const bal = report.balance;
  const score = (k: AreaKey | null) => report.areas.find((a) => a.key === k)?.score ?? "-";
  // Top 5: the brief's picks (AI or rules) first, then the next candidates that are not hidden.
  const props = useMemo(() => {
    const more = composeBrief(report, null, "weekly", s.brain, today).items;
    return [...brief.items, ...more.filter((m) => !brief.items.some((x) => x.cand.id === m.cand.id))].slice(0, 5);
  }, [report, s.brain, today, brief.items]);
  const weeks = s.brain.weeks.map((w) => Number(w[1])).filter((v) => v >= 0);
  const load = report.load.length ? Math.round(report.load.reduce((a, x) => a + x, 0) / report.load.length) : null;
  const workBusy = report.plan.some((p) => p.work && p.load > 0.9);

  return (
    <>
      {bal.b === null && <div className="subtitle">{LOW_DATA_HEADLINE}</div>}

      <div className="card balance-head">
        <Ring value={bal.b} size={64} />
        <div className="row-main">
          <div className="balance-num">สมดุล <b className="num">{bal.b ?? "-"}</b>/100</div>
          {bal.best && bal.weakest && bal.best !== bal.weakest && <div className="row-sub">เอียง: {AREA_LABEL[bal.best]} {score(bal.best)} · {AREA_LABEL[bal.weakest]} {score(bal.weakest)}</div>}
          {load !== null && <div className="row-sub">แผนสัปดาห์นี้แน่น {load}%{workBusy ? " · วันกะแน่นเป็นปกติ" : ""}</div>}
        </div>
        <Spark values={bal.b === null ? weeks : [...weeks, bal.b]} />
      </div>

      <BalanceDials b={b} />

      {report.conflicts.length > 0 && (
        <Section header="จุดที่ชนกัน">
          {report.conflicts.map((c) => (
            <div key={c.id} className="insight"><span className={`insight-dot ${c.sev === 3 ? "is-high" : ""}`} />
              <span><b>{CONFLICT_LABEL[c.id]}</b>{Object.keys(c.ev).some((k) => EV_LABEL[k]) ? ` · ${Object.entries(c.ev).filter(([k]) => EV_LABEL[k]).map(([k, v]) => evText(k, v)).join(" · ")}` : ""}</span></div>
          ))}
        </Section>
      )}

      {report.patterns.length > 0 && (
        <Section header="รูปแบบที่เห็น" footer="ดูจากข้อมูลของคุณเอง เป็นความสัมพันธ์ ไม่ได้บอกว่าอะไรเป็นสาเหตุ">
          {report.patterns.map((p) => <div key={p.id} className="insight"><span className="insight-dot" /><span>{p.text}</span></div>)}
        </Section>
      )}

      <div className="section-header">ข้อเสนอ</div>
      {!props.length && <div className="card brain-line">ตอนนี้ยังไม่มีข้อเสนอ ทำต่อแบบเดิมได้เลย</div>}
      {props.map((it) => <ProposalCard key={it.cand.id} item={it} b={b} full />)}
    </>
  );
}
