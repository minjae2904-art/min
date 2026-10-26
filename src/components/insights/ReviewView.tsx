"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ArrowDiff } from "@/components/brain/ProposalCard";
import { WeeklyReview } from "@/components/brain/WeeklyReview";
import { IconShare } from "@/components/Icons";
import { ShareSheet } from "@/components/share/ShareSheet";
import { Chev, Section, Tile } from "@/components/ui";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-insights";
import * as Common from "@/i18n/msg/common";
import { describeOps } from "@/lib/brain/actions";
import { RULE_COPY, TIP_TEXT, VERDICT_LABEL, evalCaveat, thaiDate } from "@/lib/brain/copy";
import { weekKey } from "@/lib/brain/review";
import type { DataQuality, RuleId } from "@/lib/brain/types";
import { insightsHref } from "@/lib/intent";
import { play } from "@/lib/sound";
import { BRAIN_MSG, PROVIDER_LABEL, rulesLabel, type BrainApi } from "@/lib/useBrain";

const m = msgs(C), c = msgs(Common);

// How far tick times can be trusted (14 days). Check-in timing is info only.
function QualitySection({ q }: { q: DataQuality }) {
  const pct = (n: number) => (q.ticks ? `${Math.round((n / q.ticks) * 100)}%` : "-");
  const level: Record<NonNullable<DataQuality["level"]>, string> = { good: m("reviewView.level.good"), fair: m("reviewView.level.fair"), low: m("reviewView.level.low") };
  const rows: [string, string][] = [
    [m("reviewView.q.live"), pct(q.live + q.confirmed)],
    [m("reviewView.q.batch"), pct(q.batch)],
    [m("reviewView.q.late"), pct(q.late)],
    [m("reviewView.q.checkin"), q.checkins ? m("reviewView.q.checkinVal", { on: q.checkinOnTime, n: q.checkins }) : m("reviewView.q.noCheckin")],
  ];
  return (
    <Section header={m("reviewView.q.header")} footer={m("reviewView.q.footer")}>
      <div className="row">
        <span className="row-main"><span className="row-title">{m("reviewView.q.trust")}</span><span className="row-sub">{m("reviewView.q.count", { n: q.ticks })}</span></span>
        <span className={`badge ${q.level === "good" ? "ok" : q.level === "low" ? "warn" : ""}`}>{q.level ? level[q.level] : m("reviewView.q.few")}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="row"><span className="row-main row-title">{k}</span><span className="row-value num t-clip">{v}</span></div>
      ))}
    </Section>
  );
}

// Insights > รีวิว (was the lower half of /balance): weekly review, AI summary, data quality, tried proposals.
export function ReviewView({ b }: { b: BrainApi }) {
  const { s, report, brief, today } = b;
  const [review, setReview] = useState(false);
  const [share, setShare] = useState(false);
  const reviewed = s.brain.reviewDone === weekKey(s, today);

  return (
    <>
      <Section header={m("reviewView.review.header")}>
        <button className="row" onClick={() => { play("open"); setReview(true); }}>
          <span className="row-main"><div className="row-title">{m("reviewView.review.start")}</div><div className="row-sub">{reviewed ? m("reviewView.review.done") : m("reviewView.review.steps")}</div></span>
          <Chev />
        </button>
        <button className="row has-tile" onClick={() => { play("open"); setShare(true); }}>
          <Tile color="var(--accent)"><IconShare size={18} /></Tile>
          <span className="row-main"><div className="row-title">{m("reviewView.share.title")}</div><div className="row-sub">{m("reviewView.share.sub")}</div></span>
          <Chev />
        </button>
      </Section>

      <Section header={m("reviewView.ai.header")} footer={m("reviewView.ai.footer")}>
        <div style={{ padding: 16 }}>
          {brief.src === "ai" ? (
            <>
              <div className="prop-title">{brief.headline} <span className="badge">{PROVIDER_LABEL[brief.provider ?? ""] ?? "AI"}</span></div>
              {brief.tips.map((t) => <div key={t.tip} className="prop-note">{TIP_TEXT[t.tip]}{t.why ? ` · AI: ${t.why}` : ""}</div>)}
              {brief.question && <div className="prop-if">{brief.question}</div>}
            </>
          ) : <div className="row-sub" style={{ marginBottom: 12 }}>{m("reviewView.ai.rules", { rules: rulesLabel() })}</div>}
          {b.aiBusy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "90%" }} /><span className="skel" style={{ width: "72%" }} /></div>}
          {b.aiState === "ok" ? (
            <button className="btn" style={{ marginTop: 12 }} disabled={b.aiBusy} onClick={() => { play("tap"); void b.requestAi("brief"); }}>
              {b.aiBusy ? m("reviewView.ai.busy") : m("reviewView.ai.ask", { left: b.remaining !== null ? m("reviewView.ai.left", { n: b.remaining }) : "" })}
            </button>
          ) : <div className="row-sub" style={{ marginTop: 12 }}>{BRAIN_MSG[b.aiState]}</div>}
          {b.aiMsg && <div className="row-sub" style={{ marginTop: 8 }}>{b.aiMsg}</div>}
        </div>
      </Section>

      <QualitySection q={report.quality} />

      <Section header={m("reviewView.tried.header")} footer={s.brain.applied.length ? evalCaveat() : undefined}>
        {!s.brain.applied.length && (
          <EmptyState title={m("reviewView.tried.empty")} action={{ label: m("reviewView.tried.see"), onClick: () => {
            // Same tab switch as InsightsView's segmented control (replaceState keeps useSearchParams in sync).
            play("tap"); window.history.replaceState(null, "", insightsHref("balance")); window.scrollTo({ top: 0 });
          } }} />
        )}
        {s.brain.applied.map((r) => {
          const e = b.evals.find((x) => x.id === r.id);
          const chip = r.undoneAt ? m("reviewView.tried.undone") : e?.status === "waiting" ? VERDICT_LABEL.waiting : e?.verdict ? VERDICT_LABEL[e.verdict] : null;
          return (
            <div key={r.id} className="row">
              <span className="row-main">
                <div className="row-title fs-sub">{RULE_COPY[r.rule as RuleId]?.short ?? r.rule}</div>
                <div className="row-sub">{thaiDate(r.date)}{r.ops.length ? <> · <ArrowDiff d={describeOps(s, r.ops)[0]} /></> : null}</div>
              </span>
              {chip && <span className={`badge ${e?.verdict === "better" && !r.undoneAt ? "ok" : e?.verdict === "worse" && !r.undoneAt ? "warn" : ""}`}>{chip}</span>}
              {!r.undoneAt && r.ops.length > 0 && <button className="link fs-sub" onClick={() => { play("undo"); b.undo(r.id); }}>{c("undo")}</button>}
            </div>
          );
        })}
      </Section>

      <WeeklyReview open={review} onClose={() => setReview(false)} />
      <ShareSheet open={share} today={today} onClose={() => setShare(false)} />
    </>
  );
}
