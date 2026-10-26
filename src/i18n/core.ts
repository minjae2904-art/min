// Krob i18n core (Round E). Pure and server-safe: no React, no imports from src/lib.
//
// Usage (full rules: spec sections 1-2):
//   import { msgs, withLang } from "../i18n";               // lib code (relative); components use "@/i18n"
//   import * as M from "../i18n/msg/lib-6";                 // one dictionary module per namespace: export th + en
//   const m = msgs(M);
//   m("reminders.brief.items", { n: 3 })                    // ambient language: th "{n} รายการ", en "{n|# item|# items}"
//   m.in("en", "reminders.brief.items", { n: 3 })           // explicit language (server, async code, canonical th)
//   withLang("en", () => dueReminders(s, now))              // run SYNCHRONOUS code in a language (server push, tests)
//   export const LABEL = langObj(() => ({ a: m("x.a") }));  // module-level text: built per language on first access
//   export const LIST = langArr(build); export const BY_ID = langMap(() => new Map(LIST.map((x) => [x.id, x])));
// Components: const lang = useLang() (from "@/i18n/react") and put `lang` in every text memo's deps.
// Interpolation: {name} -> vars.name; {n|# item|# items} -> plural form by Intl.PluralRules (# = the value);
// a token without a matching var (e.g. fillTimes "{stream}") stays verbatim. Lookup never throws:
// pack[lang][key] -> pack.th[key] -> key.

export const LANGS = ["th", "en"] as const; // adding a language = one member here + a dictionary per module
export type Lang = (typeof LANGS)[number];
export type LangPref = "auto" | Lang;
export const LANG_PREFS: readonly LangPref[] = ["auto", ...LANGS];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
export const isLangPref = (v: unknown): v is LangPref => v === "auto" || isLang(v);
export const BASE: Lang = "th"; // fallback language and the canonical language of stored defaults

// ---- ambient language ----
// Client: LangProvider sets it on every render (one user, one UI language). Server: always "th" unless inside withLang,
// which is synchronous by construction, so no request leaves a language set across an await.
let cur: Lang = BASE;
export const getLang = (): Lang => cur;
export function setLang(l: Lang): void { if (typeof window !== "undefined") cur = l; }
export function withLang<T>(l: Lang, fn: () => T): T {
  const prev = cur;
  cur = l;
  try {
    const r = fn();
    if (r && typeof (r as { then?: unknown }).then === "function") throw new Error("withLang: fn must be synchronous");
    return r;
  } finally { cur = prev; }
}

// Node 22 has a global navigator ("en-US"), so only `typeof window` tells the client from the server.
export function deviceLang(): Lang {
  if (typeof window === "undefined") return BASE;
  const p = String(globalThis.navigator?.language ?? "").toLowerCase().split("-")[0];
  return isLang(p) ? p : "en";
}
export const resolveLang = (pref: unknown, dev: unknown): Lang => (isLang(pref) ? pref : isLang(dev) ? dev : BASE);
export const stateLang = (settings: { lang?: unknown; langDev?: unknown } | undefined): Lang => resolveLang(settings?.lang, settings?.langDev);

export const LANG_HEADER = "x-krob-lang";
export const langHeader = (): Record<string, string> => ({ [LANG_HEADER]: getLang() }); // spread into every client fetch to /api
export const reqLang = (req: Request): Lang => { const v = req.headers.get(LANG_HEADER); return isLang(v) ? v : BASE; };
export function readUiLang(): Lang | null {
  if (typeof window === "undefined") return null;
  try { const u = JSON.parse(localStorage.getItem("krob-ui") || "{}"); return isLang(u?.lang) ? u.lang : null; } catch { return null; }
}

// ---- dictionaries ----
export type Msgs = Readonly<Record<string, string>>;
export type Tr<T extends Msgs> = { readonly [K in keyof T]: string }; // en must have exactly the th keys
export type Pack<T extends Msgs> = { readonly th: T } & { readonly [L in Exclude<Lang, "th">]: Tr<T> };
export type Vars = Readonly<Record<string, string | number>>;

const CATS = ["zero", "one", "two", "few", "many", "other"];
const rules = new Map<string, Intl.PluralRules>();
const pr = (lang: Lang, mfd = 0) => {
  const k = `${lang}:${mfd}`;
  let r = rules.get(k);
  if (!r) { r = new Intl.PluralRules(lang, mfd ? { minimumFractionDigits: mfd } : undefined); rules.set(k, r); }
  return r;
};
// Raw numbers as is; a formatted string drops grouping commas and keeps its decimals ("1.0" -> other in en).
function category(lang: Lang, v: string | number): string {
  if (typeof v === "number") return Number.isFinite(v) ? pr(lang).select(v) : "other";
  const s = v.replace(/,/g, "").trim(), n = Number(s);
  if (!s || !Number.isFinite(n)) return "other";
  return pr(lang, /\.(\d+)$/.exec(s)?.[1].length ?? 0).select(n);
}
function pick(lang: Lang, forms: string[], v: string | number): string {
  if (forms.length === 1) return forms[0];
  const cat = category(lang, v);
  if (forms.length === 2) return cat === "one" ? forms[0] : forms[1];
  const used = CATS.filter((c) => pr(lang).resolvedOptions().pluralCategories.includes(c as Intl.LDMLPluralRule));
  return forms[used.indexOf(cat)] ?? forms[forms.length - 1];
}
export const plural = (lang: Lang, n: number, one: string, other: string): string => (pr(lang).select(n) === "one" ? one : other);

type Token = { name: string; forms: string[] | null; end: number };
const NAME = /[A-Za-z][A-Za-z0-9_]*/y;
// {name} or {name|form|form...} starting at text[at] === "{"; forms may hold nested {x} tokens. null = not a token.
function token(text: string, at: number): Token | null {
  NAME.lastIndex = at + 1;
  const m = NAME.exec(text);
  if (!m) return null;
  let j = at + 1 + m[0].length;
  if (text[j] === "}") return { name: m[0], forms: null, end: j + 1 };
  if (text[j] !== "|") return null;
  const forms: string[] = [];
  let depth = 0, f = "";
  for (j++; j < text.length; j++) {
    const c = text[j];
    if (c === "{") depth++;
    else if (c === "}") { if (!depth) { forms.push(f); return { name: m[0], forms, end: j + 1 }; } depth--; }
    else if (c === "|" && !depth) { forms.push(f); f = ""; continue; }
    f += c;
  }
  return null;
}
export function fill(lang: Lang, text: string, vars?: Vars): string {
  if (!vars || !text.includes("{")) return text;
  let out = "", i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) { out += text.slice(i); break; }
    out += text.slice(i, open);
    const t = token(text, open);
    if (!t) { out += "{"; i = open + 1; continue; }
    const v = vars[t.name];
    if (v === undefined) out += text.slice(open, t.end);
    else if (!t.forms) out += String(v);
    else out += pick(lang, t.forms, v).split("#").map((p) => fill(lang, p, vars)).join(String(v));
    i = t.end;
  }
  return out;
}

function look(pack: Pack<Msgs>, lang: Lang, key: string): string {
  const v = (pack as unknown as Record<string, Msgs | undefined>)[lang]?.[key];
  return v && v.trim() ? v : pack.th[key] ?? key;
}
export type M<T extends Msgs> = {
  (key: keyof T & string, vars?: Vars): string; // ambient language
  in(lang: Lang, key: keyof T & string, vars?: Vars): string; // explicit language
  has(key: string): key is keyof T & string;
};
// Pass the module namespace: `import * as M from "../i18n/msg/lib-6"; const m = msgs(M);`
export function msgs<T extends Msgs>(pack: Pack<T>): M<T> {
  const p = pack as unknown as Pack<Msgs>;
  const m = ((key: string, vars?: Vars) => fill(cur, look(p, cur, key), vars)) as M<T>;
  m.in = (lang, key, vars) => fill(lang, look(p, lang, key), vars);
  m.has = (key): key is keyof T & string => Object.prototype.hasOwnProperty.call(p.th, key);
  return m;
}

// ---- language-following values ----
// A read-only Proxy over an empty target of the right kind ([] / Map / {}), so Array.isArray and instanceof Map hold.
// The value for each language is built once, under withLang(lang, build), and cached. Never mutate it or its elements.
// structuredClone(proxy) throws: clone an element, or spread the array first.
function follow<T extends object>(target: T, build: () => T): T {
  const cache = new Map<Lang, T>();
  const real = (): T => { const l = cur; let v = cache.get(l); if (!v) { v = withLang(l, build); cache.set(l, v); } return v; };
  const own = Object.prototype.hasOwnProperty, isArr = Array.isArray(target), isMap = target instanceof Map;
  const ro = () => { throw new TypeError("language-following value is read-only"); };
  return new Proxy(target, {
    get(_, k) {
      const r = real();
      // Map members need the real Map as receiver (Map.prototype.size throws on a Proxy); its mutators throw.
      if (isMap) { if (k === "set" || k === "delete" || k === "clear") return ro; const v = Reflect.get(r, k, r); return typeof v === "function" ? v.bind(r) : v; }
      const v = Reflect.get(r, k, r);
      // Array methods run against the proxy itself, so push/sort/splice hit the read-only traps instead of the cache.
      return typeof v === "function" && !isArr && !own.call(r, k) ? v.bind(r) : v;
    },
    has: (_, k) => Reflect.has(real(), k),
    ownKeys: () => Reflect.ownKeys(real()),
    getOwnPropertyDescriptor(_, k) {
      const d = Reflect.getOwnPropertyDescriptor(real(), k);
      return !d || (Array.isArray(target) && k === "length") ? d : { ...d, configurable: true };
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}
export const langArr = <T>(build: () => T[]): T[] => follow<T[]>([], build);
export const langMap = <K, V>(build: () => Map<K, V>): ReadonlyMap<K, V> => follow<Map<K, V>>(new Map(), build);
export const langObj = <T extends object>(build: () => T): T => follow<T>({} as T, build);

// ---- stored built-in defaults (spec section 7) ----
// Resolves a value v1.7/v1.8 copied into state by VALUE: equal to a built-in default in the canonical language (th) ->
// that default in the current language (call); anything else is user text and comes back unchanged. Only th is indexed,
// so user text that happens to equal an English default (e.g. "Bench press") is never treated as built-in. canon/is see
// th values only; editors restore untouched defaults per row with keepStored.
export type Stored = ((stored: string) => string) & { canon(stored: string): string; is(stored: string): boolean };
export function storedText<T extends Msgs>(pack: Pack<T>, prefix: string | readonly string[]): Stored {
  const p = pack as unknown as Pack<Msgs>, pre = typeof prefix === "string" ? [prefix] : prefix;
  let idx: Map<string, string> | null = null;
  const keyOf = (stored: string) => {
    if (!idx) {
      idx = new Map();
      for (const [k, v] of Object.entries(p[BASE] ?? {})) if (v && pre.some((x) => k.startsWith(x)) && !idx.has(v)) idx.set(v, k);
    }
    return typeof stored === "string" ? idx.get(stored) : undefined;
  };
  const f = ((stored: string) => { const k = keyOf(stored); return k ? look(p, cur, k) : stored; }) as Stored;
  f.canon = (stored) => { const k = keyOf(stored); return k ? look(p, BASE, k) : stored; };
  f.is = (stored) => keyOf(stored) !== undefined;
  return f;
}
// One resolver over two disjoint sets of defaults (e.g. preset names + an editor default name).
export function eitherStored(a: Stored, b: Stored): Stored {
  const f = ((x: string) => (a.is(x) ? a(x) : b(x))) as Stored;
  f.canon = (x) => (a.is(x) ? a.canon(x) : b.canon(x));
  f.is = (x) => a.is(x) || b.is(x);
  return f;
}
// Writer side, per row: orig is the row's stored value when the editor opened (or the th default a new row starts
// from). It comes back when it is a built-in default and the draft still shows its display text; otherwise the draft is
// stored exactly as typed (capped at max). An untouched default saved in any language stays canonical; typed text never maps.
export const keepStored = (f: Stored, orig: string | undefined, draft: string, max = Infinity): string =>
  orig !== undefined && f.is(orig) && draft === f(orig) ? orig : draft.slice(0, max);
