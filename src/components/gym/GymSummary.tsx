"use client";

// Session summary after "จบ": time, sets, volume, and per exercise the top set with next time's hint.
import { Section, Sheet } from "@/components/ui";
import { fmt, msgs } from "@/i18n";
import { gymExName } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-gym";
import type { Summary } from "@/lib/gymlog";

const m = msgs(C);

export function GymSummary({ sum, ticked, onClose }: { sum: Summary | null; ticked: boolean; onClose: () => void }) {
  return (
    <Sheet open={!!sum} title={sum ? m("gymSummary.title", { code: sum.code, label: sum.label }) : m("gymSummary.titleEmpty")} onClose={onClose}>
      {sum && (
        <>
          <div className="sheet-meta num">{m("gymSummary.meta", { min: sum.min, sets: sum.sets, vol: fmt.num(sum.vol), reps: sum.reps })}</div>
          <Section footer={ticked ? m("gymSummary.ticked") : m("gymSummary.saved")}>
            {sum.ex.map((e) => (
              <div key={e.id} className="row gs-row">
                <span className="row-main">
                  <span className="row-title">{gymExName(e.name)} <span className="num">{e.top}</span></span>
                  {e.hint && <span className="row-sub">{e.hint.text}</span>}
                </span>
                {e.pr && <span className="badge ok">{m("gymSummary.pr")}</span>}
              </div>
            ))}
          </Section>
          <button type="button" className="btn" onClick={onClose}>{m("gymSummary.done")}</button>
        </>
      )}
    </Sheet>
  );
}
