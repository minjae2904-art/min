// Round E core API (spec 8.3).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deviceLang, eitherStored, fill, getLang, isLang, isLangPref, langArr, langMap, langObj, langHeader, msgs, plural, reqLang, resolveLang,
  keepStored, setLang, stateLang, storedText, withLang, LANG_HEADER, type Tr,
} from "../../i18n/core";

const pack = {
  th: { "t.hello": "สวัสดี {name}", "t.items": "{n} รายการ", "t.only": "เฉพาะไทย", "t.empty": "ว่าง", "t.tip": "เริ่ม {stream} ถึง {stream-end+30}" },
  en: { "t.hello": "Hello {name}", "t.items": "{n|# item|# items}", "t.only": "", "t.empty": "  ", "t.tip": "Start {stream} to {stream-end+30}" } as Tr<{ "t.hello": string; "t.items": string; "t.only": string; "t.empty": string; "t.tip": string }>,
};
const m = msgs(pack);

describe("fill", () => {
  it("replaces vars and leaves unknown tokens verbatim", () => {
    expect(fill("en", "Hi {a}, {b}", { a: "A" })).toBe("Hi A, {b}");
    expect(fill("en", "{stream} - {stream-end+30} / {sleep}", { x: 1 })).toBe("{stream} - {stream-end+30} / {sleep}");
    expect(fill("en", "no vars {a}")).toBe("no vars {a}");
    expect(fill("en", "{ a } {} {1x} {a", { a: 1 })).toBe("{ a } {} {1x} {a");
  });
  it("plural forms in en (0/1/2) and Thai always takes the other form", () => {
    const t = "{n|# item|# items}";
    expect([0, 1, 2].map((n) => fill("en", t, { n }))).toEqual(["0 items", "1 item", "2 items"]);
    expect(fill("th", t, { n: 1 })).toBe("1 items");
  });
  it("string selectors: commas removed, decimals kept", () => {
    const t = "{n|# kg one|# kg other}";
    expect(fill("en", t, { n: "1" })).toBe("1 kg one");
    expect(fill("en", t, { n: "1.0" })).toBe("1.0 kg other");
    expect(fill("en", t, { n: "1,000" })).toBe("1,000 kg other");
    expect(fill("en", t, { n: "abc" })).toBe("abc kg other");
  });
  it("nested tokens and # inside a form; missing selector stays verbatim", () => {
    expect(fill("en", "{n|# set of {kg} kg|# sets of {kg} kg}", { n: 3, kg: 60 })).toBe("3 sets of 60 kg");
    expect(fill("en", "{n|one|other} left", { m: 1 })).toBe("{n|one|other} left");
  });
  it("plural helper", () => {
    expect(plural("en", 1, "a", "b")).toBe("a");
    expect(plural("en", 2, "a", "b")).toBe("b");
    expect(plural("th", 1, "a", "b")).toBe("b");
  });
});

describe("msgs", () => {
  it("ambient and explicit language; falls back to th, then to the key", () => {
    expect(m("t.hello", { name: "Krob" })).toBe("สวัสดี Krob");
    expect(m.in("en", "t.hello", { name: "Krob" })).toBe("Hello Krob");
    expect(withLang("en", () => m("t.items", { n: 2 }))).toBe("2 items");
    expect(withLang("en", () => m("t.only"))).toBe("เฉพาะไทย");
    expect(withLang("en", () => m("t.empty"))).toBe("ว่าง");
    expect(m.in("en", "t.nope" as "t.only")).toBe("t.nope");
    expect(m.has("t.only")).toBe(true);
    expect(m.has("t.nope")).toBe(false);
  });
  it("keeps fillTimes tokens in every language", () => {
    expect(m.in("en", "t.tip", { n: 1 })).toBe("Start {stream} to {stream-end+30}");
  });
});

describe("withLang / setLang", () => {
  it("restores after return, nesting and exceptions", () => {
    expect(getLang()).toBe("th");
    expect(withLang("en", () => [getLang(), withLang("th", () => getLang()), getLang()])).toEqual(["en", "th", "en"]);
    expect(() => withLang("en", () => { throw new Error("x"); })).toThrow("x");
    expect(getLang()).toBe("th");
  });
  it("throws on a thenable and still restores", () => {
    expect(() => withLang("en", () => Promise.resolve(1))).toThrow("withLang: fn must be synchronous");
    expect(getLang()).toBe("th");
  });
  it("setLang is a no-op without window", () => {
    setLang("en");
    expect(getLang()).toBe("th");
  });
});

describe("language-following values", () => {
  const arr = langArr(() => [{ id: "a", t: m("t.only") }, { id: "b", t: m("t.hello", { name: "x" }) }]);
  const map = langMap(() => new Map(arr.map((x) => [x.id, x])));
  const obj = langObj(() => ({ a: m("t.hello", { name: "o" }), fn: (x: number) => x + 1 }));
  it("langArr behaves like an array", () => {
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(2);
    expect(arr.map((x) => x.id)).toEqual(["a", "b"]);
    expect(arr.find((x) => x.id === "b")?.t).toBe("สวัสดี x");
    expect([...arr].length).toBe(2);
    expect(JSON.parse(JSON.stringify(arr))[1].t).toBe("สวัสดี x");
    expect(Object.entries(arr).map(([k]) => k)).toEqual(["0", "1"]);
    expect(arr).toEqual([{ id: "a", t: "เฉพาะไทย" }, { id: "b", t: "สวัสดี x" }]);
    expect(withLang("en", () => arr[1].t)).toBe("Hello x");
  });
  it("langMap behaves like a Map", () => {
    expect(map instanceof Map).toBe(true);
    expect(map.size).toBe(2);
    expect(map.get("b")?.t).toBe("สวัสดี x");
    expect(map.has("a")).toBe(true);
    const seen: string[] = [];
    for (const [k] of map) seen.push(k);
    expect(seen).toEqual(["a", "b"]);
    expect([...map.keys()]).toEqual(["a", "b"]);
    expect(withLang("en", () => map.get("b")?.t)).toBe("Hello x");
  });
  it("langObj keys/entries; own functions keep identity", () => {
    expect(Object.keys(obj)).toEqual(["a", "fn"]);
    expect(Object.entries(obj)[0]).toEqual(["a", "สวัสดี o"]);
    expect(withLang("en", () => obj.a)).toBe("Hello o");
    expect(obj.fn(1)).toBe(2);
    expect(obj.fn).toBe(obj.fn);
  });
  it("elements are cached per language and read-only", () => {
    expect(arr[0]).toBe(arr[0]);
    expect(withLang("en", () => arr[0])).not.toBe(arr[0]);
    expect(withLang("en", () => arr[0])).toBe(withLang("en", () => arr[0]));
    expect(Reflect.set(arr, 0, 1)).toBe(false);
    expect(Reflect.deleteProperty(obj, "a")).toBe(false);
    expect(Reflect.defineProperty(obj, "z", { value: 1 })).toBe(false);
    expect(() => { (arr as unknown as unknown[]).push(1); }).toThrow();
    expect(() => { (map as Map<string, unknown>).set("z", 1); }).toThrow();
    expect(() => { (map as Map<string, unknown>).clear(); }).toThrow();
    expect(map.size).toBe(2);
    expect(arr.length).toBe(2);
  });
});

describe("storedText", () => {
  const p = {
    th: { "s.a": "ล้างหน้า", "s.b": "กันแดด", "x.c": "อื่น" },
    en: { "s.a": "Cleanser", "s.b": "Sunscreen", "x.c": "Other" } as Tr<{ "s.a": string; "s.b": string; "x.c": string }>,
  };
  const st = storedText(p, "s.");
  it("resolves by the canonical th value only; user text unchanged", () => {
    expect(st("ล้างหน้า")).toBe("ล้างหน้า");
    expect(withLang("en", () => st("ล้างหน้า"))).toBe("Cleanser");
    expect(st("Sunscreen")).toBe("Sunscreen"); // equal to an en default, but user text
    expect(st.canon("ล้างหน้า")).toBe("ล้างหน้า");
    expect(st.canon("Cleanser")).toBe("Cleanser");
    expect(st.canon("my own")).toBe("my own");
    expect(withLang("en", () => st("อื่น"))).toBe("อื่น"); // outside the prefix
    expect(st.is("กันแดด")).toBe(true);
    expect(st.is("Sunscreen")).toBe(false);
    expect(st.is("Other")).toBe(false);
  });
  it("keepStored restores an untouched default per row; typed text is stored as typed", () => {
    expect(withLang("en", () => keepStored(st, "ล้างหน้า", "Cleanser"))).toBe("ล้างหน้า");
    expect(keepStored(st, "ล้างหน้า", "ล้างหน้า")).toBe("ล้างหน้า");
    expect(withLang("en", () => keepStored(st, "ล้างหน้า", "Cleanser gel"))).toBe("Cleanser gel");
    expect(keepStored(st, "Sunscreen", "Sunscreen")).toBe("Sunscreen"); // user text equal to an en default (th UI)
    expect(withLang("en", () => keepStored(st, undefined, "Sunscreen"))).toBe("Sunscreen"); // new row typed in en
    expect(keepStored(st, undefined, "abcdef", 3)).toBe("abc");
    expect(withLang("en", () => keepStored(st, "กันแดด", "Sunscreen", 3))).toBe("กันแดด"); // a default is never cut
  });
  it("eitherStored combines two disjoint resolvers", () => {
    const q = { th: { "n.x": "ใหม่" }, en: { "n.x": "New" } as Tr<{ "n.x": string }> };
    const both = eitherStored(st, storedText(q, "n."));
    expect(withLang("en", () => [both("ล้างหน้า"), both("ใหม่"), both("mine")])).toEqual(["Cleanser", "New", "mine"]);
    expect([both.canon("ใหม่"), both.is("ใหม่"), both.is("New")]).toEqual(["ใหม่", true, false]);
  });
});

describe("language selection", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("isLang / isLangPref", () => {
    expect([isLang("th"), isLang("en"), isLang("auto"), isLang("fr"), isLang(null)]).toEqual([true, true, false, false, false]);
    expect([isLangPref("auto"), isLangPref("en"), isLangPref("x")]).toEqual([true, true, false]);
  });
  it("resolveLang / stateLang", () => {
    expect(resolveLang("en", "th")).toBe("en");
    expect(resolveLang("auto", "en")).toBe("en");
    expect(resolveLang("auto", null)).toBe("th");
    expect(resolveLang(undefined, "zz")).toBe("th");
    expect(stateLang({ lang: "auto", langDev: "en" })).toBe("en");
    expect(stateLang({ lang: "th", langDev: "en" })).toBe("th");
    expect(stateLang(undefined)).toBe("th");
  });
  it("reqLang / langHeader", () => {
    expect(reqLang(new Request("http://x", { headers: { [LANG_HEADER]: "en" } }))).toBe("en");
    expect(reqLang(new Request("http://x", { headers: { [LANG_HEADER]: "fr" } }))).toBe("th");
    expect(reqLang(new Request("http://x"))).toBe("th");
    expect(withLang("en", () => langHeader())).toEqual({ "x-krob-lang": "en" });
  });
  it("deviceLang: th on the server even though Node has a navigator; device language with a window", () => {
    expect(typeof navigator).toBe("object");
    expect(deviceLang()).toBe("th");
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(deviceLang()).toBe("en");
    vi.stubGlobal("navigator", { language: "th-TH" });
    expect(deviceLang()).toBe("th");
    vi.stubGlobal("navigator", { language: "ja-JP" });
    expect(deviceLang()).toBe("en");
  });
});
