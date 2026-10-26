"use client";

// React side of the i18n core. LangProvider sits inside StoreProvider (store.tsx); pages and Nav are additionally
// remounted on a switch by the keyed Fragment in AppShell Gate.
import { Fragment, createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { BASE, readUiLang, setLang, type Lang } from "./core";

const LangCtx = createContext<Lang>(BASE);
const UI = "krob-ui";

// lang null = store not ready: context "th" (matches SSR and hydration), no DOM writes. Sets the ambient language during
// render so lib code rendered below reads it; mirrors it to html[lang] and krob-ui.lang (merged: other keys are kept)
// for the BOOT script in layout.tsx.
export function LangProvider({ lang, children }: { lang: Lang | null; children: ReactNode }) {
  const l = lang ?? BASE;
  setLang(l);
  useEffect(() => {
    if (!lang) return;
    document.documentElement.lang = lang;
    try {
      let u: Record<string, unknown> = {};
      try { const v = JSON.parse(localStorage.getItem(UI) ?? "{}"); if (v && typeof v === "object" && !Array.isArray(v)) u = v; } catch {}
      if (u.lang !== lang) localStorage.setItem(UI, JSON.stringify({ ...u, lang }));
    } catch {}
  }, [lang]);
  return <LangCtx.Provider value={l}>{children}</LangCtx.Provider>;
}

// Current UI language; re-renders on a switch. Also the memo dependency for any text memo.
export const useLang = (): Lang => useContext(LangCtx);

// Outside the store (global-error): the language the app last ran in, "th" on the server and during hydration.
const noop = () => () => {};
export const useBootLang = (): Lang => useSyncExternalStore(noop, () => readUiLang() ?? BASE, () => BASE);

// Splits {name} tokens into keyed nodes: rich(m("statsView.gym.logged"), { num: <span className="num">{n}</span> }).
// Unknown tokens stay as text. Templates used with rich never contain plural forms.
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const p = text.split(/\{([A-Za-z][A-Za-z0-9_]*)\}/);
  if (p.length === 1) return text;
  return p.map((x, i) => (i % 2 === 0 ? x : x in nodes ? <Fragment key={i}>{nodes[x]}</Fragment> : `{${x}}`)).filter((x) => x !== "");
}
