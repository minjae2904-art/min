// Date and number formatting for every language (spec section 4). `lang` defaults to the ambient language.
// ISO dates are read as local noon (like the legacy code); epoch inputs use the local zone. The Asia/Bangkok logic
// (logicalDate, wallClock, hm, TZ) stays in src/lib/date.ts. Name tables live in msg/fmt.ts (no Intl, so identical on
// every runtime); the Intl presets use LOCALE (th with the Gregorian calendar, so years read 2026).
import { getLang, msgs, type Lang } from "./core";
import * as F from "./msg/fmt";

const m = msgs(F);
type K = keyof typeof F.th;

export const LOCALE: Record<Lang, string> = { th: "th-TH-u-ca-gregory", en: "en-GB" };
// Presets whose legacy Thai output differs under gregory keep the legacy locale (recorded decision, spec section 4):
// dowClock ("พฤหัส 21:05", no " น.") and year ("พ.ศ. 2569"). Moving Thai to Gregorian years later = drop th here.
const LEGACY: Partial<Record<Lang, string>> = { th: "th-TH" };

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function dtf(locale: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `d|${locale}|${JSON.stringify(o)}`;
  let f = cache.get(k) as Intl.DateTimeFormat | undefined;
  if (!f) { f = new Intl.DateTimeFormat(locale, o); cache.set(k, f); }
  return f;
}
const noon = (iso: string) => new Date(iso + "T12:00:00");
const parts = (iso: string) => { const [, mo, d] = iso.split("-").map(Number); return { mo, d }; };
const inRange = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

export const dowShort = (dow: number, lang: Lang = getLang()) => (inRange(dow, 0, 6) ? m.in(lang, `fmt.dowShort.${dow}` as K) : "");
export const dowLong = (dow: number, lang: Lang = getLang()) => (inRange(dow, 0, 6) ? m.in(lang, `fmt.dowLong.${dow}` as K) : "");
export const monShort = (m1: number, lang: Lang = getLang()) => (inRange(m1, 1, 12) ? m.in(lang, `fmt.monShort.${m1}` as K) : "");
const dowDate = (dow: number, lang: Lang) => (inRange(dow, 0, 6) ? m.in(lang, `fmt.dowDate.${dow}` as K) : "");

// th "ศุกร์ 24 ต.ค."  en "Fri 24 Oct" (copy.thaiDate)
export const dateShort = (iso: string, lang: Lang = getLang()) => {
  const { mo, d } = parts(iso);
  return m.in(lang, "fmt.dateShort", { dow: dowDate(noon(iso).getDay(), lang), d, mon: monShort(mo, lang) });
};
// th "24 ต.ค."  en "24 Oct" (body.thShort, share.short, Charts.shortDate)
export const dayMonth = (iso: string, lang: Lang = getLang()) => { const { mo, d } = parts(iso); return m.in(lang, "fmt.dayMonth", { d, mon: monShort(mo, lang) }); };
// th "24-30 ต.ค." / "30 ต.ค.-5 พ.ย."  en "24-30 Oct" / "30 Oct-5 Nov" (copy.thaiRange)
export const range = (from: string, to: string, lang: Lang = getLang()) => {
  const a = parts(from), b = parts(to);
  return a.mo === b.mo
    ? m.in(lang, "fmt.range.same", { d1: a.d, d2: b.d, mon: monShort(b.mo, lang) })
    : m.in(lang, "fmt.range.cross", { d1: a.d, mon1: monShort(a.mo, lang), d2: b.d, mon2: monShort(b.mo, lang) });
};
// th "วันจันทร์ที่ 2 พฤศจิกายน"  en "Monday 2 November" (date.THAI_DATE)
export const dateLong = (iso: string, lang: Lang = getLang()) => dtf(LOCALE[lang], { weekday: "long", day: "numeric", month: "long" }).format(noon(iso));
// th "พฤศจิกายน"  en "November"
export const monthLong = (d: Date, lang: Lang = getLang()) => dtf(LOCALE[lang], { month: "long" }).format(d);
// th "พ.ศ. 2569" (legacy, see LEGACY)  en "2026"
export const year = (d: Date, lang: Lang = getLang()) => dtf(LEGACY[lang] ?? LOCALE[lang], { year: "numeric" }).format(d);
// "21:05" in both
export function clock(ms: number, lang: Lang = getLang()) { return dtf(LOCALE[lang], { hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); }
// th "พฤหัส 21:05" (legacy, see LEGACY)  en "Thu 21:05"
export const dowClock = (ms: number, lang: Lang = getLang()) => dtf(LEGACY[lang] ?? LOCALE[lang], { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
// th "5 พ.ย. 21:05" (= legacy toLocaleString th-TH day/month short/hour/minute)  en "5 Nov, 21:05". Month names come from
// the table so they match dayMonth (Intl en-GB would say "Sept").
export const dayMonthClock = (ms: number, lang: Lang = getLang()) => {
  const d = new Date(ms);
  return m.in(lang, "fmt.dayMonthClock", { d: d.getDate(), mon: monShort(d.getMonth() + 1, lang), time: clock(ms, lang) });
};

// "12,345.5" (replaces toLocaleString() / toLocaleString("en-US"))
export const num = (n: number, lang: Lang = getLang()) => {
  const k = `n|${LOCALE[lang]}`;
  let f = cache.get(k) as Intl.NumberFormat | undefined;
  if (!f) { f = new Intl.NumberFormat(LOCALE[lang]); cache.set(k, f); }
  return f.format(n);
};

// th "1 ชม. 30 น." / "1 ชม." / "45 น."  en "1 h 30 min" / "1 h" / "45 min" (legacy span())
export const dur = (min: number, lang: Lang = getLang()) => {
  if (min < 60) return m.in(lang, "fmt.dur.m", { m: min });
  const h = Math.floor(min / 60), r = min % 60;
  return r ? m.in(lang, "fmt.dur.hm", { h, m: r }) : m.in(lang, "fmt.dur.h", { h });
};
// th "1 ชั่วโมง 0 นาที" / "45 นาที"  en "1 hour 0 minutes" / "45 minutes" (Nav durText, aria labels)
export const durLong = (min: number, lang: Lang = getLang()) => {
  const h = Math.floor(min / 60), r = min % 60;
  return h ? m.in(lang, "fmt.durLong.hm", { h, m: r }) : m.in(lang, "fmt.durLong.m", { m: r });
};
