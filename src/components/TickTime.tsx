"use client";

import { useEffect, useState } from "react";
import { ROLLOVER_HOUR, hm, logicalDate } from "@/lib/date";
import type { TickSrc } from "@/lib/model";
import type { Item } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { planEpoch } from "@/lib/ticks";
import { Section, Sheet, toast } from "./ui";

// Late-tick ask: one toast per burst of late ticks, never blocking. Ignoring it keeps ts = now with src "late".
type Late = { date: string; item: Item; apply: (ts: number, src: TickSrc) => void };

const DEBOUNCE_MS = 3000, MAX_IGNORED = 2, IGNORED_KEY = "krob-ask-ignored";
let pending: Late[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function ignored(): number {
  try {
    const v = JSON.parse(localStorage.getItem(IGNORED_KEY) ?? "null") as { date?: string; n?: number } | null;
    return v && v.date === logicalDate() && typeof v.n === "number" ? v.n : 0;
  } catch { return 0; }
}
function bumpIgnored() {
  try { localStorage.setItem(IGNORED_KEY, JSON.stringify({ date: logicalDate(), n: ignored() + 1 })); } catch { /* storage blocked */ }
}

export function queueLateTick(t: Late) {
  if (ignored() >= MAX_IGNORED) return; // stop asking for today; the tick is already stored as "late"
  pending = [...pending.filter((p) => !(p.date === t.date && p.item.id === t.item.id)), t];
  arm();
}

// Drop a queued ask when the item is unticked before the burst fires.
export function cancelLateTick(date: string, id: string) {
  pending = pending.filter((p) => !(p.date === date && p.item.id === id));
  if (!pending.length && timer) { clearTimeout(timer); timer = null; }
}

function arm() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(fire, DEBOUNCE_MS);
}

function fire() {
  timer = null;
  if (document.querySelector(".wizard")) return arm(); // QuickLog open: ask once after it closes
  const list = pending;
  pending = [];
  if (!list.length) return;
  const pick = () => window.dispatchEvent(new CustomEvent<Late[]>("krob-ticktime", { detail: list }));
  const now = { label: "เพิ่งทำ", onAction: () => { const ts = Date.now(); list.forEach((l) => l.apply(ts, "now")); } };
  const choose = { label: "เลือกเวลา", onAction: pick };
  const one = list.length === 1 ? list[0] : null;
  const plan = one
    ? { label: `ทำตรงเวลา ${hm(one.item.min)}`, onAction: () => one.apply(planEpoch(one.date, one.item.min), "plan") }
    : { label: "ทำตรงเวลาทั้งหมด", onAction: () => list.forEach((l) => l.apply(planEpoch(l.date, l.item.min), "plan")) };
  toast(one ? `ทำ "${one.item.title}" ตอนไหน?` : `ติ๊กย้อนหลัง ${list.length} รายการ ทำตอนไหน?`, { ms: 8000, actions: [plan, now, choose], onExpire: bumpIgnored });
}

// "เลือกเวลา": one time field per pending item. Mounted once in AppShell (z 98 wrapper, above the wizard).
export function TickTimeSheet() {
  const [list, setList] = useState<Late[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const on = (e: Event) => {
      const l = (e as CustomEvent<Late[]>).detail;
      setVals(Object.fromEntries(l.map((x) => [x.item.id, hm(x.item.min)])));
      setList(l);
    };
    window.addEventListener("krob-ticktime", on);
    return () => window.removeEventListener("krob-ticktime", on);
  }, []);

  function save() {
    if (!list) return;
    const out = list.map((l) => {
      const [h, m] = (vals[l.item.id] ?? "").split(":").map(Number);
      if (!Number.isInteger(h) || !Number.isInteger(m)) return { l, ts: NaN };
      const min = h * 60 + m + (h < ROLLOVER_HOUR ? 1440 : 0);
      return { l, ts: planEpoch(l.date, min) };
    });
    if (out.some((o) => !Number.isFinite(o.ts) || o.ts > Date.now())) { play("error"); toast("เลือกเวลาที่ผ่านมาแล้ว"); return; }
    play("done");
    for (const o of out) o.l.apply(o.ts, "pick");
    setList(null);
  }

  return (
    <Sheet open={!!list} title="เวลาที่ทำจริง" onClose={() => setList(null)}>
      <Section footer={`เวลาก่อน ${hm(ROLLOVER_HOUR * 60)} นับเป็นช่วงดึกของวันเดียวกัน`}>
        {(list ?? []).map((l) => (
          <label key={l.item.id} className="row form-row">
            <span className="row-main row-title">{l.item.title}</span>
            <input type="time" className="time-input" value={vals[l.item.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [l.item.id]: e.target.value }))} />
          </label>
        ))}
      </Section>
      <button className="btn" onClick={save}>บันทึก</button>
    </Sheet>
  );
}
