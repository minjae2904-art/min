"use client";

// v1.8 "แผนช่วงเปิดเทอม": the term week preset with an optional sleep taper. Nothing changes without a tap; one undo
// restores weekPlan, planAsked and the taper. The body is shared by the Today notice sheet and the Settings sheet.
import { Sheet, toast } from "@/components/ui";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-term";
import * as Common from "@/i18n/msg/common";
import { startTermSeason, taperOffer } from "@/lib/actions";
import { thaiDate } from "@/lib/brain/copy";
import { hm, logicalDate } from "@/lib/date";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { TERM_PRESET } from "@/lib/templates";

const m = msgs(C), c = msgs(Common);

export function TermPlanBody({ close, onLater }: { close: () => void; onLater?: () => void }) {
  const { s, update } = useStore();
  const today = logicalDate();
  const term = s.schedule.term;
  const offer = taperOffer(s, today, 30, TERM_PRESET);
  const taper = offer && term && offer.doneDate < term.start ? offer : null;

  function apply(withTaper: boolean) {
    const prev = { weekPlan: [...s.settings.weekPlan], planAsked: s.settings.planAsked, taper: structuredClone(s.schedule.taper ?? null) };
    play("done");
    update((x) => { startTermSeason(x, today, withTaper); });
    toast(m("termPlan.toast.set", { tail: s.days[today] ? m("termPlan.toast.keep") : "" }), {
      action: c("undo"), onAction: () => update((x) => { x.settings.weekPlan = prev.weekPlan; x.settings.planAsked = prev.planAsked; x.schedule.taper = prev.taper; }),
    });
    close();
  }

  return (
    <div className="notice-sheet">
      <div className="sw-sub">{m("termPlan.body")}</div>
      {taper && <div className="sw-sub">{m("termPlan.taper", { start: thaiDate(taper.start), wake: hm(taper.firstWake), done: thaiDate(taper.doneDate) })}</div>}
      {s.days[today] && <div className="sw-sub">{m("termPlan.keepToday")}</div>}
      <div className="sw-actions">
        {taper && <button className="chip chip--fill" onClick={() => apply(true)}>{m("termPlan.btn.taper")}</button>}
        <button className={`chip ${taper ? "" : "chip--fill"}`} onClick={() => apply(false)}>{m("termPlan.btn.now")}</button>
        <button className="chip" onClick={() => { play("tap"); onLater?.(); close(); }}>{c("later")}</button>
      </div>
    </div>
  );
}

export function TermPlan({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title={m("termPlan.title")} detent="medium" onClose={onClose}>
      <TermPlanBody close={onClose} />
    </Sheet>
  );
}
