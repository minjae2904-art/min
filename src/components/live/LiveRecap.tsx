"use client";

// Post-live recap (v1.7 G3). Real minutes were already written at "จบไลฟ์"; this sheet only adds mood / voice chips
// (and an optional voice rest tomorrow). Planned budgets never change. General wellness only.
import { useState } from "react";
import { Section, Sheet, toast } from "@/components/ui";
import { addDays } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { hmClock, recapOf, setRecap } from "@/lib/session";
import { useStore } from "@/lib/store";

const MOOD: [1 | 2 | 3, string][] = [[1, "สนุก"], [2, "ปกติ"], [3, "เหนื่อย"]];
const VOICE: [0 | 1 | 2, string][] = [[0, "ปกติ"], [1, "แหบนิดหน่อย"], [2, "เจ็บหรือแหบมาก"]];
const clockMin = (m: number) => hmClock(m * 60_000);
const markText = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

// Exact undo of setRecap: live mood/v, sing, tomorrow's voice rest (and whether tomorrow's log existed).
type Snap = { date: string; live?: { mood?: 1 | 2 | 3; v?: 0 | 1 | 2 }; sing?: { min?: 10 | 20 | 30 | 45; strain?: boolean }; tmrHad: boolean; tmrRest?: boolean };
function snapOf(s: State, date: string): Snap {
  const d = s.days[date], t = s.days[addDays(date, 1)];
  return structuredClone({ date, live: d?.live ? { mood: d.live.mood, v: d.live.v } : undefined, sing: d?.sing, tmrHad: !!t, tmrRest: t?.voiceRest });
}
function restoreOf(x: State, p: Snap) {
  const d = x.days[p.date];
  if (d?.live) {
    if (p.live?.mood === undefined) delete d.live.mood; else d.live.mood = p.live.mood;
    if (p.live?.v === undefined) delete d.live.v; else d.live.v = p.live.v;
  }
  if (d) { if (p.sing === undefined) delete d.sing; else d.sing = structuredClone(p.sing); }
  const tk = addDays(p.date, 1);
  if (!p.tmrHad) delete x.days[tk];
  else if (x.days[tk]) { if (p.tmrRest) x.days[tk].voiceRest = true; else delete x.days[tk].voiceRest; }
}

export function LiveRecap({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { s, update } = useStore();
  const [mood, setMood] = useState<1 | 2 | 3 | undefined>(undefined);
  const [v, setV] = useState<0 | 1 | 2 | undefined>(undefined);
  const [rest, setRest] = useState(false);
  const [prevDate, setPrevDate] = useState<string | null>(null);
  // Render-time reset per opened recap: chips start from what the day already has.
  if (date !== prevDate) {
    setPrevDate(date);
    const l = date ? dayFor(s, date).live : undefined;
    setMood(l?.mood); setV(l?.v); setRest(false);
  }
  const r = date ? recapOf(s, date) : null;

  function save() {
    if (!date) return;
    const p = snapOf(s, date);
    update((x) => setRecap(x, date, { mood, v, restTomorrow: v === 2 && rest }));
    toast(v === 2 && rest ? "บันทึกแล้ว · พักเสียงพรุ่งนี้" : "บันทึกสรุปไลฟ์แล้ว", { action: "เลิกทำ", onAction: () => update((x) => restoreOf(x, p)) });
    onClose();
  }

  const delta = r && r.planMin !== null ? r.min - r.planMin : null;
  return (
    <Sheet open={!!date} title="สรุปไลฟ์" onClose={onClose}>
      {r && (
        <>
          <div className="group lv-recap">
            <div className="row"><span className="row-main row-title num">
              ไลฟ์ {clockMin(r.min)}{r.planMin !== null ? ` · แผน ${clockMin(r.planMin)} (${delta! > 0 ? "+" : delta! < 0 ? "-" : ""}${Math.abs(delta!)} น.)` : ""}
            </span></div>
            <div className="row"><span className="row-main row-title num">พักตา/ลุก/น้ำ {r.ok}/{r.seen} · พัก {r.br} ครั้ง</span></div>
            <div className="row"><span className="row-main">
              <span className="row-title num">{r.marks.length ? `มาร์กคลิปไว้ ${r.marks.length} จุด: ${r.marks.map(markText).join(" · ")}` : "มาร์กคลิปไว้ตัดพรุ่งนี้"}</span>
              {r.marks.length > 0 && r.clipsAt && <span className="row-sub num">ตัดคลิปพรุ่งนี้ {r.clipsAt}</span>}
            </span></div>
            {r.overMin !== null && r.overMin > 15 && (
              <div className="row"><span className="row-main row-sub num">ปิดช้ากว่าแผน {r.overMin} นาที{r.sleepAt ? ` · นอนตามแผน ${r.sleepAt}` : ""}</span></div>
            )}
          </div>
          <Section header="รู้สึกยังไง">
            <div className="row chips lv-chiprow">
              {MOOD.map(([k, t]) => <button key={k} type="button" className={`chip ${mood === k ? "on" : ""}`} aria-pressed={mood === k} onClick={() => setMood(mood === k ? undefined : k)}>{t}</button>)}
            </div>
          </Section>
          <Section header="เสียง">
            <div className="row chips lv-chiprow">
              {VOICE.map(([k, t]) => <button key={k} type="button" className={`chip ${v === k ? "on" : ""}`} aria-pressed={v === k} onClick={() => setV(v === k ? undefined : k)}>{t}</button>)}
              {v === 2 && <button type="button" className={`chip ${rest ? "on" : ""}`} aria-pressed={rest} onClick={() => setRest(!rest)}>พักเสียงพรุ่งนี้</button>}
            </div>
          </Section>
          {v === 2 && <div className="section-footer lv-recap-note">แหบหรือเจ็บเกิน 3 สัปดาห์ ควรพบหมอ หู คอ จมูก · ไม่ใช่การวินิจฉัย</div>}
          <button className="btn lv-save" onClick={save}>บันทึก</button>
        </>
      )}
    </Sheet>
  );
}
