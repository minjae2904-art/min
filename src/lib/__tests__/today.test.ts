import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type DayLog } from "../model";
import { currentPhase } from "../phase";
import { itemsFor } from "../schedule";
import { TEMPLATES } from "../templates";
import { NOTICE_ORDER, arrangeNotices, nowVariant, quickScope, splitDone, type NoticeKey } from "../today";

const s = normalize({});
const date = "2026-10-20";
const day = (type: string, done: Record<string, number> = {}): DayLog => ({ type, done, waterMl: 0 });
// The pre-Round-B QuickLog filter, copied from QuickLog.tsx build().
const pending = (d: DayLog) => itemsFor(s.schedule, d, date).filter((x) => x.ring && !d.done[x.id] && x.kind !== "weigh");
const oldDue = (d: DayLog, nowMin: number) => pending(d).filter((i) => i.min <= nowMin + 30);
const opts = (d: DayLog, nowMin: number) => { const { phase } = currentPhase(s, d, nowMin, date); return { phaseKey: phase.key, phaseEnd: phase.end, nowMin }; };

describe("quickScope", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: due equals the old filter through the day`, () => {
      const d = day(t.id, { meal1: 1 });
      for (let m = at(8); m <= at(7, 59); m += 37) expect(quickScope(pending(d), "due", opts(d, m))).toEqual(oldDue(d, m));
    });
  }
  it("all keeps every item", () => {
    const d = day("balanced");
    expect(quickScope(pending(d), "all", opts(d, at(14)))).toEqual(pending(d));
  });
  it("phase runs to the end of the current phase", () => {
    const d = day("balanced");
    const o = opts(d, at(14));
    const got = quickScope(pending(d), "phase", o);
    expect(got).toEqual(pending(d).filter((i) => i.min <= Math.max(o.phaseEnd - 1, at(14, 30))));
    expect(got.every((i) => i.min < o.phaseEnd || i.min <= at(14, 30))).toBe(true);
  });
  it("phase uses now + 30 when the phase ends sooner", () => {
    const I = (id: string, min: number) => ({ id, min, title: id, kind: "habit" as const, ring: "habit" as const });
    const items = [I("a", at(14)), I("b", at(14, 20)), I("c", at(14, 40)), I("d", at(15))];
    expect(quickScope(items, "phase", { phaseKey: "x", phaseEnd: at(14, 10), nowMin: at(14) }).map((i) => i.id)).toEqual(["a", "b"]);
    expect(quickScope(items, "phase", { phaseKey: "x", phaseEnd: at(15), nowMin: at(13) }).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(quickScope(items, "phase", { phaseKey: "x", phaseEnd: at(15, 1), nowMin: at(13) }).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("the sleep phase behaves like due", () => {
    const I = (id: string, min: number) => ({ id, min, title: id, kind: "habit" as const, ring: "habit" as const });
    const items = [I("a", at(5)), I("b", at(5, 20)), I("c", at(6))];
    const o = { phaseKey: "sleep", phaseEnd: at(13) + 1440, nowMin: at(5) };
    expect(quickScope(items, "phase", o)).toEqual(quickScope(items, "due", o));
    expect(quickScope(items, "phase", o).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("arrangeNotices", () => {
  const N = (...keys: NoticeKey[]) => keys.map((key) => ({ key }));
  const keys = (r: { key: NoticeKey }[]) => r.map((n) => n.key);
  it("sorts by priority", () => {
    expect(keys(arrangeNotices(N("dnd", "health")).shown)).toEqual(["health", "dnd"]);
    expect(keys(arrangeNotices(N("voice", "stream")).shown)).toEqual(["stream", "voice"]);
    expect(NOTICE_ORDER).toEqual(["health", "stream", "intro", "dnd", "voice", "daymsg"]);
  });
  it("shows daymsg only when alone", () => {
    expect(keys(arrangeNotices(N("daymsg")).shown)).toEqual(["daymsg"]);
    expect(arrangeNotices(N("daymsg", "dnd"))).toEqual({ shown: [{ key: "dnd" }], more: [] });
    expect(arrangeNotices(N("daymsg", "dnd", "voice")).more).toEqual([]);
  });
  it("shows up to 2, else the first plus more", () => {
    expect(arrangeNotices([])).toEqual({ shown: [], more: [] });
    expect(keys(arrangeNotices(N("dnd", "voice")).shown)).toEqual(["dnd", "voice"]);
    const r = arrangeNotices(N("voice", "dnd", "health", "daymsg"));
    expect(keys(r.shown)).toEqual(["health"]);
    expect(keys(r.more)).toEqual(["dnd", "voice"]);
  });
  it("keeps the item objects", () => {
    const a = { key: "intro" as const, text: "x" };
    expect(arrangeNotices([a]).shown[0]).toBe(a);
  });
});

describe("nowVariant", () => {
  const v = (phaseKey: string, live: boolean, hasNext: boolean, pending: number) => nowVariant({ phaseKey, live, hasNext, pending });
  it("covers every case", () => {
    expect(v("work1", false, true, 3)).toBe("day");
    expect(v("live", true, true, 3)).toBe("live");
    expect(v("sleep", false, true, 1)).toBe("sleep");
    expect(v("sleep", true, true, 1)).toBe("sleep");
    expect(v("work1", false, false, 2)).toBe("over");
    expect(v("sleep", true, false, 2)).toBe("over");
    expect(v("work1", false, false, 0)).toBe("done");
    expect(v("live", true, false, 0)).toBe("done");
  });
});

describe("splitDone", () => {
  const I = (id: string, min: number, ring = true) => ({ id, min, title: id, kind: "habit" as const, ...(ring ? { ring: "habit" as const } : {}) });
  const list = [I("a", 600), I("info", 610, false), I("b", 620), I("c", 630), I("d", 640)];
  const ids = (l: { id: string }[]) => l.map((i) => i.id);
  it("moves done items out, keeping order", () => {
    const r = splitDone(list, { a: 1, c: 2 }, new Set());
    expect(ids(r.pending)).toEqual(["info", "b", "d"]);
    expect(ids(r.done)).toEqual(["a", "c"]);
  });
  it("keeps settling items in the pending area at their place", () => {
    const r = splitDone(list, { a: 1, c: 2, d: 3 }, new Set(["c"]));
    expect(ids(r.pending)).toEqual(["info", "b", "c"]);
    expect(ids(r.done)).toEqual(["a", "d"]);
  });
  it("ignores settling ids that are not done", () => {
    expect(ids(splitDone(list, {}, new Set(["b"])).pending)).toEqual(["a", "info", "b", "c", "d"]);
    expect(splitDone([], { a: 1 }, new Set()).done).toEqual([]);
  });
});
