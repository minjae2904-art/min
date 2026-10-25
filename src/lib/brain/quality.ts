// Data quality of tick times (pure): how far the brain can trust tick delays. Window = the last 14 completed logged days.
import { addDays } from "../date";
import type { State } from "../model";
import { planEpoch, srcOf, untimedKind } from "../ticks";
import { T } from "./math";
import type { DataQuality, DaySig } from "./types";

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function dataQuality(s: State, sigs: DaySig[], today: string): DataQuality {
  const from = addDays(today, -14), to = addDays(today, -1);
  const days = sigs.filter((d) => d.logged && d.date >= from && d.date <= to);
  let ticks = 0, live = 0, confirmed = 0, late = 0, batch = 0, sum = 0;
  let checkins = 0, checkinOnTime = 0;
  for (const d of days) {
    const day = s.days[d.date];
    for (const i of d.items) {
      if (!(i.done > 1e12) || untimedKind(i.kind)) continue;
      const src = srcOf(day, i.id);
      ticks++; sum += i.tq;
      if (i.tq === 0) batch++;
      else if (src === "late") late++;
      else if (src) confirmed++;
      else live++;
    }
    // Check-in timing vs waking (info only, never part of level).
    const at = day?.checkin?.at;
    if (fin(at)) {
      const wake = fin(day.wakeAt) ? day.wakeAt : planEpoch(d.date, d.plannedWake);
      const delta = (at - wake) / 60_000;
      checkins++;
      if (delta >= -15 && delta <= T.checkinWinMin) checkinOnTime++;
    }
  }
  const tickTrust = ticks >= T.qualityMinTicks ? sum / ticks : null;
  const level = tickTrust === null ? null : tickTrust >= 0.8 ? "good" : tickTrust < T.trustMin ? "low" : "fair";
  return { ticks, live, confirmed, late, batch, tickTrust, checkins, checkinOnTime, checkinShare: checkins >= 3 ? checkinOnTime / checkins : null, level };
}
