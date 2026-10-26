// v1.8 weekly share card: privacy, real-data-only numbers, toggles and layout bounds.
import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { SHARE_DEFAULT, type ShareOpts, type State } from "../model";
import { SHARE_SIZE, shareData, shareLayout, shareTiles, type Box, type ShareData } from "../share";
import { TODAY, build } from "./brain-fixtures";

const ALL: ShareOpts = { fmt: "story", band: true, live: true, gym: true, weight: true, kg: true, sleep: true };
const NONE: ShareOpts = { fmt: "story", band: false, live: false, gym: false, weight: false, kg: false, sleep: false };

function seeded(): State {
  const s = build(14, (_d, i) => (i % 3 === 0 ? { tpl: "stream-gym" } : {}));
  for (let i = 0; i < 7; i++) {
    const d = s.days[addDays(TODAY, -i)];
    d.journal = { good: "SECRET_GOOD", fix: "SECRET_FIX", thanks: "SECRET_THANKS" };
    d.trade = { count: 1, result: "win", note: "SECRET_TRADE_NOTE" };
    (d.trade as Record<string, unknown>).pnl = 987654;
    d.live = { min: 300, n: 1, at: 0, end: 0, ok: 0, seen: 0, br: 0 };
  }
  s.profile.name = "SECRET_NAME";
  s.profile.identity = "SECRET_IDENTITY";
  s.schedule.templates = [{ id: "u-abc", name: "SECRET_TEMPLATE", from: "balanced" }];
  s.schedule.term = { start: addDays(TODAY, -20), end: addDays(TODAY, 60), cls: [{ id: "c1", d: 2, s: 600, e: 720, t: "SECRET_CLASS", r: "SECRET_ROOM" }] };
  return s;
}

const inside = (b: Box, [W, H]: readonly [number, number]) => b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= W && b.y + b.h <= H;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("share card data", () => {
  it("never carries journal, trade note, P&L, name, identity, template name or class title", () => {
    const txt = JSON.stringify([shareData(seeded(), TODAY, ALL), shareTiles(shareData(seeded(), TODAY, ALL))]);
    for (const k of ["SECRET", "987654"]) expect(txt).not.toContain(k);
  });
  it("live hours come from real live.min only and are omitted when none was recorded", () => {
    const s = build(10);
    expect(shareData(s, TODAY, ALL).liveH).toBeUndefined();
    s.days[TODAY].live = { min: 100, n: 1, at: 0, end: 0, ok: 0, seen: 0, br: 0 };
    s.days[addDays(TODAY, -1)].live = { min: 200, n: 1, at: 0, end: 0, ok: 0, seen: 0, br: 0 };
    s.days[addDays(TODAY, -7)].live = { min: 600, n: 1, at: 0, end: 0, ok: 0, seen: 0, br: 0 }; // outside the week
    expect(shareData(s, TODAY, ALL).liveH).toBe(5);
  });
  it("gym counts D-code workout days in the week", () => {
    const s = build(10, () => ({ tpl: "balanced" }));
    const n = new Set(s.workouts.filter((w) => w.date > addDays(TODAY, -7) && w.code.startsWith("D")).map((w) => w.date)).size;
    expect(n).toBeGreaterThan(0);
    expect(shareData(s, TODAY, ALL).gym).toBe(n);
  });
  it("weight: delta with 1 decimal, kg only when its toggle is on, nothing when weight is off", () => {
    const s = build(14);
    const on = shareData(s, TODAY, ALL).weight!;
    expect(on.pts.length).toBe(14);
    expect(on.delta).toBe(Math.round(on.delta! * 10) / 10);
    expect(on.kg).not.toBeNull();
    expect(shareData(s, TODAY, { ...ALL, kg: false }).weight!.kg).toBeNull();
    expect(shareData(s, TODAY, { ...ALL, weight: false }).weight).toBeUndefined();
    expect(shareData(s, TODAY, SHARE_DEFAULT).weight).toBeUndefined();
  });
  it("sleep needs 3 nights and rounds to 0.5 h", () => {
    const s = build(2);
    expect(shareData(s, TODAY, ALL).sleep).toBeUndefined();
    const t = build(8, () => ({ sleepH: 7.2 }));
    expect(shareData(t, TODAY, ALL).sleep).toBe(7);
  });
  it("respects each toggle; all off gives the range only", () => {
    const s = seeded();
    const d = shareData(s, TODAY, NONE);
    expect(Object.keys(d)).toEqual(["range"]);
    expect(shareData(s, TODAY, { ...NONE, band: true }).band?.cells.length).toBe(7);
    expect(Object.keys(shareData(s, TODAY, { ...NONE, gym: true }))).toEqual(["range", "gym"]);
  });
  it("tiles use Thai labels and units", () => {
    const d: ShareData = { range: "x", band: { key: "day", cells: [], hit: 5, elig: 6 }, liveH: 34.5, gym: 4, weight: { delta: 0.4, kg: null, pts: [70, 70.4] }, sleep: 7 };
    expect(shareTiles(d)).toEqual([
      { key: "band", label: "วันที่ดี", value: "5/6", unit: "วัน" },
      { key: "live", label: "ไลฟ์", value: "34.5", unit: "ชม." },
      { key: "gym", label: "ยิม", value: "4", unit: "ครั้ง" },
      { key: "weight", label: "น้ำหนัก", value: "+0.4", unit: "kg" },
      { key: "sleep", label: "นอนเฉลี่ย", value: "7", unit: "ชม." },
    ]);
    expect(shareTiles({ ...d, weight: { delta: -0.2, kg: 71.3, pts: [] } })[3]).toEqual({ key: "weight", label: "น้ำหนัก", value: "71.3", unit: "kg (-0.2)" });
  });
});

describe("share card layout", () => {
  const full = shareData(seeded(), TODAY, ALL);
  for (const fmt of ["story", "square"] as const) {
    it(`${fmt}: every box sits inside the canvas with 72 px margins and no overlaps`, () => {
      const L = shareLayout(fmt, full);
      expect(L.size).toEqual([...SHARE_SIZE[fmt]]);
      const boxes = [L.header, L.footer, ...(L.band ? [L.band] : []), ...(L.spark ? [L.spark] : []), ...L.tiles.map((t) => t.box)];
      expect(L.tiles.length).toBe(shareTiles(full).length);
      for (const b of boxes) { expect(inside(b, L.size)).toBe(true); expect(b.x).toBeGreaterThanOrEqual(72); expect(b.x + b.w).toBeLessThanOrEqual(L.size[0] - 72); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false);
    });
    it(`${fmt}: all toggles off gives header and footer only`, () => {
      const L = shareLayout(fmt, shareData(seeded(), TODAY, { ...NONE, fmt }));
      expect([L.band, L.spark, L.tiles.length]).toEqual([undefined, undefined, 0]);
      expect(inside(L.header, L.size) && inside(L.footer, L.size)).toBe(true);
    });
  }
  it("story shows the weight spark with 2+ points; square never does", () => {
    expect(shareLayout("story", full).spark).toBeDefined();
    expect(shareLayout("square", full).spark).toBeUndefined();
  });
});
