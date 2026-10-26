// Product shelf and health-check helpers (pure). Dates are ISO logical dates; no usage-based "days left".
import { fmt, msgs } from "../../i18n";
import * as M from "../../i18n/msg/lib-care";
import type { State } from "../model";
import { daysBetween } from "./cadence";
import type { Care, CareTask, Check, Product } from "./types";

const m = msgs(M);

const pad = (n: number) => String(n).padStart(2, "0");
// Calendar months later, clamped to the month's last day (Jan 31 + 1 -> Feb 28/29).
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = y * 12 + (m - 1) + n, Y = Math.floor(t / 12), M = t % 12;
  const last = new Date(Date.UTC(Y, M + 1, 0)).getUTCDate();
  return `${Y}-${pad(M + 1)}-${pad(Math.min(d, last))}`;
}

// Last usable day: the earlier of opened + PAO months and the printed expiry.
export function useBy(p: Product): string | null {
  const c = [p.opened && p.pao ? addMonths(p.opened, p.pao) : null, p.exp ?? null].filter((x): x is string => !!x);
  return c.length ? c.sort()[0] : null;
}

// "24 ต.ค." / "24 Oct" (legacy name kept for importers).
export const thShort = (date: string) => fmt.dayMonth(date);
const isSpf = (p: Product) => /spf|กันแดด/i.test(p.name) || /sunscreen/i.test(p.name); // i18n-allow: detects sunscreen in user-typed product names

export function useByChip(p: Product, today: string): { text: string; warn: boolean } | null {
  const u = useBy(p);
  if (!u || p.done) return null;
  const left = daysBetween(today, u);
  if (left < 0) return { text: isSpf(p) ? m("body.chip.expiredSpf") : m("body.chip.expired"), warn: true };
  return { text: m("body.chip.useBy", { date: thShort(u) }), warn: left <= 30 };
}

// everyM 0 = only with symptoms; never done = due now.
export function checkNext(c: Check, today: string): { due: boolean; next: string | null; label: string } {
  if (c.everyM === 0) return { due: false, next: null, label: m("body.check.symptoms") };
  if (!c.last) return { due: true, next: null, label: m("body.check.never") };
  const next = addMonths(c.last, c.everyM);
  return { due: next <= today, next, label: next <= today ? m("body.check.due") : m("body.check.next", { date: thShort(next), year: next.slice(0, 4) }) };
}

// Home threshold 135/85: the latest readings on 2 different dates are both at or above it (one per date, the last entered).
export function bpHigh(c: Check | undefined): boolean {
  const byDate = new Map<string, [number, number, string]>();
  for (const r of c?.bp ?? []) byDate.set(r[2], r);
  const last2 = [...byDate.values()].sort((a, b) => a[2].localeCompare(b[2])).slice(-2);
  return last2.length === 2 && last2.every((r) => r[0] >= 135 || r[1] >= 85);
}

export function shopList(care: Care, today: string): Product[] {
  return care.shelf.filter((p) => { if (p.done) return false; const u = useBy(p); return !!p.low || (!!u && daysBetween(today, u) <= 14); });
}

// On tasks last done at least twice their interval ago (never-done and postponed tasks are not overdue).
export function tasksOverdue2x(s: State, today: string): CareTask[] {
  return s.care.tasks.filter((t) => {
    const l = s.care.last[t.id], sn = s.care.snooze["t:" + t.id];
    return t.on && !!l && !(sn && sn >= today) && daysBetween(l, today) >= 2 * t.every;
  });
}

// Day 1-7 of an active patch test (no result yet), else null.
export function patchDay(p: Product, today: string): number | null {
  if (!p.patch || p.patch.res) return null;
  const k = daysBetween(p.patch.start, today) + 1;
  return k >= 1 && k <= 7 ? k : null;
}
