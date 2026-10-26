"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmSheet, NavBar, Section, Segmented, Sheet, Switch, toast } from "@/components/ui";
import { fmt, langArr, msgs, withLang } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as B from "@/i18n/msg/app-settings-brain";
import * as Common from "@/i18n/msg/common";
import { AREA_LABEL, RULE_COPY } from "@/lib/brain/copy";
import { buildAiContext, ctxBytes } from "@/lib/brain/context";
import { brainHeadline, brainReport } from "@/lib/brain/report";
import { AREAS, type AreaKey, type RuleId } from "@/lib/brain/types";
import { logicalDate } from "@/lib/date";
import { insightsHref } from "@/lib/intent";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const m = msgs(B), c = msgs(Common);
type Flag = "brainCard" | "brainAi" | "brainAutoAi" | "notifyReview" | "notifyLastMatch" | "aiSendIdentity";
const SWITCHES: [Flag, string, string?][] = langArr(() => [
  ["brainCard", m("brain.sw.brainCard.title"), m("brain.sw.brainCard.sub")],
  ["brainAi", m("brain.sw.brainAi.title"), m("brain.sw.brainAi.sub")],
  ["brainAutoAi", m("brain.sw.brainAutoAi.title"), m("brain.sw.brainAutoAi.sub")],
  ["notifyReview", m("brain.sw.notifyReview.title"), m("brain.sw.notifyReview.sub")],
  ["notifyLastMatch", m("brain.sw.notifyLastMatch.title"), m("brain.sw.notifyLastMatch.sub")],
  ["aiSendIdentity", m("brain.sw.aiSendIdentity.title")],
]);
const DOW: [number, string][] = langArr(() => [[-1, m("brain.dow.firstRest")], ...[0, 1, 2, 3, 4, 5, 6].map((d): [number, string] => [d, fmt.dowShort(d)])]);
const PRIORITY: ["0" | "1" | "2", string][] = langArr(() => [["2", m("brain.prio.focus")], ["1", c("normal")], ["0", m("brain.prio.paused")]]);
const JOB: ["yes" | "no" | "", string][] = langArr(() => [["yes", m("brain.job.yes")], ["no", m("brain.job.no")], ["", m("brain.job.none")]]);

// Muted suggestion label from its sig (`rule:target`): the rule's short copy, plus the area when the target is one.
function mutedLabel(sig: string): string {
  const [rule, target] = sig.split(":");
  const short = RULE_COPY[rule as RuleId]?.short ?? sig;
  return target && target in AREA_LABEL ? `${short} · ${AREA_LABEL[target as AreaKey]}` : short;
}

export default function BrainSettings() {
  const { s, update } = useStore();
  const set = s.settings;
  const today = logicalDate();
  const lang = useLang();
  const [peek, setPeek] = useState(false);
  const [clearing, setClearing] = useState(false);
  const head = useMemo(() => withLang(lang, () => brainHeadline(s, today)), [s, today, lang]);
  // The exact payload the AI route would build from this state (built locally, only while the sheet is open).
  const ctx = useMemo(() => (peek ? withLang(lang, () => buildAiContext(brainReport(s, today, "brief"), s, today, "brief")) : null), [peek, s, today, lang]);
  const muted = Object.keys(s.brain.snooze).filter((k) => s.brain.snooze[k] === "mute");

  const setFlag = (k: Flag, v: boolean) => update((x) => { x.settings[k] = v; });
  const history = s.brain.applied.length + s.brain.decisions.length + s.brain.weeks.length;

  return (
    <main className="screen">
      <NavBar title={m("brain.nav.title")} sub={head ? m("brain.nav.balance", { balance: head.balance, focus: head.label ? m("brain.nav.focus", { label: head.label }) : "" }) : m("brain.nav.sub")} />

      <Section footer={m("brain.switches.footer")}>
        {SWITCHES.map(([k, title, sub]) => (
          <div key={k} className="row">
            <span className="row-main">
              <div className="row-title">{title}</div>
              {sub && <div className="row-sub">{sub}</div>}
            </span>
            <Switch label={title} on={set[k]} onChange={(v) => setFlag(k, v)} />
          </div>
        ))}
      </Section>

      <Section header={m("brain.ready.header")} footer={m("brain.ready.footer")}>
        <div className="row">
          <span className="row-main"><div className="row-title">{m("brain.ready.show")}</div></span>
          <Switch label={m("brain.ready.show")} on={set.ready} onChange={(v) => { play("toggle"); update((x) => { x.settings.ready = v; }); }} />
        </div>
      </Section>

      <Section header={m("brain.review.header")} footer={m("brain.review.footer")}>
        <div className="row chips" style={{ gap: 8, flexWrap: "wrap" }}>
          {DOW.map(([d, l]) => (
            <button key={d} className={`chip ${set.brainReviewDow === d ? "on" : ""}`} aria-pressed={set.brainReviewDow === d}
              onClick={() => { play("tap"); update((x) => { x.settings.brainReviewDow = d; }); }}>{l}</button>
          ))}
        </div>
      </Section>

      <Section header={m("brain.areas.header")} footer={m("brain.areas.footer")}>
        {AREAS.map((a) => (
          <div key={a} className="row mini-seg">
            <span className="row-main row-title">{AREA_LABEL[a]}</span>
            <div className="row-ctrl sm">
              <Segmented label={m("brain.areas.aria", { area: AREA_LABEL[a] })} value={String(set.areaPriority[a]) as "0" | "1" | "2"} options={PRIORITY}
                onChange={(v) => update((x) => { x.settings.areaPriority = { ...x.settings.areaPriority, [a]: Number(v) as 0 | 1 | 2 }; })} />
            </div>
          </div>
        ))}
      </Section>

      <Section header={m("brain.job.header")} footer={m("brain.job.footer")}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <Segmented label={m("brain.job.aria")} value={set.job ?? ""} options={JOB} onChange={(v) => update((x) => { x.settings.job = v === "" ? null : v; })} />
          </div>
        </div>
      </Section>

      <Section header={m("brain.muted.header")} footer={muted.length ? undefined : m("brain.muted.empty")}>
        {muted.map((sig) => (
          <div key={sig} className="row">
            <span className="row-main row-title fs-sub">{mutedLabel(sig)}</span>
            <button className="link" onClick={() => { play("tap"); update((x) => { const n = { ...x.brain.snooze }; delete n[sig]; x.brain.snooze = n; }); toast(m("brain.muted.toast")); }}>{m("brain.muted.unmute")}</button>
          </div>
        ))}
      </Section>

      <Section>
        <Link href={insightsHref("review")} className="row row-link" onClick={() => play("nav")}><span className="row-main row-title link">{m("brain.link.review")}</span></Link>
        <button className="row" onClick={() => { play("open"); setPeek(true); }}><span className="row-main row-title link">{m("brain.link.peek")}</span></button>
      </Section>

      <Section footer={m("brain.clear.footer")}>
        <button className="row" disabled={!history && !muted.length && !s.brain.focus && !s.brain.reviewDone} onClick={() => { play("tap"); setClearing(true); }}>
          <span className="row-main row-title ink-danger">{m("brain.clear.title")}</span>
        </button>
      </Section>

      <Sheet open={peek} title={m("brain.peek.title")} onClose={() => setPeek(false)}>
        <p className="row-sub" style={{ margin: "0 0 10px" }}>
          {m("brain.peek.note", { size: ctx ? ` · ${(ctxBytes(ctx) / 1024).toFixed(1)} KB` : "", off: set.brainAi ? "" : m("brain.peek.off") })}
        </p>
        <pre className="code-block">
          {ctx ? JSON.stringify(ctx, null, 2) : ""}
        </pre>
      </Sheet>
      <ConfirmSheet
        open={clearing}
        title={m("brain.clear.title")}
        body={m("brain.clear.body")}
        confirmLabel={m("brain.clear.confirm")}
        danger
        onClose={() => setClearing(false)}
        onConfirm={() => {
          play("done");
          update((x) => { x.brain = { ...x.brain, applied: [], decisions: [], snooze: {}, weeks: [], reviewDone: "", focus: null, reviewFocus: null }; }, { flush: true });
          toast(m("brain.clear.toast"));
        }}
      />
    </main>
  );
}
