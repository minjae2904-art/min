import { describe, expect, it } from "vitest";
import type { DayLog } from "../model";
import { CAD_RE, cadDue, cadLabel, daysBetween, parseCad, rampStage } from "../care/cadence";
import { stepsFor } from "../care/progress";
import type { Routine } from "../care/types";

describe("cadence", () => {
  it("d is always due, w follows the weekday, e counts from its start", () => {
    expect(cadDue("d", "2026-10-26", false)).toBe(true);
    expect(cadDue(undefined, "2026-10-26", false)).toBe(true);
    // 2026-10-26 is a Monday
    expect(cadDue("w:1,3,5", "2026-10-26", false)).toBe(true);
    expect(cadDue("w:1,3,5", "2026-10-27", false)).toBe(false);
    expect(cadDue("w:1,3,5", "2026-10-28", false)).toBe(true);
    expect(cadDue("e:2@2026-10-26", "2026-10-26", false)).toBe(true);
    expect(cadDue("e:2@2026-10-26", "2026-10-27", false)).toBe(false);
    expect(cadDue("e:2@2026-10-26", "2026-10-28", false)).toBe(true);
    expect(cadDue("e:3@2026-10-26", "2026-10-25", false)).toBe(false);
    expect(cadDue("e:3@2026-10-26", "2026-10-29", false)).toBe(true);
  });
  it("ramps every 3rd night, then every 2nd, then nightly", () => {
    const due = (k: number) => cadDue("r@2026-10-01", new Date(Date.UTC(2026, 9, 1 + k, 12)).toISOString().slice(0, 10), false);
    expect(due(-1)).toBe(false);
    expect(due(0)).toBe(true);
    expect(due(1)).toBe(false);
    expect(due(3)).toBe(true);
    expect(due(12)).toBe(true);
    expect(due(13)).toBe(false);
    expect(due(14)).toBe(true);
    expect(due(15)).toBe(false);
    expect(due(16)).toBe(true);
    expect(due(27)).toBe(false);
    expect(due(28)).toBe(true);
    expect(due(29)).toBe(true);
    expect([rampStage("2026-10-01", "2026-09-30"), rampStage("2026-10-01", "2026-10-01"), rampStage("2026-10-01", "2026-10-15"), rampStage("2026-10-01", "2026-10-29")]).toEqual([0, 1, 2, 3]);
  });
  it("h is due only on a hot day", () => {
    expect(cadDue("h", "2026-10-26", true)).toBe(true);
    expect(cadDue("h", "2026-10-26", false)).toBe(false);
  });
  it("invalid input falls back to daily", () => {
    for (const bad of ["x", "w:7", "e:1@2026-10-26", "e:2@26-10-2026", "r@", ""]) {
      expect(CAD_RE.test(bad)).toBe(false);
      expect(parseCad(bad)).toEqual({ t: "d" });
      expect(cadDue(bad, "2026-10-27", false)).toBe(true);
    }
  });
  it("counts days at noon UTC", () => {
    expect(daysBetween("2026-10-26", "2026-11-02")).toBe(7);
    expect(daysBetween("2026-10-26", "2026-10-25")).toBe(-1);
  });
  it("labels in Thai", () => {
    expect(cadLabel("d")).toBe("ทุกวัน");
    expect(cadLabel()).toBe("ทุกวัน");
    expect(cadLabel("h")).toBe("วันร้อน");
    expect(cadLabel("w:1,3,5")).toBe("จ/พ/ศ");
    expect(cadLabel("w:0,1,2,3,4,5,6")).toBe("ทุกวัน");
    expect(cadLabel("e:2@2026-10-26")).toBe("สลับคืน");
    expect(cadLabel("e:4@2026-10-26")).toBe("ทุก 4 วัน");
    expect(cadLabel("r@2026-10-26")).toBe("เริ่มช้าๆ");
  });
});

describe("stepsFor irritants", () => {
  const r: Routine = { id: "pm", name: "ก่อนนอน", anchor: { host: "night" }, remind: false, on: true, steps: [
    { id: "cl", title: "ล้างหน้า", tag: "face" },
    { id: "ret", title: "เรตินอยด์", tag: "face", irr: "ret", opt: true },
    { id: "bha", title: "BHA", tag: "face", irr: "bha", opt: true },
    { id: "vc", title: "วิตามินซี", tag: "face", irr: "vitc", opt: true },
    { id: "off", title: "ปิด", tag: "face", on: false },
  ] };
  const day: DayLog = { type: "stream-gym", done: {}, waterMl: 0 };
  it("drops off steps and keeps the first strong active when two are due", () => {
    const v = stepsFor(r, day, "2026-10-26", undefined);
    expect(v.map((x) => x.step.id)).toEqual(["cl", "ret", "bha", "vc"]);
    expect(v.find((x) => x.step.id === "ret")).toMatchObject({ due: true });
    expect(v.find((x) => x.step.id === "bha")).toMatchObject({ due: false, why: "conflict", first: "เรตินอยด์" });
    expect(v.find((x) => x.step.id === "vc")).toMatchObject({ due: true });
  });
  it("a strong active skipped tonight frees the slot for the next one", () => {
    const v = stepsFor(r, { ...day, care: { pm: "-ret" } }, "2026-10-26", undefined);
    expect(v.find((x) => x.step.id === "ret")).toMatchObject({ due: true, skipped: true });
    const bha = v.find((x) => x.step.id === "bha")!;
    expect(bha.due).toBe(true);
    expect(bha.why).toBeUndefined();
  });
  it("rests every irritant when the skin was irritated today or yesterday", () => {
    for (const [d, prev] of [[{ ...day, irr: true as const }, undefined], [day, { ...day, irr: true as const }]] as const) {
      const v = stepsFor(r, d, "2026-10-26", prev);
      expect(v.filter((x) => x.why === "rest-skin").map((x) => x.step.id)).toEqual(["ret", "bha", "vc"]);
      expect(v.find((x) => x.step.id === "cl")?.due).toBe(true);
    }
  });
});
