"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiCoach } from "@/components/AiCoach";
import { BarChart, BarRow, Band, ChartEmpty, Heatmap } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { CountUp, Section, Segmented, Sheet, toast } from "@/components/ui";
import { fmt, getLang, msgs } from "@/i18n";
import { rich } from "@/i18n/react";
import * as C from "@/i18n/msg/components-insights";
import * as Common from "@/i18n/msg/common";
import { BAND_AREA, BAND_LABEL, bandRows, bandText } from "@/lib/bands";
import { heatLevel } from "@/lib/chart";
import { THAI_DATE, addDays, hm, logicalDate } from "@/lib/date";
import { CONF_TEXT, NEED, deltaOk, honestInsights, needText, obsNote, round5, weightHint } from "@/lib/honest";
import { intentHref } from "@/lib/intent";
import { hasCheckin, type TradeResult } from "@/lib/model";
import { GYM_LABEL, PERSONALITY_LABEL } from "@/lib/rotation";
import { MEAL2_LABEL, resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { badgeCatalog } from "@/lib/psych";
import { dayItems, dayScore, rangeStats, streak, toCsv } from "@/lib/stats";
import { useStore } from "@/lib/store";

const m = msgs(C), c = msgs(Common);
const pct = (v: number) => Math.round(v * 100);
const tradeResult = (r: TradeResult) => m(`statsView.result.${r}`);
const clock = (ts: number) => fmt.clock(ts);

// Change versus the previous period of the same length; shown only when both periods have enough logged days (deltaOk).
function Delta({ cur, prev, show, unit }: { cur: number; prev: number; show: boolean; unit: string }) {
  if (!show) return null;
  const d = cur - prev;
  const ink = Math.abs(d) < 0.05 ? "ink-2" : d > 0 ? "ink-success" : "ink-danger";
  return <div className={`stat-hint ${ink}`}>{m("statsView.delta", { sign: d >= 0 ? "+" : "-", v: Math.abs(d).toFixed(unit === "%" ? 0 : 1), unit })}</div>;
}

// Insights > สถิติ (was /stats). The page title and segmented tabs live in InsightsView.
export function StatsView() {
  const { s } = useStore();
  const router = useRouter();
  const goToday = { label: m("statsView.goToday"), onClick: () => { play("nav"); router.push("/"); } };
  const [n, setN] = useState("7");
  const [pick, setPick] = useState<string | null>(null); // heatmap day opened in the sheet
  const [ranged, setRanged] = useState(false); // range changed on this visit: charts regrow
  const today = logicalDate();
  const r = rangeStats(s, today, Number(n));
  const prev = rangeStats(s, addDays(today, -Number(n)), Number(n));
  const tips = honestInsights(r, s);
  const ok = deltaOk(r.loggedDays, prev.loggedDays, r.n);
  const bands = bandRows(s, today); // per render (the React Compiler is not enabled); 28 days x 6 keys from one itemsFor pass
  const st = streak(s, today);
  const maxRot = Math.max(1, ...Object.values(r.rotation));
  const maxPer = Math.max(1, ...Object.values(r.persona));
  const meal2Total = r.meal2.A + r.meal2.B + r.meal2.C;
  const badges = badgeCatalog(s, today);
  const waterGoalAvg = r.series.reduce((a, x) => a + x.goal, 0) / r.series.length;

  // Heatmap: always 13 weeks ending today, aligned so rows are weekdays.
  const heat = rangeStats(s, today, 91).series.map((x) => ({
    date: x.date, today: x.date === today, level: heatLevel(x.score, x.logged, s.settings.goodDay),
    label: `${THAI_DATE(x.date)} ${x.logged ? `${pct(x.score)}%` : m("statsView.heat.none")}`,
  }));
  const axis: [string, string] = [r.dates[0].slice(5), c("today")];
  const picked = pick ? s.days[pick] : undefined;
  const pickedItems = picked && pick ? dayItems(s, picked, pick) : [];

  function exportCsv() {
    play("done");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(r)], { type: "text/csv" }));
    a.download = `krob-${n}d-${today}.csv`;
    a.click();
    toast(m("statsView.toast.csv"));
  }

  return (
    <>
      <div className="subtitle">{m("statsView.subtitle", { logged: r.loggedDays, n: r.n })}</div>

      <Segmented label={m("statsView.range.aria")} value={n} options={[["7", m("statsView.range.7")], ["30", m("statsView.range.30")], ["90", m("statsView.range.90")]]} onChange={(v) => { setN(v); setRanged(true); }} />

      {r.loggedDays < NEED.early && <Section><EmptyState art="streaming" title={needText(NEED.early - r.loggedDays)} action={goToday} /></Section>}

      <AiCoach />

      <div className="grid2">
        <div className="stat">
          <div className="stat-label">{m("statsView.avg.label")}</div>
          <div className="stat-value"><CountUp value={pct(r.avgScore)} /><small>%</small></div>
          <div className="stat-hint">{m("statsView.avg.hint", { n: r.goodDays, pct: pct(s.settings.goodDay) })}</div>
          <Delta cur={pct(r.avgScore)} prev={pct(prev.avgScore)} show={ok} unit="%" />
        </div>
        <div className="stat">
          <div className="stat-label">{m("statsView.onTime.label")}</div>
          <div className="stat-value">{r.onTimeRate === null || r.timedN < NEED.timed ? "-" : <><CountUp value={round5(r.onTimeRate * 100)} /><small>%</small></>}</div>
          <div className="stat-hint">{r.timedN < NEED.timed ? m("statsView.onTime.need", { n: NEED.timed - r.timedN }) : m("statsView.onTime.hint")}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{m("statsView.water.label")}</div>
          <div className="stat-value"><CountUp value={r.waterAvg / 1000} decimals={1} /><small> {m("statsView.unit.liter")}</small></div>
          <div className="stat-hint">{m("statsView.water.hint", { met: r.waterMetDays, n: r.loggedDays })}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{m("statsView.gym.label")}</div>
          <div className="stat-value"><CountUp value={r.perWeek} decimals={1} /><small> {m("statsView.unit.sessions")}</small></div>
          <div className="stat-hint">{m("statsView.gym.hint", { n: r.sessions, tennis: r.tennis })}</div>
          <Delta cur={r.perWeek} prev={prev.perWeek} show={ok} unit={m("statsView.delta.sessions")} />
        </div>
        <div className="stat">
          <div className="stat-label">{m("statsView.weight.label")}</div>
          <div className="stat-value">{r.weight && r.weight.weighIns >= 2 ? <>{r.weight.change >= 0 ? "+" : ""}<CountUp value={r.weight.change} decimals={1} /><small> kg</small></> : "-"}</div>
          <div className="stat-hint">{weightHint(r.weight, r.n)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{m("statsView.sleep.label")}</div>
          <div className="stat-value">{r.sleepAvg === null || r.sleepNights < 3 ? "-" : <><CountUp value={Math.round(r.sleepAvg * 2) / 2} decimals={1} /><small> {m("statsView.unit.hours")}</small></>}</div>
          <div className="stat-hint">{!r.sleepNights ? m("statsView.sleep.none") : r.sleepNights < 3 ? m("statsView.sleep.more", { n: 3 - r.sleepNights }) : m("statsView.sleep.from", { n: r.sleepNights })}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{m("statsView.persona.label")}</div>
          <div className="stat-value"><CountUp value={Object.values(r.persona).reduce((a, b) => a + b, 0)} /><small> {m("statsView.unit.times")}</small></div>
          <div className="stat-hint">{m("statsView.persona.hint", { n: r.n })}</div>
        </div>
      </div>

      {r.sleepNights === 0 && <Section><EmptyState art="sleeping" title={m("statsView.sleep.empty")} action={goToday} /></Section>}

      {r.feel.n > 0 && (
        <Section header={m("statsView.feel.header", { n: r.feel.n, few: r.feel.n < NEED.early ? m("statsView.feel.few") : "" })}>
          <div style={{ padding: "8px 16px" }}>
            <BarRow label={m("statsView.feel.sleep")} value={r.feel.sleep ?? 0} max={5} text={(r.feel.sleep ?? 0).toFixed(1)} area="sleep" />
            <BarRow label={m("statsView.feel.energy")} value={r.feel.energy ?? 0} max={5} text={(r.feel.energy ?? 0).toFixed(1)} area="recovery" />
            <BarRow label={m("statsView.feel.mood")} value={r.feel.mood ?? 0} max={5} text={(r.feel.mood ?? 0).toFixed(1)} area="nutrition" />
          </div>
        </Section>
      )}

      {bands.length > 0 && (
        <Section header={m("statsView.bands.header")} footer={m("statsView.bands.footer", { n: st.days })}>
          {bands.map(({ key, b7, b28 }) => (
            <div key={key} className="row band-row">
              <span className="row-main">
                <div className="row-title fs-callout">{BAND_LABEL[key]}</div>
                <div className="row-sub num">{m("statsView.bands.d28", { v: bandText(b28) })}</div>
              </span>
              <Band cells={b7.cells} area={BAND_AREA[key]} label={m("statsView.bands.aria7", { label: BAND_LABEL[key] })} size="md" />
              <span className="row-value num">{bandText(b7)}</span>
            </div>
          ))}
        </Section>
      )}

      <Section header={m("statsView.analysis.header")} footer={obsNote()}>
        {tips.map((t) => (
          <div key={t.text} className="insight">
            <span className="insight-dot" />
            <span className="insight-body">
              <span>{t.text}</span>
              <span className={`conf-tag conf-${t.conf}`}>{CONF_TEXT[t.conf]}</span>
              {t.tip && <span className="insight-tip">{t.tip}</span>}
            </span>
          </div>
        ))}
      </Section>

      <Section header={m("statsView.daily.header")} footer={m("statsView.daily.footer", { pct: pct(s.settings.goodDay) })}>
        <div style={{ padding: 16 }}>
          {r.loggedDays === 0 ? <ChartEmpty kind="bars" text={m("statsView.empty.range")} /> : (
            <BarChart key={n} regrow={ranged} values={r.series.map((x) => (x.logged ? x.score : null))} goal={s.settings.goodDay} max={1} goodAt={s.settings.goodDay}
              area="consistency" label={m("statsView.daily.label")} decimals={2} axis={axis} />
          )}
        </div>
      </Section>

      <Section header={m("statsView.water.header")} footer={m("statsView.water.footer")}>
        <div style={{ padding: 16 }}>
          {r.loggedDays === 0 ? <ChartEmpty kind="bars" text={m("statsView.empty.range")} /> : (
            <BarChart
              key={n}
              regrow={ranged}
              values={r.series.map((x) => (x.logged ? x.water : null))}
              goal={waterGoalAvg}
              max={Math.max(4000, ...r.series.map((x) => x.water))}
              goodAt={(i) => r.series[i].goal}
              area="water" label={m("statsView.water.header")} unit={m("statsView.water.unit")} axis={axis}
            />
          )}
        </div>
      </Section>

      <Section header={m("statsView.heat.header")} footer={m("statsView.heat.footer")}>
        <div style={{ padding: 16 }}>
          <Heatmap days={heat} onPick={(d) => { play("tap"); setPick(d); }} />
        </div>
      </Section>

      <Section header={m("statsView.weekday.header")}>
        <div style={{ padding: "8px 16px" }}>
          {r.weekday.map((v, i) => {
            const few = v === null || r.weekdayN[i] < NEED.weekday;
            return <BarRow key={i} label={fmt.dowShort(i)} value={few ? 0 : v} max={1} text={few ? "-" : `${round5(v * 100)}%`} tone={!few && v >= s.settings.goodDay ? "var(--success)" : undefined} />;
          })}
        </div>
      </Section>

      <Section header={m("statsView.items.header")} footer={m("statsView.items.footer")}>
        {r.items.length === 0 && <EmptyState title={m("statsView.items.empty")} action={goToday} />}
        {r.items.map((i) => (
          <div key={i.id} className="row">
            <span className="row-main">
              <div className="row-title fs-callout">{i.title}</div>
              <div className="row-sub">{i.avgDelay === null ? m("statsView.items.noTime") : i.avgDelay <= 0 ? m("statsView.items.early", { n: -i.avgDelay }) : m("statsView.items.late", { n: i.avgDelay })}</div>
            </span>
            <span className={`row-value num ${i.done / i.planned < 0.6 ? "ink-warn" : ""}`}>{i.done}/{i.planned}</span>
          </div>
        ))}
      </Section>

      <Section header={m("statsView.rot.header")}>
        <div style={{ padding: "8px 16px" }}>
          {Object.entries(r.rotation).map(([k, v]) => <BarRow key={k} label={`${k} ${GYM_LABEL[k].split(" ")[0]}`} value={v} max={maxRot} text={`${v}`} />)}
          {r.gym.logged > 0 && <div className="row-sub" style={{ paddingTop: 6 }}>{rich(m("statsView.gym.logged"), { num: <span className="num">{r.gym.logged}</span>, vol: <span className="num">{fmt.num(r.gym.vol)}</span> })}</div>}
        </div>
      </Section>

      {r.live.days > 0 && (
        <Section header={m("statsView.live.header")} footer={m("statsView.live.footer")}>
          <div className="row"><span className="row-main row-title">{m("statsView.live.days")}</span><span className="row-value num t-clip">{m("statsView.val.days", { n: r.live.days })}</span></div>
          <div className="row"><span className="row-main row-title">{m("statsView.live.hours")}</span><span className="row-value num t-clip">{m("statsView.val.hours", { a: (r.live.min / 60).toFixed(1), b: (r.live.planMin / 60).toFixed(1) })}</span></div>
          <div className="row"><span className="row-main row-title">{m("statsView.live.onTime")}</span><span className="row-value num">{r.live.onTime}/{r.live.days}</span></div>
          <div className="row"><span className="row-main row-title">{m("statsView.live.breaks")}</span><span className="row-value num t-clip">{m("statsView.val.times", { n: (r.live.br / r.live.days).toFixed(1) })}</span></div>
          <div className="row"><span className="row-main row-title">{m("statsView.live.seen")}</span><span className="row-value num">{r.live.seen ? `${pct(r.live.ok / r.live.seen)}%` : "-"}</span></div>
        </Section>
      )}

      {s.care.level !== null && (
        <Section header={m("statsView.care.header")} footer={m("statsView.care.footer")}>
          <div className="row"><span className="row-main row-title">{m("statsView.care.routine")}</span><span className="row-value num">{r.care.done}/{r.care.planned}</span></div>
          <div className="row"><span className="row-main row-title">{m("statsView.care.spf")}</span><span className="row-value num t-clip">{m("statsView.val.ofDays", { a: r.care.spf, n: r.loggedDays })}</span></div>
          {s.care.track.veg && <div className="row"><span className="row-main row-title">{m("statsView.care.veg")}</span><span className="row-value num t-clip">{r.care.veg === null ? "-" : m("statsView.care.vegVal", { v: r.care.veg.toFixed(1) })}</span></div>}
          {s.care.track.caf && <div className="row"><span className="row-main row-title">{m("statsView.care.caf")}</span><span className="row-value num t-clip">{r.care.caf === null ? "-" : m("statsView.care.cafVal", { n: Math.round(r.care.caf) })}{r.care.cafLateDays ? m("statsView.care.cafLate", { n: r.care.cafLateDays }) : ""}</span></div>}
          {r.care.moveMin > 0 && <div className="row"><span className="row-main row-title">{m("statsView.care.move")}</span><span className="row-value num t-clip">{m("statsView.val.min", { n: r.care.moveMin })}</span></div>}
          <div className="row"><span className="row-main row-title">{m("statsView.care.water")}</span><span className="row-value num t-clip">{m("statsView.val.liters", { n: (r.waterAvg / 1000).toFixed(1) })}</span></div>
        </Section>
      )}

      <Section header={m("statsView.persona.header")}>
        <div style={{ padding: "8px 16px" }}>
          {Object.entries(r.persona).map(([k, v]) => <BarRow key={k} label={getLang() === "th" ? PERSONALITY_LABEL[k].split(" ")[0] : PERSONALITY_LABEL[k].split(/ \/ | \+ /)[0]} value={v} max={maxPer} text={`${v}`} area="voice" />)}
        </div>
      </Section>

      <Section header={m("statsView.trade.header")} footer={m("statsView.trade.footer")}>
        {r.trade.days === 0 ? <EmptyState title={m("statsView.trade.empty")} action={{ label: m("statsView.trade.log"), onClick: () => { play("nav"); router.push(intentHref("trade")); } }} /> : <>
        <div className="row"><span className="row-main row-title">{m("statsView.trade.days")}</span><span className="row-value num">{r.trade.days}/{r.loggedDays}</span></div>
        <div className="row"><span className="row-main row-title">{m("statsView.trade.count")}</span><span className="row-value num">{r.trade.count}</span></div>
        <div className="row"><span className="row-main row-title">{m("statsView.trade.wlb")}</span><span className="row-value num">{r.trade.win} / {r.trade.loss} / {r.trade.be}</span></div>
        <div className="row"><span className="row-main row-title">{m("statsView.trade.winRate")}</span><span className="row-value num">{r.trade.winRate === null ? "-" : `${pct(r.trade.winRate)}%`}</span></div>
        <div className="row"><span className="row-main row-title">{m("statsView.result.skip")}</span><span className="row-value num t-clip">{m("statsView.val.days", { n: r.trade.skip })}</span></div>
        {r.trade.gated > 0 && <div className="row"><span className="row-main row-title">{m("statsView.trade.gated")}</span><span className="row-value num t-clip">{m("statsView.val.ofDays", { a: r.trade.gated, n: r.trade.days - r.trade.skip })}</span></div>}
        </>}
      </Section>

      {meal2Total > 0 && (
        <Section header={m("statsView.meal2.header")}>
          <div style={{ padding: "8px 16px" }}>
            {(["A", "B", "C"] as const).map((k) => <BarRow key={k} label={k} value={r.meal2[k]} max={meal2Total} text={`${r.meal2[k]}`} area="nutrition" />)}
            <div className="row-sub" style={{ paddingTop: 6 }}>A {MEAL2_LABEL.A} · B {MEAL2_LABEL.B} · C {MEAL2_LABEL.C}</div>
          </div>
        </Section>
      )}

      <Section header={m("statsView.badges.header", { got: badges.filter((b) => b.earned).length, n: badges.length })}>
        <div className="badges">
          {badges.map((b, k) => (
            <div key={b.id} className={`badge-card ${b.earned ? "earned" : ""}`} title={b.desc} style={{ ["--bi" as string]: k }}>
              <Image src={`/art/badge-${b.art}-256.webp`} className="badge-art" width={56} height={56} loading="lazy" alt="" unoptimized />
              <div className="badge-title">{b.title}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section footer={m("statsView.csv.footer")}>
        <button className="row" onClick={exportCsv}><span className="row-main row-title link">{m("statsView.csv.export", { n: r.n })}</span></button>
      </Section>

      <Sheet open={pick !== null} title={pick ? THAI_DATE(pick) : ""} onClose={() => setPick(null)}>
        {pick && !picked && <div className="empty-note">{pick === today ? m("statsView.pick.todayNone") : m("statsView.pick.none")}</div>}
        {pick && picked && (
          <>
            <Section header={m("statsView.pick.header", { name: resolveTemplate(s.schedule, picked.type).def.name, pct: pct(dayScore(s, picked)) })}>
              {pickedItems.map((it) => {
                const ts = picked.done[it.id];
                return (
                  <div key={it.id} className={`row has-time ${ts ? "done" : ""}`}>
                    <span className="row-time">{hm(it.min)}</span>
                    <span className={`row-main row-title fs-callout ${ts ? "" : "ink-2"}`}>{it.title}</span>
                    <span className={`row-value num fs-sub ${ts ? "ink-success" : ""}`}>{ts ? (ts > 1e12 ? clock(ts) : c("done")) : "-"}</span>
                  </div>
                );
              })}
            </Section>
            <Section>
              <div className="row"><span className="row-main row-title">{m("statsView.pick.water")}</span><span className="row-value">{m("statsView.val.liters", { n: (picked.waterMl / 1000).toFixed(2) })}</span></div>
              <div className="row"><span className="row-main row-title">{m("statsView.pick.checkin")}</span><span className="row-value fs-sub">{hasCheckin(picked) ? m("statsView.pick.checkinVal", { sleep: picked.checkin.sleep, energy: picked.checkin.energy, mood: picked.checkin.mood }) : "-"}</span></div>
              <div className="row"><span className="row-main row-title">{m("statsView.trade.header")}</span><span className="row-value fs-sub">{picked.trade ? (picked.trade.result === "skip" ? tradeResult("skip") : m("statsView.pick.tradeVal", { n: picked.trade.count, result: tradeResult(picked.trade.result) })) : "-"}</span></div>
              {picked.wakeAt && <div className="row"><span className="row-main row-title">{m("statsView.pick.wake")}</span><span className="row-value num">{clock(picked.wakeAt)}{picked.sleepAt ? ` / ${clock(picked.sleepAt)}` : ""}</span></div>}
            </Section>
          </>
        )}
      </Sheet>
    </>
  );
}
