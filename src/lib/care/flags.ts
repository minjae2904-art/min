// Doctor flags (pure): at most one notice at a time, chosen by priority. General wellness only: every flag says it is not a
// diagnosis; heuristic thresholds are labelled as such. No mental-health flag (help numbers live in settings).
import { langArr, msgs } from "../../i18n";
import * as M from "../../i18n/msg/lib-care";
import { careCheckText } from "../../i18n/stored";
import { addDays } from "../date";
import type { DayLog, State } from "../model";
import { bpHigh } from "./body";

export type CareFlag = { id: string; title: string; body: string; who: string; tips: string[]; heuristic?: true; call?: "1669" };
const m = msgs(M);

// Days in the window (today back, inclusive) that match.
function countDays(s: State, today: string, n: number, f: (d: DayLog) => boolean): number {
  let k = 0;
  for (let i = 0; i < n; i++) { const d = s.days[addDays(today, -i)]; if (d && f(d)) k++; }
  return k;
}
const hasSym = (d: DayLog, sym: string) => Array.isArray(d.sym) && d.sym.includes(sym as never);
// Only the voice symptom chip or a "เจ็บหรือแหบมาก" recap: mild hoarseness after a long live usually clears overnight.
const voiceSig = (d: DayLog) => hasSym(d, "voice") || d.live?.v === 2;

function candidates(s: State, today: string): CareFlag[] {
  const c = s.care, out: CareFlag[] = [];
  const notDx = m("flags.notDx"), doctor = m("flags.who.doctor"), derm = m("flags.who.derm"), water = m("flags.tip.water");
  const red = c.shelf.find((p) => !p.done && p.patch?.res === "red");
  if (red) out.push({ id: "patch", title: m("flags.patch.title", { name: red.name }), who: m("flags.patch.who"), call: "1669",
    body: m("flags.patch.body", { notDx }), tips: [m("flags.patch.tip1"), m("flags.patch.tip2")] });
  if (c.ms.mole === 3) out.push({ id: "mole", title: m("flags.mole.title"), who: derm,
    body: m("flags.mole.body", { notDx }), tips: [m("flags.mole.tip1")] });
  if (countDays(s, today, 21, voiceSig) >= 12) out.push({ id: "voice", title: m("flags.voice.title"), who: m("flags.voice.who"),
    body: m("flags.voice.body", { notDx }), tips: [m("flags.voice.tip1"), m("flags.voice.tip2"), m("flags.voice.tip3")] });
  if (bpHigh(c.checks.find((x) => x.id === "bp"))) out.push({ id: "bp", title: m("flags.bp.title"), who: doctor,
    body: m("flags.bp.body", { notDx }), tips: [m("flags.bp.tip1"), m("flags.bp.tip2")] });
  const lab = c.checks.find((x) => x.flag);
  if (lab) out.push({ id: "lab", title: m("flags.lab.title", { name: careCheckText(lab.name) }), who: doctor,
    body: m("flags.lab.body", { notDx }), tips: [m("flags.lab.tip1")] });
  if (c.ms["pm.ret.84"] === 2 || c.ms["pm.ret.84"] === 3) out.push({ id: "skin", title: m("flags.skin.title"), who: derm,
    body: m("flags.skin.body", { notDx }), tips: [m("flags.skin.tip1"), m("flags.skin.tip2")] });
  if (countDays(s, today, 21, (d) => d.bowel === 2 || d.bowel === 3) >= 15) out.push({ id: "bowel", title: m("flags.bowel.title"), who: doctor,
    body: m("flags.bowel.body", { notDx }), tips: [water, m("flags.bowel.tip2")] });
  if (countDays(s, today, 14, (d) => hasSym(d, "ear")) >= 3) out.push({ id: "ear", title: m("flags.ear.title"), who: m("flags.ear.who"),
    body: m("flags.ear.body", { notDx }), tips: [m("flags.ear.tip1"), m("flags.ear.tip2")] });
  if (countDays(s, today, 14, (d) => hasSym(d, "eye")) >= 7) out.push({ id: "eye", title: m("flags.eye.title"), who: m("flags.eye.who"),
    body: m("flags.eye.body", { notDx }), tips: [m("flags.eye.tip1"), m("flags.eye.tip2")] });
  if (countDays(s, today, 30, (d) => hasSym(d, "head")) >= 8) out.push({ id: "head", title: m("flags.head.title"), who: doctor, heuristic: true,
    body: m("flags.head.body", { notDx }), tips: [water, m("flags.head.tip2")] });
  const sick = [0, 1, 2, 3, 4].map((i) => { const d = s.days[addDays(today, -i)]; return !!d && hasSym(d, "sick"); });
  if (sick.some((_, i) => i <= 2 && sick[i] && sick[i + 1] && sick[i + 2])) out.push({ id: "sick", title: m("flags.sick.title"), who: doctor, heuristic: true,
    body: m("flags.sick.body", { notDx }), tips: [m("flags.sick.tip1"), m("flags.sick.tip2")] });
  return out;
}

// The first flag by priority that is not snoozed (snooze["f:"+id] earlier than today shows it again). Null before setup.
export function careFlag(s: State, today: string): CareFlag | null {
  if (s.care.level === null) return null;
  return candidates(s, today).find((f) => { const sn = s.care.snooze["f:" + f.id]; return !sn || sn < today; }) ?? null;
}
export function snoozeFlag(x: State, id: string, today: string) { x.care.snooze["f:" + id] = addDays(today, 14); }

// Static text (no trigger), from the brief section 12.
// Labels follow the UI language (built per language on first access, read-only).
export const RED_FLAGS: string[] = langArr(() => [
  m("flags.red.urine"),
  m("flags.red.heat"),
  m("flags.red.heart"),
  m("flags.red.lips"),
  m("flags.red.dandruff"),
  m("flags.red.rash"),
  m("flags.red.acne"),
  m("flags.red.sweat"),
]);
export const HELP: [string, string][] = langArr((): [string, string][] => [["1323", m("flags.help.1323")], ["1669", m("flags.help.1669")], ["191", m("flags.help.191")]]);
