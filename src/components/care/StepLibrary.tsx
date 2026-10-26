"use client";

// Step library sheet (v1.7 spec 4.3): search, groups by tag, or free text. Picks go into the editor's draft only.
import { useState } from "react";
import { Section, Sheet } from "@/components/ui";
import { STEP_LIBRARY, TAG_LABEL } from "@/lib/care/presets";
import { TAGS, type Step, type Tag } from "@/lib/care/types";
import { play } from "@/lib/sound";
import { msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components-care";

const m = msgs(C);

export type LibPick = Pick<Step, "id" | "title" | "tag" | "hint" | "irr">;

export function StepLibrary({ open, onPick, onClose }: { open: boolean; onPick: (p: LibPick) => void; onClose: () => void }) {
  useLang();
  const [q, setQ] = useState("");
  const t = q.trim();
  // Search the displayed language; case-insensitive (a no-op for Thai, so Thai matching is unchanged).
  const lq = t.toLowerCase();
  const list = t ? STEP_LIBRARY.filter((x) => x.title.toLowerCase().includes(lq) || (x.hint ?? "").toLowerCase().includes(lq)) : STEP_LIBRARY;
  const groups = TAGS.map((tag) => [tag, list.filter((x) => x.tag === tag)] as [Tag, LibPick[]]).filter(([, l]) => l.length);
  const pick = (p: LibPick) => { play("done"); setQ(""); onPick(p); };
  return (
    <Sheet open={open} title={m("stepLibrary.title")} onClose={() => { setQ(""); onClose(); }}>
      <input className="field field--fill care-search" placeholder={m("stepLibrary.search")} maxLength={40} value={q} onChange={(e) => setQ(e.target.value)} />
      {t && (
        <Section>
          <button className="row" onClick={() => pick({ id: "", title: t.slice(0, 40), tag: "mind" })}>
            <span className="row-main row-title link">{m("stepLibrary.addCustom", { text: t.slice(0, 40) })}</span>
          </button>
        </Section>
      )}
      {groups.map(([tag, l]) => (
        <Section key={tag} header={TAG_LABEL[tag]}>
          {l.map((x) => (
            <button key={x.id} className="row" onClick={() => pick(x)}>
              <span className="row-main"><span className="row-title">{x.title}</span>{x.hint && <span className="row-sub">{x.hint}</span>}</span>
            </button>
          ))}
        </Section>
      ))}
    </Sheet>
  );
}
