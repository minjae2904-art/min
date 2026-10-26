// v1.8 review fixes: onTimeRate is a share of ticks with a real time (batch bursts and seed ticks excluded).
import { describe, expect, it } from "vitest";
import { at } from "../date";
import { normalize } from "../model";
import { rangeStats } from "../stats";

const D = "2026-11-03";
const ts = (min: number) => new Date(D + "T00:00:00+07:00").getTime() + min * 60_000;

describe("rangeStats onTimeRate", () => {
  it("divides on-time ticks by timed ticks only", () => {
    const s = normalize({});
    const burst = ts(at(22));
    s.days[D] = { type: "term-gym", waterMl: 0, done: {
      weigh: ts(at(8, 5)), // on time
      meal1: ts(at(8, 55)), // 40 min late
      posture: 1, // seed, no real time
      meal2: burst, meal3: burst + 30_000, gym: burst + 60_000, // back-filled burst
    } };
    const r = rangeStats(s, D, 1);
    expect(r.timedN).toBe(2);
    expect(r.onTimeRate).toBe(0.5); // was 1/6 over every done tick
  });
  it("null without any timed tick", () => {
    const s = normalize({});
    s.days[D] = { type: "term-gym", waterMl: 0, done: { weigh: 1 } };
    expect(rangeStats(s, D, 1).onTimeRate).toBeNull();
  });
});
