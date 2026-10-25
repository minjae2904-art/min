import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type DayLog } from "../model";
import { accessoryFor, blockColor, currentPhase, leftText, liveBlock, phases } from "../phase";
import { itemsFor, type Item } from "../schedule";
import { TEMPLATES } from "../templates";

const s = normalize({});
const day = (type: string, meal2?: "A" | "B" | "C", shiftMin = 0): DayLog => ({ type, meal2, shiftMin, done: {}, waterMl: 0 });
const keys = (d: DayLog) => phases(s, d).map((p) => p.key);

describe("phase tips with time tokens", () => {
  it("season tips use the built times", () => {
    const t = normalize({});
    t.schedule.taper = { start: "2026-10-26", fromMin: 180, stepMin: 30 };
    const tip = (key: string, type = "stream-gym", st = t, date = "2026-10-26") => phases(st, day(type), date).find((p) => p.key === key)!.tip;
    expect(tip("prep")).toContain("ไลฟ์ 22:00");
    expect(tip("fuel")).toContain("งดกาแฟหลัง 20:30");
    expect(tip("winddown")).toContain("นอน 04:30");
    expect(tip("prep", "stream-gym", s)).toContain("ไลฟ์ 19:00");
    expect(tip("rest", "stream-rest", s)).toContain("ก่อน 17:30 · มื้อเย็น 18:00");
    expect(tip("clips", "stream-marathon", s)).toContain("ไลฟ์ยาว 15:00-00:30");
    for (const type of ["stream-gym", "stream-mc", "stream-marathon", "stream-rest"]) for (const p of phases(t, day(type), "2026-10-26")) expect(p.tip).not.toMatch(/\{/);
  });
});

describe("phases", () => {
  for (const t of TEMPLATES) {
    for (const m of [undefined, "A", "B", "C"] as const) {
      for (const shift of [-60, 0, 120]) {
        it(`${t.id} / ${m ?? "-"} / ${shift} is contiguous from wake to wake`, () => {
          const d = day(t.id, m, shift);
          const list = phases(s, d);
          const wake = itemsFor(s.schedule, d).find((i) => i.id === "weigh")!.min;
          expect(list[0].start).toBe(wake);
          for (let i = 1; i < list.length; i++) expect(list[i].start).toBe(list[i - 1].end);
          expect(list.at(-1)?.key).toBe("sleep");
          expect(list.at(-1)?.end).toBe(wake + 1440);
          expect(new Set(list.map((p) => p.key)).size).toBe(list.length);
        });
      }
    }
  }
  it("legacy days keep the v1.0 lists", () => {
    expect(keys(day("work", "A"))).toEqual(["prep", "work1", "break", "work2", "commute", "gym", "recover", "sleep"]);
    expect(keys(day("off"))).toEqual(["morning", "move", "evening", "winddown", "sleep"]);
    expect(keys(day("work-plus"))).toEqual(keys(day("work")));
  });
  it("balanced follows its template order", () => {
    expect(keys(day("balanced"))).toEqual(["morning", "sing", "build", "fuel", "gym", "trade", "dinner", "game", "winddown", "sleep"]);
  });
  it("drops phases whose anchor is missing", () => {
    expect(phases(s, { ...day("balanced"), voiceRest: true }).map((p) => p.key)).not.toContain("sing");
    expect(keys(day("work-game", "C"))).toEqual(["prep", "work1", "commute", "game", "winddown", "sleep"]);
  });
  it("currentPhase finds the game block", () => {
    expect(currentPhase(s, day("balanced"), at(22), "2026-10-20").phase.key).toBe("game");
    expect(currentPhase(s, day("balanced"), at(21, 50), "2026-11-02").phase.key).toBe("dinner");
  });
});

describe("v1.4 season phases", () => {
  it("stream-gym and the marathon follow their template order", () => {
    expect(keys(day("stream-gym"))).toEqual(["morning", "sing", "clips", "midday", "trade", "gym", "fuel", "prep", "stream", "winddown", "sleep"]);
    expect(keys(day("stream-marathon"))).toEqual(["morning", "clips", "midday", "prep", "stream", "brb", "stream2", "winddown", "sleep"]);
  });
});

describe("phases ignore the today-only reschedule", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: identical with and without moved/skip`, () => {
      const d = day(t.id, t.work ? "A" : undefined);
      const items = itemsFor(s.schedule, d, "2026-10-26");
      const moved = Object.fromEntries(items.filter((i) => i.ring).map((i) => [i.id, Math.min(at(7, 59), i.min + 120)]));
      const skip = Object.fromEntries(items.filter((i) => i.ring).map((i) => [i.id, 1]));
      const plan = phases(s, d, "2026-10-26");
      expect(phases(s, { ...d, moved }, "2026-10-26")).toEqual(plan);
      expect(phases(s, { ...d, skip }, "2026-10-26")).toEqual(plan);
    });
  }
});

describe("live blocks and the accessory", () => {
  const I = (id: string, min: number, x: Partial<Item> = {}): Item => ({ id, min, title: id, kind: "habit", ...x });
  const stream = [I("stream", at(19), { kind: "stream", endAt: "stream-end", ring: "habit" }), I("stream-end", at(0, 30), { kind: "stream" })];
  const games = [I("game", at(21), { kind: "game", endAt: "game-stop" }), I("game-stop", at(3), { kind: "game", dur: 45 })];
  it("liveBlock finds the stream block, end exclusive", () => {
    expect(liveBlock(stream, at(18, 59))).toBeNull();
    expect(liveBlock(stream, at(19))).toMatchObject({ kind: "live", end: at(0, 30), item: { id: "stream" } });
    expect(liveBlock(stream, at(0, 29))?.kind).toBe("live");
    expect(liveBlock(stream, at(0, 30))).toBeNull();
  });
  it("liveBlock finds game blocks but never game-stop", () => {
    expect(liveBlock(games, at(22))).toMatchObject({ kind: "game", end: at(3), item: { id: "game" } });
    expect(liveBlock(games, at(3, 10))).toBeNull();
    expect(liveBlock([I("game1", at(15), { kind: "game", dur: 90 })], at(16))).toMatchObject({ kind: "game", end: at(16, 30) });
    expect(liveBlock([I("game1", at(15), { kind: "game", dur: 90 })], at(16, 30))).toBeNull();
  });
  it("liveBlock prefers the stream over a game at the same time", () => {
    expect(liveBlock([...games, ...stream].sort((a, b) => a.min - b.min), at(22))?.kind).toBe("live");
  });
  it("liveBlock returns null without blocks", () => {
    expect(liveBlock([I("meal1", at(13))], at(13))).toBeNull();
    expect(liveBlock([], at(13))).toBeNull();
  });
  const date = "2026-10-20";
  it("accessoryFor: live beats the phase", () => {
    const a = accessoryFor(s, day("stream-gym"), date, at(20));
    expect(a).toEqual({ kind: "live", label: "ไลฟ์", left: at(0, 30) - at(20), color: blockColor("live"), key: "stream" });
  });
  it("accessoryFor: falls back to the current phase", () => {
    const d = day("stream-gym");
    const c = currentPhase(s, d, at(14), date);
    expect(accessoryFor(s, d, date, at(14))).toEqual({ kind: "phase", label: c.phase.label, left: c.left, color: c.phase.color, key: c.phase.key });
  });
  it("accessoryFor: before wake is the sleep tail", () => {
    const d = day("stream-gym");
    const wake = itemsFor(s.schedule, d, date).find((i) => i.id === "weigh")!.min;
    const a = accessoryFor(s, d, date, at(8, 1));
    expect(a.kind).toBe("phase");
    expect(a.key).toBe("sleep");
    expect(a.left).toBe(wake - at(8, 1));
  });
  it("blockColor and leftText", () => {
    expect(blockColor("live")).toBe("var(--ph-live)");
    expect(blockColor("game")).toBe("var(--area-leisure)");
    expect(leftText(102)).toBe("1:42");
    expect(leftText(5)).toBe("0:05");
    expect(leftText(0)).toBe("0:00");
    expect(leftText(-3)).toBe("0:00");
    expect(leftText(600)).toBe("10:00");
  });
});
