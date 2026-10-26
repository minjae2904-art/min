// Light trackers (pure): fruit/veg, urine colour, caffeine, steps band, bowel, symptoms. General wellness only.
import { langArr, langObj, msgs } from "../../i18n";
import * as M from "../../i18n/msg/lib-care";
import { dayFor, type DayLog, type State, type Sym } from "../model";
import type { Care } from "./types";

const m = msgs(M);

export const VEG_TARGET = 5;
// Labels follow the UI language (built per language on first access, read-only).
export const URINE: string[] = langArr(() => [m("track.urine.0"), m("track.urine.1"), m("track.urine.2")]);
export const WALK: string[] = langArr(() => [m("track.walk.0"), m("track.walk.1"), m("track.walk.2")]);
export const BOWEL: string[] = langArr(() => [m("track.bowel.0"), m("track.bowel.1"), m("track.bowel.2")]);
export const SYM_LABEL: Record<Sym, string> = langObj(() => ({
  voice: m("track.sym.voice"), head: m("track.sym.head"), eye: m("track.sym.eye"), ear: m("track.sym.ear"), skin: m("track.sym.skin"), sick: m("track.sym.sick"),
}));
export const CAF_LABEL: Record<CafKind, string> = langObj(() => ({ c: m("track.caf.c"), t: m("track.caf.t"), e: m("track.caf.e"), p: m("track.caf.p") }));
export type CafKind = "c" | "t" | "e" | "p";
const KINDS: CafKind[] = ["c", "t", "e", "p"];

const cnt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
// Estimated mg from drink counts x the user's mg per drink.
export function cafTotal(day: DayLog | undefined, mg: Care["cafMg"]): number {
  const c = day?.caf && typeof day.caf === "object" ? day.caf : {};
  return KINDS.reduce((n, k) => n + cnt(c[k]) * mg[k], 0);
}
// Last coffee/tea/energy ~9 h before planned sleep; strong pre-workout ~13 h.
export const cafCutoff = (sleepMin: number) => ({ coffee: sleepMin - 540, pre: sleepMin - 780 });

// over = 400 mg or more (warn tone); late / preLate (a pre-workout logged past its cutoff) are neutral info lines, shown once.
// nowMin/sleepMin stay in the signature for callers; the late flags are stamped at log time by logCaf.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function cafNote(day: DayLog | undefined, mg: Care["cafMg"], nowMin: number, sleepMin: number): { over: boolean; late: boolean; preLate: boolean } {
  const c = day?.caf && typeof day.caf === "object" ? day.caf : {};
  return { over: cafTotal(day, mg) >= 400, late: cnt(c.late) > 0, preLate: cnt(c.pl) > 0 };
}

// +1 drink; late counts only coffee/tea/energy past the coffee cutoff (pre-workout never feeds cafLateDays).
export function logCaf(x: State, date: string, kind: CafKind, nowMin: number, sleepMin: number) {
  const d = dayFor(x, date);
  const c = { ...(d.caf && typeof d.caf === "object" ? d.caf : {}) };
  c[kind] = cnt(c[kind]) + 1;
  if (kind !== "p" && nowMin > cafCutoff(sleepMin).coffee) c.late = cnt(c.late) + 1;
  if (kind === "p" && nowMin > cafCutoff(sleepMin).pre) c.pl = cnt(c.pl) + 1;
  d.caf = c;
  x.days[date] = d;
}
