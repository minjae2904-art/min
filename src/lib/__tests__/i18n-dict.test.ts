// Round E dictionary checks (spec 8.2) over every module in src/i18n/msg (filter: I18N_MODULES=lib-1,components).
import { describe, expect, it } from "vitest";
import { LANGS, type Msgs } from "../../i18n/core";
import { MODULES } from "../../i18n/msg";
import { STORED_SPECS } from "../../i18n/stored";

const THAI = /[฀-๿]/;
const KEY = /^[a-z][a-zA-Z0-9]*(\.[A-Za-z0-9_-]+)+$/;
const COMMON_KEY = /^[a-z][a-zA-Z0-9]*(\.[A-Za-z0-9_-]+)*$/; // common.ts holds single-word keys ("undo", "save")
const names = (v: string) => new Set([...v.matchAll(/\{([A-Za-z0-9_+-]+)/g)].map((x) => x[1]));
const balanced = (v: string) => { let d = 0; for (const ch of v) { if (ch === "{") d++; else if (ch === "}" && --d < 0) return false; } return d === 0; };

const only = process.env.I18N_MODULES?.split(",").map((x) => x.trim()).filter(Boolean);
const mods = Object.entries(MODULES).filter(([n]) => !only || only.includes(n));

describe("i18n dictionaries", () => {
  it("I18N_MODULES names exist", () => { expect((only ?? []).filter((n) => !(n in MODULES))).toEqual([]); });
  for (const [name, pack] of mods) {
    const dict = (l: string) => (pack as unknown as Record<string, Msgs>)[l];
    describe(name, () => {
      it("identical key sets in every language", () => {
        const th = Object.keys(pack.th).sort();
        for (const l of LANGS) expect(Object.keys(dict(l) ?? {}).sort(), l).toEqual(th);
      });
      it("valid key format (max 64 chars)", () => {
        const re = name === "common" ? COMMON_KEY : KEY;
        expect(Object.keys(pack.th).filter((k) => !re.test(k) || k.length > 64)).toEqual([]);
      });
      it("no empty values, no Thai outside th, balanced braces", () => {
        const bad: string[] = [];
        for (const l of LANGS) for (const [k, v] of Object.entries(dict(l) ?? {})) {
          if (typeof v !== "string" || !v.trim()) bad.push(`${l} ${k}: empty`);
          else if (l !== "th" && THAI.test(v)) bad.push(`${l} ${k}: Thai in ${JSON.stringify(v)}`);
          else if (!balanced(v)) bad.push(`${l} ${k}: unbalanced braces`);
        }
        expect(bad, bad.join("\n")).toEqual([]);
      });
      it("identical placeholder names per key", () => {
        const bad: string[] = [];
        for (const [k, v] of Object.entries(pack.th)) for (const l of LANGS) {
          const o = dict(l)?.[k];
          if (o === undefined) continue;
          const a = [...names(v)].sort().join(","), b = [...names(o)].sort().join(",");
          if (a !== b) bad.push(`${l} ${k}: {${a}} vs {${b}}`);
        }
        expect(bad, bad.join("\n")).toEqual([]);
      });
    });
  }
  // canon() must be deterministic: a value under the prefixes may only map to keys whose values agree in every language.
  for (const spec of STORED_SPECS) it(`stored resolver ${spec.name} is unambiguous`, () => {
    const pack = MODULES[spec.module] as unknown as Record<string, Msgs>;
    const keys = Object.keys(pack.th).filter((k) => spec.prefixes.some((p) => k.startsWith(p)));
    const byValue = new Map<string, Set<string>>();
    for (const l of LANGS) for (const k of keys) { const v = pack[l]?.[k]; if (v) byValue.set(v, (byValue.get(v) ?? new Set()).add(k)); }
    const bad: string[] = [];
    for (const [v, ks] of byValue) {
      if (ks.size < 2) continue;
      const list = [...ks];
      for (const l of LANGS) if (new Set(list.map((k) => pack[l]?.[k])).size > 1) { bad.push(`${JSON.stringify(v)} -> ${list.join(", ")} (differ in ${l})`); break; }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
