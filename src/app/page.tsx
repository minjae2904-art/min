"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBriefcase, IconCheck, IconDrop, IconFlame, IconMoon } from "@/components/Icons";
import { CheckIn } from "@/components/CheckIn";
import { NowBanner } from "@/components/NowBanner";
import { Rings } from "@/components/Rings";
import { Confetti, CountUp, Section, Segmented, Sheet, toast } from "@/components/ui";
import { THAI_DATE, at, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { GYM_CYCLE, GYM_LABEL, PERSONALITY_CYCLE, PERSONALITY_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, buildDay, type DayType, type Item, type Meal2 } from "@/lib/schedule";
import { DEFAULT_IDENTITY, badgeCatalog, dayMessage, maybePraise, microStep } from "@/lib/psych";
import { play } from "@/lib/sound";
import { streak, waterGoal, week, weightStats } from "@/lib/stats";
import { emptyDay, useStore } from "@/lib/store";
import type { TradeLog, TradeResult } from "@/lib/model";

const TRADE_RESULT: [TradeResult, string][] = [["win", "กำไร"], ["loss", "ขาดทุน"], ["be", "เสมอ"], ["open", "ยังถืออยู่"]];

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function greeting(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "สวัสดีตอนเช้า";
  if (h >= 12 && h < 17) return "สวัสดีตอนบ่าย";
  if (h >= 17 && h < 21) return "สวัสดีตอนเย็น";
  return "สวัสดีตอนดึก";
}

function countdown(diff: number) {
  if (Math.abs(diff) < 5) return "ถึงเวลาแล้ว";
  const a = Math.abs(diff);
  const t = a >= 60 ? `${Math.floor(a / 60)} ชม. ${a % 60} น.` : `${a} นาที`;
  return diff > 0 ? `อีก ${t}` : `เลยมา ${t}`;
}

export default function Today() {
  const { s, update } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<null | "meal2" | "weigh" | "journal" | "trade">(null);
  const [tr, setTr] = useState<TradeLog>({ count: 1, result: "open" });
  const [jr, setJr] = useState({ good: "", fix: "", thanks: "" });
  const [kg, setKg] = useState("");
  const [popped, setPopped] = useState<string | null>(null);
  const [party, setParty] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = s.days[date] ?? emptyDay();
  const items = buildDay(day.type, day.meal2, s.schedule);
  const tracked = items.filter((i) => i.ring);

  const gymNext = nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
  const gymToday = s.workouts.find((w) => w.date === date)?.code;
  const personaNext = nextInCycle(PERSONALITY_CYCLE, s.personality.filter((w) => w.date !== date));

  const ratio = (ring: string) => {
    const r = tracked.filter((i) => i.ring === ring);
    return r.length ? r.filter((i) => day.done[i.id]).length / r.length : 0;
  };
  const doneCount = tracked.filter((i) => day.done[i.id]).length;
  const pct = tracked.length ? doneCount / tracked.length : 0;
  const pending = tracked.filter((i) => !day.done[i.id]);
  const next = pending.find((i) => i.min >= nowMin - 30) ?? pending[0];

  const st = streak(s, date);
  const wk = week(s, date);
  const { cur: latestKg } = weightStats(s, date);
  const waterTarget = waterGoal(s, day, latestKg);
  const dnd = s.settings.dndUntil > now.getTime();
  const wakeMin = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 0;
  const showCheckin = !day.checkin && nowMin >= wakeMin && nowMin < wakeMin + 6 * 60;
  const msg = dayMessage(s, date);

  // Award badges the moment the data qualifies (progress principle: make progress visible).
  const badges = badgeCatalog(s, date);
  const fresh = badges.filter((b) => b.earned && !s.achievements[b.id]);
  useEffect(() => {
    if (!fresh.length) return;
    update((x) => { for (const b of fresh) x.achievements[b.id] = Date.now(); });
    // The first run back-fills old badges silently; only celebrate when 1-2 are new.
    if (fresh.length <= 2) {
      const t = setTimeout(() => {
        play("complete");
        setParty((n) => n + 1);
        toast(`ได้เหรียญใหม่: ${fresh.map((b) => b.title).join(", ")}`);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [fresh.map((b) => b.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (fn: (d: typeof day) => void) =>
    update((x) => {
      const d = x.days[date] ?? emptyDay();
      fn(d);
      x.days[date] = d;
    });

  function toggle(item: Item) {
    if (item.id === "meal2" && day.type === "work" && !day.done.meal2 && !day.meal2) return setSheet("meal2");
    if (item.kind === "weigh" && !day.done.weigh) return setSheet("weigh");
    if (item.kind === "trade" && !day.done[item.id]) { setTr(day.trade ?? { count: 1, result: "open" }); return setSheet("trade"); }
    if (item.id === "night" && !day.done.night) { setJr(day.journal ?? { good: "", fix: "", thanks: "" }); return setSheet("journal"); }
    const on = !day.done[item.id];
    const finishing = on && doneCount + 1 === tracked.length;
    play(!on ? "undo" : finishing ? "complete" : "done");
    if (on) setPopped(item.id);
    if (finishing) setParty((n) => n + 1);
    if (on && !finishing) {
      const ringLeft = tracked.filter((i) => i.ring === item.ring && i.id !== item.id && !day.done[i.id]).length;
      const ringName = { food: "กิน", body: "ร่างกาย", habit: "นิสัย" }[item.ring ?? "habit"];
      const praise = maybePraise(((doneCount * 7 + item.min) % 10) / 10); // deterministic "random" keeps render pure
      if (ringLeft === 0) toast(`ปิดวง${ringName}ครบแล้ว`);
      else if (praise) toast(praise);
    }
    update((x) => {
      const d = x.days[date] ?? emptyDay();
      if (on) d.done[item.id] = Date.now();
      else delete d.done[item.id];
      x.days[date] = d;
      if (item.kind === "gym") {
        x.workouts = x.workouts.filter((w) => w.date !== date);
        if (on) x.workouts.push({ date, code: day.type === "off" ? "R" : gymNext });
      }
      if (item.kind === "personality") {
        x.personality = x.personality.filter((w) => w.date !== date);
        if (on) x.personality.push({ date, code: personaNext });
      }
    });
  }

  function subFor(item: Item) {
    if (item.kind === "gym" && day.type === "work") {
      const code = gymToday ?? gymNext;
      return `${gymToday ? "เล่นแล้ว" : "ครั้งนี้"}: ${code} ${GYM_LABEL[code]}`;
    }
    if (item.kind === "personality") return `${personaNext} ${PERSONALITY_LABEL[personaNext]} · 30-45 นาที`;
    if (item.kind === "trade" && day.trade) {
      return day.trade.result === "skip" ? "ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า" : `เทรด ${day.trade.count} ไม้ · ${TRADE_RESULT.find(([k]) => k === day.trade!.result)?.[1] ?? ""}${day.trade.note ? ` · ${day.trade.note}` : ""}`;
    }
    return item.sub;
  }
  function cueFor(item: Item) {
    return item.cue ? `${item.cue}` : null;
  }

  const phases: [string, Item[]][] = [
    ["ก่อนเข้างาน", items.filter((i) => i.min < at(16))],
    [day.type === "work" ? "ระหว่างงาน" : "ช่วงเย็น", items.filter((i) => i.min >= at(16) && i.min < at(2))],
    [day.type === "work" ? "หลังเลิกงาน" : "ก่อนนอน", items.filter((i) => i.min >= at(2))],
  ];

  return (
    <main className="screen">
      <div className="topbar">
        <div>
          <div className="eyebrow">{THAI_DATE(date)}</div>
          <h1 className="large-title">{greeting(now)}{s.profile.name ? ` ${s.profile.name}` : ""}</h1>
        </div>
        <Link href="/settings" className="avatar" aria-label="ตั้งค่า">{(s.profile.name || "K").slice(0, 1).toUpperCase()}</Link>
      </div>
      <div className="identity"><span>เป้าหมายตัวตน:</span><b>{s.profile.identity || DEFAULT_IDENTITY}</b></div>

      <NowBanner s={s} day={day} now={now} nowMin={nowMin} />

      {msg && <div className="daymsg">{msg}</div>}

      {showCheckin && (
        <CheckIn
          onSkip={() => patch((d) => { d.checkin = { mood: 0, energy: 0, sleep: 0 }; })}
          onSave={(v) => { patch((d) => { d.checkin = v; }); toast(v.energy <= 2 ? "พลังงานต่ำวันนี้ เริ่มจากข้อเล็กๆ ก่อนก็พอ" : "บันทึกแล้ว ขอให้เป็นวันที่ดี"); }}
        />
      )}

      <Segmented<DayType>
        value={day.type}
        options={[["work", "วันทำงาน 16:00-02:00"], ["off", "วันหยุด"]]}
        onChange={(v) => patch((d) => { d.type = v; })}
      />

      {dnd && (
        <button className="card" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 16px", marginBottom: 16 }}
          onClick={() => { play("toggle"); update((x) => { x.settings.dndUntil = 0; }); }}>
          <span style={{ color: "var(--purple)" }}><IconMoon size={20} /></span>
          <span style={{ flex: 1, fontSize: 15 }}>พักการแจ้งเตือนถึง {new Date(s.settings.dndUntil).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="link" style={{ fontSize: 15 }}>เปิดต่อ</span>
        </button>
      )}

      {next ? (
        <div className="hero">
          <div key={next.id} className="hero-swap" style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <div className="hero-label">ถัดไป · {hm(next.min)} · {countdown(next.min - nowMin)}</div>
            <div className="hero-title">{next.title}</div>
            {subFor(next) && <div className="hero-sub">{subFor(next)}</div>}
            {cueFor(next) && <div className="hero-sub"><span className="cue">ทำต่อจาก:</span> {cueFor(next)}</div>}
            {next.min + 15 < nowMin && <div className="micro">{microStep(next)}</div>}
          </div>
          <button className="hero-check" aria-label="ทำแล้ว" onClick={() => toggle(next)}><IconCheck size={26} /></button>
        </div>
      ) : (
        <div className="hero allset">
          <div style={{ flex: 1, position: "relative" }}>
            <div className="hero-label" style={{ color: "var(--green)" }}>ครบทุกอย่างแล้ว</div>
            <div className="hero-title">วันนี้ทำครบ {tracked.length} รายการ</div>
            <div className="hero-sub">พักผ่อนให้เต็มที่ เจอกันพรุ่งนี้</div>
          </div>
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">วันนี้</div>
          <div className="stat-value"><CountUp value={Math.round(pct * 100)} /><small>%</small></div>
        </div>
        <div className="stat">
          <div className="stat-label"><span style={{ color: "var(--orange)" }}><IconFlame size={13} /></span>ติดต่อกัน</div>
          <div className="stat-value"><CountUp value={st.days} /><small> วัน</small></div>
        </div>
        <div className="stat">
          <div className="stat-label">7 วันล่าสุด</div>
          <div className="stat-value"><CountUp value={wk.goodDays} /><small>/7</small></div>
        </div>
      </div>

      <div className="card">
        <div className={`rings-card rings-wrap ${pct >= 1 ? "complete" : ""}`}>
          <Rings values={[ratio("food"), ratio("body"), ratio("habit")]} />
          <div className="legend">
            <Legend label="กิน" color="var(--ring-food)" v={ratio("food")} />
            <Legend label="ร่างกาย" color="var(--ring-body)" v={ratio("body")} />
            <Legend label="นิสัย" color="var(--ring-habit)" v={ratio("habit")} />
          </div>
        </div>
        <div className="weekbar" aria-label="ความครบ 7 วัน">
          {wk.scores.map((x) => (
            <span key={x.date} className={`${x.score >= s.settings.goodDay ? "good" : ""} ${x.date === date ? "today" : ""}`} style={{ height: `${Math.max(8, x.score * 100)}%` }} />
          ))}
        </div>
        <div className="weekdays">
          {wk.scores.map((x) => <span key={x.date}>{DOW[new Date(x.date + "T12:00:00").getDay()]}</span>)}
        </div>
        {st.forgiven && <div style={{ fontSize: 13, color: "var(--label2)", marginTop: 8 }}>พลาดไป 1 วันไม่เป็นไร ยังนับต่อเนื่อง แค่อย่าพลาด 2 วันติด</div>}
      </div>

      <Section header="น้ำดื่ม" footer={`เป้าคำนวณจากน้ำหนัก ${latestKg.toFixed(1)} kg + กิจกรรมวันนี้`}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "var(--teal)" }}><IconDrop size={22} /></span>
            <span className="big-number" style={{ fontSize: 28 }}><CountUp value={day.waterMl / 1000} decimals={2} duration={500} /></span>
            <span style={{ color: "var(--label2)" }}>/ {(waterTarget / 1000).toFixed(1)} ลิตร</span>
            {day.waterMl >= waterTarget && <span className="badge ok" style={{ marginLeft: "auto" }}>ครบแล้ว</span>}
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--fill)", overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: "100%", width: `${Math.min(100, (day.waterMl / waterTarget) * 100)}%`, background: "var(--teal)", transition: "width .4s var(--ease)" }} />
          </div>
          <div className="chips">
            {[250, 350, 500, 1000].map((ml) => (
              <button key={ml} className="chip" onClick={() => { play(day.waterMl < waterTarget && day.waterMl + ml >= waterTarget ? "complete" : "water"); patch((d) => { d.waterMl += ml; }); }}>+{ml}</button>
            ))}
            <button className="chip" style={{ color: "var(--red)" }} onClick={() => { play("undo"); patch((d) => { d.waterMl = Math.max(0, d.waterMl - 250); }); }}>-250</button>
          </div>
        </div>
      </Section>

      {phases.map(([title, list]) => list.length > 0 && (
        <Section key={title} header={`${title} · ${list.filter((i) => i.ring && day.done[i.id]).length}/${list.filter((i) => i.ring).length}`}>
          {list.map((item) => {
            if (!item.ring) {
              return (
                <div key={item.id} className="row info" style={{ ["--inset" as string]: "74px" }}>
                  <span className="row-time">{hm(item.min)}</span>
                  <span style={{ width: 26, color: "var(--label3)", display: "grid", placeItems: "center" }}><IconBriefcase size={18} /></span>
                  <span className="row-main row-title">{item.title}</span>
                </div>
              );
            }
            const done = !!day.done[item.id];
            const overdue = !done && item.min + 30 < nowMin;
            return (
              <button
                key={item.id}
                className={`row ${done ? "done" : ""} ${overdue ? "overdue" : ""} ${item.id === next?.id ? "next" : ""}`}
                style={{ ["--inset" as string]: "74px" }}
                onClick={() => toggle(item)}
              >
                <span className="row-time">{hm(item.min)}</span>
                <span className={`check ${done ? "on" : ""} ${done && popped === item.id ? "pop" : ""}`}>{done && <IconCheck size={16} />}</span>
                <span className="row-main">
                  <div className="row-title">{item.title}</div>
                  {(subFor(item) || cueFor(item)) && (
                    <div className="row-sub">
                      {cueFor(item) && <span className="cue">{cueFor(item)}</span>}
                      {cueFor(item) && subFor(item) ? " · " : ""}
                      {subFor(item)}
                    </div>
                  )}
                </span>
              </button>
            );
          })}
        </Section>
      ))}

      <Sheet open={sheet === "meal2"} title="มื้อ 2 วันนี้เป็นแบบไหน" onClose={() => setSheet(null)}>
        <Section>
          {(Object.keys(MEAL2_LABEL) as Meal2[]).map((k) => (
            <button key={k} className="row" onClick={() => {
              play("done");
              patch((d) => { d.meal2 = k; if (k === "A") d.done.meal2 = Date.now(); });
              setSheet(null);
            }}>
              <span className="row-main">
                <div className="row-title">{k}. {MEAL2_LABEL[k]}</div>
                <div className="row-sub">
                  {k === "A" && "ติ๊กว่ากินแล้ว"}
                  {k === "B" && "เพิ่มของว่างชดเชย ~500 kcal ช่วง 23:45"}
                  {k === "C" && "กินข้าว 02:05 แล้วเลื่อนยิมเป็น 03:00"}
                </div>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </Section>
      </Sheet>

      <Sheet open={sheet === "trade"} title="เทรดวันนี้" onClose={() => setSheet(null)}>
        <Section header="จำนวนไม้">
          <div className="row" style={{ gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="chip" style={tr.count === n && tr.result !== "skip" ? { background: "var(--blue)", color: "#fff" } : undefined} onClick={() => { play("tap"); setTr({ ...tr, count: n, result: tr.result === "skip" ? "open" : tr.result }); }}>{n === 5 ? "5+" : n}</button>
            ))}
          </div>
        </Section>
        <Section header="ผล">
          <div className="row"><div style={{ flex: 1 }}><Segmented value={tr.result === "skip" ? "open" : tr.result} options={TRADE_RESULT} onChange={(v) => setTr({ ...tr, result: v })} /></div></div>
          <label className="row form-row">
            <span className="row-title" style={{ width: 70 }}>โน้ต</span>
            <input className="inline-input" placeholder="คู่เงิน / setup / บทเรียน (ไม่บังคับ)" value={tr.note ?? ""} onChange={(e) => setTr({ ...tr, note: e.target.value })} />
          </label>
        </Section>
        <button className="btn" onClick={() => {
          const finishing = doneCount + 1 === tracked.length;
          play(finishing ? "complete" : "done");
          if (finishing) setParty((n) => n + 1);
          patch((d) => { d.trade = { ...tr, result: tr.result === "skip" ? "open" : tr.result, note: tr.note?.trim() || undefined }; d.done.trade = Date.now(); });
          setSheet(null);
          toast(`บันทึกเทรด ${tr.count} ไม้แล้ว`);
        }}>บันทึกว่าเทรดแล้ว</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => {
          play("done");
          patch((d) => { d.trade = { count: 0, result: "skip", note: tr.note?.trim() || undefined }; d.done.trade = Date.now(); });
          setSheet(null);
          toast("ไม่มีจังหวะแล้วไม่เข้า คือวินัยที่ดี");
        }}>ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า</button>
        <div className="section-footer" style={{ textAlign: "center", marginTop: 10 }}>บันทึกเพื่อดูวินัยของตัวเอง ไม่ใช่คำแนะนำการลงทุน</div>
      </Sheet>

      <Sheet open={sheet === "journal"} title="ทบทวนก่อนนอน" onClose={() => setSheet(null)}>
        <div className="journal-label">วันนี้ทำอะไรได้ดี 1 อย่าง</div>
        <textarea className="journal-field" value={jr.good} onChange={(e) => setJr({ ...jr, good: e.target.value })} placeholder="เช่น เข้ายิมแม้จะเหนื่อย" />
        <div className="journal-label">พรุ่งนี้อยากแก้ 1 อย่าง</div>
        <textarea className="journal-field" value={jr.fix} onChange={(e) => setJr({ ...jr, fix: e.target.value })} placeholder="เช่น ดื่มน้ำให้ถึงเป้าก่อนเลิกงาน" />
        <div className="journal-label">ขอบคุณ 1 อย่าง</div>
        <textarea className="journal-field" value={jr.thanks} onChange={(e) => setJr({ ...jr, thanks: e.target.value })} placeholder="สิ่งเล็กๆ ก็ได้" />
        <button className="btn" onClick={() => {
          play(doneCount + 1 === tracked.length ? "complete" : "done");
          if (doneCount + 1 === tracked.length) setParty((n) => n + 1);
          patch((d) => { d.journal = jr; d.done.night = Date.now(); });
          setSheet(null);
          toast("บันทึกแล้ว นอนหลับฝันดี");
        }}>บันทึกและติ๊กเสร็จ</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => { play("done"); patch((d) => { d.done.night = Date.now(); }); setSheet(null); }}>ติ๊กเสร็จโดยไม่เขียน</button>
      </Sheet>

      <Sheet open={sheet === "weigh"} title="น้ำหนักเช้านี้" onClose={() => setSheet(null)}>
        <input className="field num" inputMode="decimal" placeholder="เช่น 67.4" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus style={{ fontSize: 28, textAlign: "center" }} />
        <div style={{ height: 16 }} />
        <button className="btn" onClick={() => {
          const v = parseFloat(kg);
          if (!(v > 30 && v < 250)) return play("error");
          play("done");
          update((x) => {
            x.weights = x.weights.filter((w) => w.date !== date).concat({ date, kg: v });
            const d = x.days[date] ?? emptyDay();
            d.done.weigh = Date.now();
            x.days[date] = d;
          });
          setKg("");
          setSheet(null);
        }}>บันทึก</button>
      </Sheet>
      <Confetti fire={party} />
    </main>
  );
}

function Legend({ label, color, v }: { label: string; color: string; v: number }) {
  return (
    <div>
      <div className="legend-label" style={{ color }}>{label}</div>
      <div className="legend-value"><CountUp value={Math.round(v * 100)} /><small>%</small></div>
    </div>
  );
}
