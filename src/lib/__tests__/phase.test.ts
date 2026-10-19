import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize, type DayLog } from "../model";
import { currentPhase, phases } from "../phase";
import { itemsFor } from "../schedule";
import { TEMPLATES } from "../templates";

const s = normalize({});
const day = (type: string, meal2?: "A" | "B" | "C", shiftMin = 0): DayLog => ({ type, meal2, shiftMin, done: {}, waterMl: 0 });
const keys = (d: DayLog) => phases(s, d).map((p) => p.key);

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
