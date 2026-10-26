"use client";

// v1.8 morning readiness: the first glance tile during the morning window (spec 7) and its medium sheet.
// General wellness wording only; a tip changes the plan only on tap and every tip has undo.
import { BarRow, ProgressRing } from "@/components/Charts";
import { RollNum, Section, Sheet, toast } from "@/components/ui";
import { dayFor } from "@/lib/model";
import { READY_LABEL, applyReadyTip, snapReady, undoReady, type Ready, type ReadyTip } from "@/lib/ready";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { langArr, langObj, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-today";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

type Level = NonNullable<Ready["level"]>;
const TONE: Record<Level, string> = { high: "var(--success)", mid: "var(--accent)", low: "var(--warning)" }; // never red
const LEVEL_TEXT: Record<Level, string> = langObj(() => ({ high: m("readyTile.level.high"), mid: m("readyTile.level.mid"), low: m("readyTile.level.low") }));
const SORE: [0 | 1 | 2, string][] = langArr(() => [[0, m("readyTile.sore.0")], [1, m("readyTile.sore.1")], [2, m("readyTile.sore.2")]]);

export function ReadyTile({ r, date, open, onOpen, onClose }: { r: Ready; date: string; open: boolean; onOpen: () => void; onClose: () => void }) {
  const lv = r.level ?? "mid", score = r.score ?? 0;
  return (
    <>
      <button type="button" className="glance-tile" aria-label={m("readyTile.aria.tile", { score, level: LEVEL_TEXT[lv] })} onClick={onOpen}>
        <span className="glance-label">{m("readyTile.label")}</span>
        <span className="glance-art"><ProgressRing value={score / 100} size={32} width={5} tone={TONE[lv]} /></span>
        <span className="glance-value"><RollNum value={score} /></span>
        <span className="glance-sub">{LEVEL_TEXT[lv]}</span>
      </button>
      <Sheet open={open} title={m("readyTile.title")} detent="medium" onClose={onClose}>
        <ReadyBody r={r} date={date} />
      </Sheet>
    </>
  );
}

function ReadyBody({ r, date }: { r: Ready; date: string }) {
  const { s, update } = useStore();
  const lv = r.level ?? "mid", score = r.score ?? 0;
  const sore = s.days[date]?.sore;

  function setSore(k: 0 | 1 | 2) {
    play("tap");
    update((x) => { const d = dayFor(x, date); if (d.sore === k) delete d.sore; else d.sore = k; x.days[date] = d; });
  }
  function act(t: ReadyTip) {
    if (!t.act) return;
    const snap = snapReady(s, date);
    play("done");
    update((x) => applyReadyTip(x, date, t));
    toast(m("readyTile.toast.done", { act: t.act }), { action: c("undo"), onAction: () => { play("undo"); update((x) => undoReady(x, date, snap)); } });
  }

  return (
    <>
      <div className="ready-head">
        <ProgressRing value={score / 100} size={88} width={8} tone={TONE[lv]} label={m("readyTile.aria.ring", { score })}>
          <b className="num ready-num"><RollNum value={score} /></b>
        </ProgressRing>
        <div className="row-main">
          <div className="ready-level">{LEVEL_TEXT[lv]}</div>
          <div className="row-sub">{m("readyTile.from")}</div>
        </div>
      </div>

      <Section header={m("readyTile.parts")}>
        <div className="ready-parts">
          {r.parts.map((p) => <BarRow key={p.k} label={READY_LABEL[p.k]} value={p.score ?? 0} max={100} text={p.score === null ? m("readyTile.notLogged") : p.text} tone={p.score === null ? undefined : TONE[lv]} />)}
        </div>
      </Section>

      <Section>
        <div className="ready-sore">
          <span className="row-title fs-sub">{m("readyTile.sore")}</span>
          <div className="chips">
            {SORE.map(([k, label]) => <button key={k} type="button" className={`chip ${sore === k ? "on" : ""}`} aria-pressed={sore === k} onClick={() => setSore(k)}>{label}</button>)}
          </div>
        </div>
      </Section>

      {r.tip && (
        <div className="card ready-tip">
          <div className="prop-why">{r.tip.text}</div>
          {r.tip.act && <div className="prop-actions"><button type="button" className="chip prop-go" onClick={() => act(r.tip!)}>{r.tip.act}</button></div>}
        </div>
      )}

      <div className="section-footer">{m("readyTile.footer")}</div>
    </>
  );
}
