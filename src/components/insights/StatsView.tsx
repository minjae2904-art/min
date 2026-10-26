"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiCoach } from "@/components/AiCoach";
import { BarChart, BarRow, Band, ChartEmpty, Heatmap } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { CountUp, Section, Segmented, Sheet, toast } from "@/components/ui";
import { BAND_AREA, BAND_LABEL, bandRows, bandText } from "@/lib/bands";
import { heatLevel } from "@/lib/chart";
import { THAI_DATE, addDays, hm, logicalDate } from "@/lib/date";
import { CONF_TEXT, NEED, OBS_NOTE, deltaOk, honestInsights, needText, round5, weightHint } from "@/lib/honest";
import { intentHref } from "@/lib/intent";
import { hasCheckin } from "@/lib/model";
import { GYM_LABEL, PERSONALITY_LABEL } from "@/lib/rotation";
import { MEAL2_LABEL, resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { badgeCatalog } from "@/lib/psych";
import { dayItems, dayScore, rangeStats, streak, toCsv } from "@/lib/stats";
import { useStore } from "@/lib/store";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pct = (v: number) => Math.round(v * 100);
const TRADE_RESULT: Record<string, string> = { win: "กำไร", loss: "ขาดทุน", be: "เสมอ", open: "ยังถืออยู่", skip: "ไม่มีจังหวะ ไม่เข้า" };
const clock = (ts: number) => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

// Change versus the previous period of the same length; shown only when both periods have enough logged days (deltaOk).
function Delta({ cur, prev, show, unit }: { cur: number; prev: number; show: boolean; unit: string }) {
  if (!show) return null;
  const d = cur - prev;
  const ink = Math.abs(d) < 0.05 ? "ink-2" : d > 0 ? "ink-success" : "ink-danger";
  return <div className={`stat-hint ${ink}`}>{d >= 0 ? "+" : "-"}{Math.abs(d).toFixed(unit === "%" ? 0 : 1)}{unit} จากช่วงก่อน</div>;
}

// Insights > สถิติ (was /stats). The page title and segmented tabs live in InsightsView.
export function StatsView() {
  const { s } = useStore();
  const router = useRouter();
  const goToday = { label: "ไปหน้าวันนี้", onClick: () => { play("nav"); router.push("/"); } };
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
    label: `${THAI_DATE(x.date)} ${x.logged ? `${pct(x.score)}%` : "ไม่มีบันทึก"}`,
  }));
  const axis: [string, string] = [r.dates[0].slice(5), "วันนี้"];
  const picked = pick ? s.days[pick] : undefined;
  const pickedItems = picked && pick ? dayItems(s, picked, pick) : [];

  function exportCsv() {
    play("done");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(r)], { type: "text/csv" }));
    a.download = `krob-${n}d-${today}.csv`;
    a.click();
    toast("ดาวน์โหลด CSV แล้ว");
  }

  return (
    <>
      <div className="subtitle">บันทึกแล้ว {r.loggedDays} จาก {r.n} วัน</div>

      <Segmented label="ช่วงเวลา" value={n} options={[["7", "7 วัน"], ["30", "30 วัน"], ["90", "90 วัน"]]} onChange={(v) => { setN(v); setRanged(true); }} />

      {r.loggedDays < NEED.early && <Section><EmptyState art="streaming" title={needText(NEED.early - r.loggedDays)} action={goToday} /></Section>}

      <AiCoach />

      <div className="grid2">
        <div className="stat">
          <div className="stat-label">ความครบเฉลี่ย</div>
          <div className="stat-value"><CountUp value={pct(r.avgScore)} /><small>%</small></div>
          <div className="stat-hint">วันที่ดี {r.goodDays} วัน (ตั้งแต่ {pct(s.settings.goodDay)}%)</div>
          <Delta cur={pct(r.avgScore)} prev={pct(prev.avgScore)} show={ok} unit="%" />
        </div>
        <div className="stat">
          <div className="stat-label">ทำตรงเวลา</div>
          <div className="stat-value">{r.onTimeRate === null || r.timedN < NEED.timed ? "-" : <><CountUp value={round5(r.onTimeRate * 100)} /><small>%</small></>}</div>
          <div className="stat-hint">{r.timedN < NEED.timed ? `ต้องมีเวลาติ๊กอีก ${NEED.timed - r.timedN} ครั้ง` : "ภายใน 30 นาทีจากเวลาที่ตั้ง"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">น้ำเฉลี่ย/วัน</div>
          <div className="stat-value"><CountUp value={r.waterAvg / 1000} decimals={1} /><small> ลิตร</small></div>
          <div className="stat-hint">ถึงเป้า {r.waterMetDays}/{r.loggedDays} วัน</div>
        </div>
        <div className="stat">
          <div className="stat-label">ยิม/สัปดาห์</div>
          <div className="stat-value"><CountUp value={r.perWeek} decimals={1} /><small> ครั้ง</small></div>
          <div className="stat-hint">รวม {r.sessions} ครั้ง · เทนนิส {r.tennis}</div>
          <Delta cur={r.perWeek} prev={prev.perWeek} show={ok} unit=" ครั้ง" />
        </div>
        <div className="stat">
          <div className="stat-label">น้ำหนัก (แนวโน้ม)</div>
          <div className="stat-value">{r.weight && r.weight.weighIns >= 2 ? <>{r.weight.change >= 0 ? "+" : ""}<CountUp value={r.weight.change} decimals={1} /><small> kg</small></> : "-"}</div>
          <div className="stat-hint">{weightHint(r.weight, r.n)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">นอนเฉลี่ย</div>
          <div className="stat-value">{r.sleepAvg === null || r.sleepNights < 3 ? "-" : <><CountUp value={Math.round(r.sleepAvg * 2) / 2} decimals={1} /><small> ชม.</small></>}</div>
          <div className="stat-hint">{!r.sleepNights ? "กดปุ่มตื่น/เข้านอนเพื่อเก็บข้อมูล" : r.sleepNights < 3 ? `บันทึกอีก ${3 - r.sleepNights} คืน` : `จากปุ่มตื่น/นอน ${r.sleepNights} คืน`}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ฝึกบุคลิกภาพ</div>
          <div className="stat-value"><CountUp value={Object.values(r.persona).reduce((a, b) => a + b, 0)} /><small> ครั้ง</small></div>
          <div className="stat-hint">ในช่วง {r.n} วัน</div>
        </div>
      </div>

      {r.sleepNights === 0 && <Section><EmptyState art="sleeping" title="กด 'ตื่นแล้ว' และ 'เข้านอน' ในหน้าวันนี้ แล้วข้อมูลการนอนจะขึ้นที่นี่" action={goToday} /></Section>}

      {r.feel.n > 0 && (
        <Section header={`ความรู้สึกเฉลี่ย (เช็กอิน ${r.feel.n} วัน)${r.feel.n < NEED.early ? " (ยังน้อย)" : ""}`}>
          <div style={{ padding: "8px 16px" }}>
            <BarRow label="การนอน" value={r.feel.sleep ?? 0} max={5} text={(r.feel.sleep ?? 0).toFixed(1)} area="sleep" />
            <BarRow label="พลังงาน" value={r.feel.energy ?? 0} max={5} text={(r.feel.energy ?? 0).toFixed(1)} area="recovery" />
            <BarRow label="อารมณ์" value={r.feel.mood ?? 0} max={5} text={(r.feel.mood ?? 0).toFixed(1)} area="nutrition" />
          </div>
        </Section>
      )}

      {bands.length > 0 && (
        <Section header="ความสม่ำเสมอ" footer={`นับเฉพาะวันที่มีบันทึกและมีในแผน · วันพักและวันป่วยไม่นับ · พลาดวันไหนก็ไม่เริ่มนับใหม่ · แบบนับติดต่อกันเดิม: ${st.days} วัน (ใช้กับเหรียญ)`}>
          {bands.map(({ key, b7, b28 }) => (
            <div key={key} className="row band-row">
              <span className="row-main">
                <div className="row-title fs-callout">{BAND_LABEL[key]}</div>
                <div className="row-sub num">28 วัน {bandText(b28)}</div>
              </span>
              <Band cells={b7.cells} area={BAND_AREA[key]} label={`${BAND_LABEL[key]} 7 วัน`} size="md" />
              <span className="row-value num">{bandText(b7)}</span>
            </div>
          ))}
        </Section>
      )}

      <Section header="การวิเคราะห์" footer={OBS_NOTE}>
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

      <Section header="ความครบรายวัน" footer={`เส้นประ = เป้าวันที่ดี ${pct(s.settings.goodDay)}% · สีเขียว = ผ่านเป้า`}>
        <div style={{ padding: 16 }}>
          {r.loggedDays === 0 ? <ChartEmpty kind="bars" text="ยังไม่มีบันทึกในช่วงนี้" /> : (
            <BarChart key={n} regrow={ranged} values={r.series.map((x) => (x.logged ? x.score : null))} goal={s.settings.goodDay} max={1} goodAt={s.settings.goodDay}
              area="consistency" label="ความครบรายวัน (0-1)" decimals={2} axis={axis} />
          )}
        </div>
      </Section>

      <Section header="น้ำดื่มรายวัน" footer="เส้นประ = เป้าเฉลี่ย, สีเขียว = ถึงเป้าของวันนั้น">
        <div style={{ padding: 16 }}>
          {r.loggedDays === 0 ? <ChartEmpty kind="bars" text="ยังไม่มีบันทึกในช่วงนี้" /> : (
            <BarChart
              key={n}
              regrow={ranged}
              values={r.series.map((x) => (x.logged ? x.water : null))}
              goal={waterGoalAvg}
              max={Math.max(4000, ...r.series.map((x) => x.water))}
              goodAt={(i) => r.series[i].goal}
              area="water" label="น้ำดื่มรายวัน" unit="มล." axis={axis}
            />
          )}
        </div>
      </Section>

      <Section header="ปฏิทินความครบ 13 สัปดาห์" footer="แตะช่องเพื่อดูรายละเอียดของวันนั้น">
        <div style={{ padding: 16 }}>
          <Heatmap days={heat} onPick={(d) => { play("tap"); setPick(d); }} />
        </div>
      </Section>

      <Section header="เฉลี่ยตามวันในสัปดาห์">
        <div style={{ padding: "8px 16px" }}>
          {r.weekday.map((v, i) => {
            const few = v === null || r.weekdayN[i] < NEED.weekday;
            return <BarRow key={i} label={DOW[i]} value={few ? 0 : v} max={1} text={few ? "-" : `${round5(v * 100)}%`} tone={!few && v >= s.settings.goodDay ? "var(--success)" : undefined} />;
          })}
        </div>
      </Section>

      <Section header="รายการที่ทำ (พลาดบ่อยอยู่บน)" footer="ตัวเลขขวา = ทำแล้ว/วันที่มีรายการนี้ · ช้าเฉลี่ยนับจากเวลาที่ตั้ง">
        {r.items.length === 0 && <EmptyState title="ยังไม่มีรายการที่บันทึกในช่วงนี้" action={goToday} />}
        {r.items.map((i) => (
          <div key={i.id} className="row">
            <span className="row-main">
              <div className="row-title fs-callout">{i.title}</div>
              <div className="row-sub">{i.avgDelay === null ? "ยังไม่มีเวลาที่บันทึก" : i.avgDelay <= 0 ? `ก่อนเวลาเฉลี่ย ${-i.avgDelay} นาที` : `ช้าเฉลี่ย ${i.avgDelay} นาที`}</div>
            </span>
            <span className={`row-value num ${i.done / i.planned < 0.6 ? "ink-warn" : ""}`}>{i.done}/{i.planned}</span>
          </div>
        ))}
      </Section>

      <Section header="ยิมตามส่วน">
        <div style={{ padding: "8px 16px" }}>
          {Object.entries(r.rotation).map(([k, v]) => <BarRow key={k} label={`${k} ${GYM_LABEL[k].split(" ")[0]}`} value={v} max={maxRot} text={`${v}`} />)}
          {r.gym.logged > 0 && <div className="row-sub" style={{ paddingTop: 6 }}>บันทึกเซ็ต <span className="num">{r.gym.logged}</span> ครั้ง · ยกรวม <span className="num">{r.gym.vol.toLocaleString("en-US")}</span> kg</div>}
        </div>
      </Section>

      {r.live.days > 0 && (
        <Section header="ไลฟ์จริง" footer="จากโหมดไลฟ์ · ปิดตรงเวลา = ไม่เกินแผน 15 นาที">
          <div className="row"><span className="row-main row-title">วันที่ไลฟ์</span><span className="row-value num">{r.live.days} วัน</span></div>
          <div className="row"><span className="row-main row-title">ชั่วโมงจริง / ตามแผน</span><span className="row-value num">{(r.live.min / 60).toFixed(1)} / {(r.live.planMin / 60).toFixed(1)} ชม.</span></div>
          <div className="row"><span className="row-main row-title">ปิดตรงเวลา</span><span className="row-value num">{r.live.onTime}/{r.live.days}</span></div>
          <div className="row"><span className="row-main row-title">พักต่อไลฟ์</span><span className="row-value num">{(r.live.br / r.live.days).toFixed(1)} ครั้ง</span></div>
          <div className="row"><span className="row-main row-title">เตือนพักที่ทำ</span><span className="row-value num">{r.live.seen ? `${pct(r.live.ok / r.live.seen)}%` : "-"}</span></div>
        </Section>
      )}

      {s.care.level !== null && (
        <Section header="ดูแลตัวเอง" footer="ข้อมูลสุขภาพทั่วไป ไม่ใช่การวินิจฉัย">
          <div className="row"><span className="row-main row-title">กิจวัตรที่ทำครบ</span><span className="row-value num">{r.care.done}/{r.care.planned}</span></div>
          <div className="row"><span className="row-main row-title">กันแดด</span><span className="row-value num">{r.care.spf}/{r.loggedDays} วัน</span></div>
          {s.care.track.veg && <div className="row"><span className="row-main row-title">ผัก/ผลไม้เฉลี่ย</span><span className="row-value num">{r.care.veg === null ? "-" : `${r.care.veg.toFixed(1)}/5 ส่วน`}</span></div>}
          {s.care.track.caf && <div className="row"><span className="row-main row-title">คาเฟอีนเฉลี่ย</span><span className="row-value num">{r.care.caf === null ? "-" : `~${Math.round(r.care.caf)} มก.`}{r.care.cafLateDays ? ` · ดึก ${r.care.cafLateDays} วัน` : ""}</span></div>}
          {r.care.moveMin > 0 && <div className="row"><span className="row-main row-title">ขยับ</span><span className="row-value num">{r.care.moveMin} นาที</span></div>}
          <div className="row"><span className="row-main row-title">น้ำเฉลี่ย</span><span className="row-value num">{(r.waterAvg / 1000).toFixed(1)} ลิตร</span></div>
        </Section>
      )}

      <Section header="ฝึกบุคลิกภาพตามหัวข้อ">
        <div style={{ padding: "8px 16px" }}>
          {Object.entries(r.persona).map(([k, v]) => <BarRow key={k} label={PERSONALITY_LABEL[k].split(" ")[0]} value={v} max={maxPer} text={`${v}`} area="voice" />)}
        </div>
      </Section>

      <Section header="เทรด" footer="ไม่มีจังหวะแล้วไม่เข้า นับเป็นวันที่ทำตามแผน">
        {r.trade.days === 0 ? <EmptyState title="ยังไม่มีบันทึกเทรดในช่วงนี้" action={{ label: "บันทึกเทรดวันนี้", onClick: () => { play("nav"); router.push(intentHref("trade")); } }} /> : <>
        <div className="row"><span className="row-main row-title">วันที่เช็กแผนเทรด</span><span className="row-value num">{r.trade.days}/{r.loggedDays}</span></div>
        <div className="row"><span className="row-main row-title">จำนวนไม้รวม</span><span className="row-value num">{r.trade.count}</span></div>
        <div className="row"><span className="row-main row-title">กำไร / ขาดทุน / เสมอ</span><span className="row-value num">{r.trade.win} / {r.trade.loss} / {r.trade.be}</span></div>
        <div className="row"><span className="row-main row-title">Win rate (ปิดแล้ว)</span><span className="row-value num">{r.trade.winRate === null ? "-" : `${pct(r.trade.winRate)}%`}</span></div>
        <div className="row"><span className="row-main row-title">ไม่มีจังหวะ ไม่เข้า</span><span className="row-value num">{r.trade.skip} วัน</span></div>
        {r.trade.gated > 0 && <div className="row"><span className="row-main row-title">เช็กลิสต์ครบ</span><span className="row-value num">{r.trade.gated}/{r.trade.days - r.trade.skip} วัน</span></div>}
        </>}
      </Section>

      {meal2Total > 0 && (
        <Section header="มื้อ 2 (พักกะ)">
          <div style={{ padding: "8px 16px" }}>
            {(["A", "B", "C"] as const).map((k) => <BarRow key={k} label={k} value={r.meal2[k]} max={meal2Total} text={`${r.meal2[k]}`} area="nutrition" />)}
            <div className="row-sub" style={{ paddingTop: 6 }}>A {MEAL2_LABEL.A} · B {MEAL2_LABEL.B} · C {MEAL2_LABEL.C}</div>
          </div>
        </Section>
      )}

      <Section header={`เหรียญ ${badges.filter((b) => b.earned).length}/${badges.length}`}>
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

      <Section footer="ไฟล์ CSV เปิดใน Excel / Google Sheets ได้">
        <button className="row" onClick={exportCsv}><span className="row-main row-title link">ส่งออกข้อมูล {r.n} วัน (CSV)</span></button>
      </Section>

      <Sheet open={pick !== null} title={pick ? THAI_DATE(pick) : ""} onClose={() => setPick(null)}>
        {pick && !picked && <div className="empty-note">{pick === today ? "วันนี้ยังไม่มีบันทึก" : "ไม่มีบันทึกของวันนั้น"}</div>}
        {pick && picked && (
          <>
            <Section header={`${resolveTemplate(s.schedule, picked.type).def.name} · ครบ ${pct(dayScore(s, picked))}%`}>
              {pickedItems.map((it) => {
                const ts = picked.done[it.id];
                return (
                  <div key={it.id} className={`row has-time ${ts ? "done" : ""}`}>
                    <span className="row-time">{hm(it.min)}</span>
                    <span className={`row-main row-title fs-callout ${ts ? "" : "ink-2"}`}>{it.title}</span>
                    <span className={`row-value num fs-sub ${ts ? "ink-success" : ""}`}>{ts ? (ts > 1e12 ? clock(ts) : "ทำแล้ว") : "-"}</span>
                  </div>
                );
              })}
            </Section>
            <Section>
              <div className="row"><span className="row-main row-title">น้ำดื่ม</span><span className="row-value">{(picked.waterMl / 1000).toFixed(2)} ลิตร</span></div>
              <div className="row"><span className="row-main row-title">เช็กอิน</span><span className="row-value fs-sub">{hasCheckin(picked) ? `นอน ${picked.checkin.sleep} · พลังงาน ${picked.checkin.energy} · อารมณ์ ${picked.checkin.mood}` : "-"}</span></div>
              <div className="row"><span className="row-main row-title">เทรด</span><span className="row-value fs-sub">{picked.trade ? (picked.trade.result === "skip" ? TRADE_RESULT.skip : `${picked.trade.count} ไม้ · ${TRADE_RESULT[picked.trade.result]}`) : "-"}</span></div>
              {picked.wakeAt && <div className="row"><span className="row-main row-title">ตื่น / เข้านอน</span><span className="row-value num">{clock(picked.wakeAt)}{picked.sleepAt ? ` / ${clock(picked.sleepAt)}` : ""}</span></div>}
            </Section>
          </>
        )}
      </Sheet>
    </>
  );
}
