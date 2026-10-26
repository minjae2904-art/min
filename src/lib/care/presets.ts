// Self-care presets: slot routines, pack steps, levels, periodic tasks, health checks and the step library (pure data).
// General wellness wording only: no brands, no drug strengths; pharmacy-only items say "ตามที่เภสัชกรแนะนำ".
import { langArr, langObj, msgs, withLang } from "../../i18n";
import * as M from "../../i18n/msg/lib-care";
import type { Check, Level, Routine, Step, Tag } from "./types";

const m = msgs(M);
// Text follows the UI language (langArr/langObj: built per language on first access, read-only). Writers that copy
// these into state run under withLang("th", ...) so stored defaults stay canonical (spec section 7).

export type SlotId = "am" | "gym" | "prep" | "pm";
export const SLOTS: { id: SlotId; name: string; anchor: Routine["anchor"] }[] = langArr(() => [
  { id: "am", name: m("presets.slot.am"), anchor: { item: ["weigh"], off: 10 } },
  { id: "gym", name: m("presets.slot.gym"), anchor: { item: ["gym", "cardio"], off: 5, end: true } },
  { id: "prep", name: m("presets.slot.prep"), anchor: { host: "stream-prep" } },
  { id: "pm", name: m("presets.slot.pm"), anchor: { host: "night" } },
]);
// A fresh slot routine: off and empty until a level or pack adds steps. Reminders default off (host rows keep their own).
// The stored name is the canonical th default (displayed through careRoutineName).
export const slotRoutine = (id: SlotId): Routine => {
  const s = withLang("th", () => SLOTS.find((x) => x.id === id)!);
  return { id, name: s.name, anchor: structuredClone(s.anchor), remind: false, on: false, steps: [] };
};

export const LEVEL_RANK: Record<Level, number> = { lite: 0, std: 1, full: 2 };
export const LEVEL_LABEL: Record<Level, string> = langObj(() => ({ lite: m("presets.level.lite"), std: m("presets.level.std"), full: m("presets.level.full") }));
export const LEVEL_SUMMARY: Record<Level, string> = langObj(() => ({
  lite: m("presets.levelSummary.lite"),
  std: m("presets.levelSummary.std"),
  full: m("presets.levelSummary.full"),
}));

// A pack step: lvl = lowest level that turns it on; req = levels where it is required (omitted = required at every level;
// [] = always optional). Steps of opt-in packs ignore lvl.
export type PackStep = { slot: SlotId; step: Step; lvl: Level; req?: Level[] };
const ALL: Level[] = ["lite", "std", "full"];
const ps = (slot: SlotId, step: Step, lvl: Level, req?: Level[]): PackStep => ({ slot, step, lvl, ...(req ? { req } : {}) });
const OPT: Level[] = [];

// The prep steps are shared objects: PACK_STEPS and PRELIVE hold the same step per language.
const PREP = langObj((): Record<"set" | "post" | "warm" | "bt", Step> => ({
  set: { id: "set", title: m("presets.step.prep.set.title"), tag: "mind", pack: "prep" },
  post: { id: "post", title: m("presets.step.prep.post.title"), tag: "mind", pack: "prep" },
  warm: { id: "warm", title: m("presets.step.prep.warm.title"), tag: "voice", min: 10, hint: m("presets.step.prep.warm.hint"), pack: "prep" },
  bt: { id: "bt", title: m("presets.step.prep.bt.title"), tag: "water", pack: "prep" },
}));

// Preset order per slot = the order steps appear in a routine.
export const PACK_STEPS: PackStep[] = langArr(() => [
  ps("am", { id: "cl", title: m("presets.step.am.cl.title"), tag: "face", min: 2, pack: "face-am" }, "std", ["std", "full"]),
  ps("am", { id: "nia", title: m("presets.step.am.nia.title"), tag: "face", pack: "acne" }, "lite", OPT),
  ps("am", { id: "mo", title: m("presets.step.am.mo.title"), tag: "face", pack: "face-am" }, "std", OPT),
  ps("am", { id: "spf", title: m("presets.step.am.spf.title"), tag: "face", hint: m("presets.step.am.spf.hint"), pack: "face-am" }, "lite", ALL),
  ps("am", { id: "lip", title: m("presets.step.am.lip.title"), tag: "oral", pack: "face-am" }, "std", OPT),
  ps("am", { id: "deo", title: m("presets.step.am.deo.title"), tag: "body", pack: "face-am" }, "full", OPT),
  ps("am", { id: "br", title: m("presets.step.am.br.title"), tag: "oral", min: 2, hint: m("presets.step.am.br.hint"), pack: "teeth" }, "lite", ALL),

  ps("gym", { id: "sh", title: m("presets.step.gym.sh.title"), tag: "body", hint: m("presets.step.gym.sh.hint"), pack: "gym" }, "std"),
  ps("gym", { id: "dry", title: m("presets.step.gym.dry.title"), tag: "body", pack: "gym" }, "std"),
  ps("gym", { id: "bpw", title: m("presets.step.gym.bpw.title"), tag: "body", cad: "w:1,3,5", irr: "bp", hint: m("presets.step.gym.bpw.hint"), pack: "acne" }, "lite", OPT),
  ps("gym", { id: "ld", title: m("presets.step.gym.ld.title"), tag: "body", pack: "gym" }, "std", OPT),
  ps("gym", { id: "el", title: m("presets.step.gym.el.title"), tag: "water", cad: "h", hint: m("presets.step.gym.el.hint"), pack: "gym" }, "std", OPT),

  ps("prep", PREP.set, "std"),
  ps("prep", PREP.post, "std"),
  ps("prep", PREP.warm, "std"),
  ps("prep", PREP.bt, "std"),
  ps("prep", { id: "vol", title: m("presets.step.prep.vol.title"), tag: "eye", pack: "prep" }, "std", OPT),
  ps("prep", { id: "lt", title: m("presets.step.prep.lt.title"), tag: "eye", pack: "prep" }, "std", OPT),

  ps("pm", { id: "dim", title: m("presets.step.pm.dim.title"), tag: "mind", pack: "wind" }, "std", OPT),
  ps("pm", { id: "sh", title: m("presets.step.pm.sh.title"), tag: "body", pack: "face-pm" }, "lite"),
  ps("pm", { id: "cl", title: m("presets.step.pm.cl.title"), tag: "face", hint: m("presets.step.pm.cl.hint"), pack: "face-pm" }, "lite"),
  ps("pm", { id: "ret", title: m("presets.step.pm.ret.title"), tag: "face", cad: "r@2026-01-01", irr: "ret", hint: m("presets.step.pm.ret.hint"), pack: "acne" }, "lite", OPT),
  ps("pm", { id: "bha", title: m("presets.step.pm.bha.title"), tag: "face", cad: "w:2,6", irr: "bha", pack: "acne" }, "lite", OPT),
  ps("pm", { id: "mo", title: m("presets.step.pm.mo.title"), tag: "face", pack: "face-pm" }, "std"),
  ps("pm", { id: "lip", title: m("presets.step.pm.lip.title"), tag: "oral", pack: "face-pm" }, "full", OPT),
  ps("pm", { id: "ap", title: m("presets.step.pm.ap.title"), tag: "body", pack: "face-pm" }, "full", OPT),
  ps("pm", { id: "bl", title: m("presets.step.pm.bl.title"), tag: "body", pack: "face-pm" }, "full", OPT),
  ps("pm", { id: "br", title: m("presets.step.pm.br.title"), tag: "oral", min: 2, pack: "teeth" }, "lite"),
  ps("pm", { id: "fl", title: m("presets.step.pm.fl.title"), tag: "oral", pack: "teeth" }, "std", OPT),
  ps("pm", { id: "desk", title: m("presets.step.pm.desk.title"), tag: "move", min: 5, pack: "wind" }, "full", OPT),
  ps("pm", { id: "brth", title: m("presets.step.pm.brth.title"), tag: "mind", min: 3, hint: m("presets.step.pm.brth.hint"), pack: "wind" }, "full", OPT),
  ps("pm", { id: "jr", title: m("presets.step.pm.jr.title"), tag: "mind", act: "journal", pack: "wind" }, "std", OPT),
]);

// Pre-live checklist (Live mode): the same step objects as the prep pack, all required. Ticks live in DayLog.care.prep.
export const PRELIVE: Step[] = langArr(() => [PREP.set, PREP.post, PREP.warm, PREP.bt]);

export const PACKS: { id: string; name: string; desc: string; optIn?: true }[] = langArr(() => [
  { id: "face-am", name: m("presets.pack.face-am.name"), desc: m("presets.pack.face-am.desc") },
  { id: "teeth", name: m("presets.pack.teeth.name"), desc: m("presets.pack.teeth.desc") },
  { id: "prep", name: m("presets.pack.prep.name"), desc: m("presets.pack.prep.desc") },
  { id: "gym", name: m("presets.pack.gym.name"), desc: m("presets.pack.gym.desc") },
  { id: "wind", name: m("presets.pack.wind.name"), desc: m("presets.pack.wind.desc") },
  { id: "face-pm", name: m("presets.pack.face-pm.name"), desc: m("presets.pack.face-pm.desc") },
  { id: "acne", name: m("presets.pack.acne.name"), desc: m("presets.pack.acne.desc"), optIn: true },
  { id: "week", name: m("presets.pack.week.name"), desc: m("presets.pack.week.desc") },
  { id: "extra", name: m("presets.pack.extra.name"), desc: m("presets.pack.extra.desc") },
  { id: "humid", name: m("presets.pack.humid.name"), desc: m("presets.pack.humid.desc"), optIn: true },
]);
export const LEVEL_PACKS: Record<Level, string[]> = {
  lite: ["face-am", "teeth", "face-pm"],
  std: ["face-am", "teeth", "face-pm", "prep", "gym", "wind", "week"],
  full: ["face-am", "teeth", "face-pm", "prep", "gym", "wind", "week", "extra"],
};
export const OPT_IN_PACKS = ["acne", "humid"];

export type TaskPreset = { id: string; title: string; tag: Tag; every: number; pack: string; lvl: Level; hint?: string; off?: true /* created off */ };
export const TASK_PRESETS: TaskPreset[] = langArr(() => [
  { id: "nailh", title: m("presets.task.nailh.title"), tag: "body", every: 7, pack: "week", lvl: "std" },
  { id: "nailf", title: m("presets.task.nailf.title"), tag: "body", every: 21, pack: "week", lvl: "std" },
  { id: "pillow", title: m("presets.task.pillow.title"), tag: "face", every: 7, pack: "week", lvl: "std" },
  { id: "pads", title: m("presets.task.pads.title"), tag: "eye", every: 7, pack: "week", lvl: "std" },
  { id: "sheet", title: m("presets.task.sheet.title"), tag: "body", every: 14, pack: "week", lvl: "std" },
  { id: "brush", title: m("presets.task.brush.title"), tag: "oral", every: 90, pack: "teeth", lvl: "std" },
  { id: "towel", title: m("presets.task.towel.title"), tag: "body", every: 4, pack: "extra", lvl: "full" },
  { id: "keys", title: m("presets.task.keys.title"), tag: "body", every: 30, pack: "extra", lvl: "full" },
  { id: "mole", title: m("presets.task.mole.title"), tag: "body", every: 30, pack: "extra", lvl: "full" },
  { id: "blade", title: m("presets.task.blade.title"), tag: "hair", every: 14, pack: "extra", lvl: "full" },
  { id: "hair", title: m("presets.task.hair.title"), tag: "hair", every: 90, pack: "extra", lvl: "full", off: true },
  { id: "keto", title: m("presets.task.keto.title"), tag: "body", every: 21, pack: "humid", lvl: "lite", hint: m("presets.task.keto.hint") },
  { id: "dand", title: m("presets.task.dand.title"), tag: "hair", every: 3, pack: "humid", lvl: "lite", off: true },
]);

// Created on the first level choice. everyM 0 = only when there are symptoms.
export const CHECK_DEFAULTS: Check[] = langArr(() => [
  { id: "annual", name: m("presets.check.annual.name"), everyM: 12, note: m("presets.check.annual.note") },
  { id: "bp", name: m("presets.check.bp.name"), everyM: 12 },
  { id: "dent", name: m("presets.check.dent.name"), everyM: 6 },
  { id: "lab", name: m("presets.check.lab.name"), everyM: 12, note: m("presets.check.lab.note") },
  { id: "vitd", name: m("presets.check.vitd.name"), everyM: 0 },
  { id: "eye", name: m("presets.check.eye.name"), everyM: 24 },
  { id: "ear", name: m("presets.check.ear.name"), everyM: 0 },
]);

export const TAG_LABEL: Record<Tag, string> = langObj(() => ({
  face: m("presets.tag.face"), body: m("presets.tag.body"), oral: m("presets.tag.oral"), hair: m("presets.tag.hair"), eye: m("presets.tag.eye"),
  voice: m("presets.tag.voice"), move: m("presets.tag.move"), mind: m("presets.tag.mind"), water: m("presets.tag.water"),
}));

// Steps the editor can add (grouped by tag in the UI). Ids are library ids; the editor makes them unique per routine.
export const STEP_LIBRARY: Pick<Step, "id" | "title" | "tag" | "hint" | "irr">[] = langArr(() => [
  { id: "fcl", title: m("presets.lib.fcl.title"), tag: "face" },
  { id: "fcl2", title: m("presets.lib.fcl2.title"), tag: "face", hint: m("presets.lib.fcl2.hint") },
  { id: "fmo", title: m("presets.lib.fmo.title"), tag: "face" },
  { id: "fspf", title: m("presets.lib.fspf.title"), tag: "face", hint: m("presets.lib.fspf.hint") },
  { id: "fnia", title: m("presets.lib.fnia.title"), tag: "face" },
  { id: "fret", title: m("presets.lib.fret.title"), tag: "face", irr: "ret", hint: m("presets.lib.fret.hint") },
  { id: "fbha", title: "BHA", tag: "face", irr: "bha" },
  { id: "fspot", title: m("presets.lib.fspot.title"), tag: "face" },
  { id: "fsw", title: m("presets.lib.fsw.title"), tag: "face" },
  { id: "fpick", title: m("presets.lib.fpick.title"), tag: "face" },
  { id: "bsh", title: m("presets.lib.bsh.title"), tag: "body" },
  { id: "bdry", title: m("presets.lib.bdry.title"), tag: "body", hint: m("presets.lib.bdry.hint") },
  { id: "bchg", title: m("presets.lib.bchg.title"), tag: "body" },
  { id: "bbpw", title: m("presets.lib.bbpw.title"), tag: "body", irr: "bp", hint: m("presets.lib.bbpw.hint") },
  { id: "blot", title: m("presets.lib.blot.title"), tag: "body" },
  { id: "bap", title: m("presets.lib.bap.title"), tag: "body" },
  { id: "bdeo", title: m("presets.lib.bdeo.title"), tag: "body" },
  { id: "bspf", title: m("presets.lib.bspf.title"), tag: "body", hint: m("presets.lib.bspf.hint") },
  { id: "obr", title: m("presets.lib.obr.title"), tag: "oral" },
  { id: "ofl", title: m("presets.lib.ofl.title"), tag: "oral" },
  { id: "orin", title: m("presets.lib.orin.title"), tag: "oral" },
  { id: "olip", title: m("presets.lib.olip.title"), tag: "oral" },
  { id: "ovas", title: m("presets.lib.ovas.title"), tag: "oral" },
  { id: "hwash", title: m("presets.lib.hwash.title"), tag: "hair" },
  { id: "hdand", title: m("presets.lib.hdand.title"), tag: "hair", hint: m("presets.lib.hdand.hint") },
  { id: "hscal", title: m("presets.lib.hscal.title"), tag: "hair" },
  { id: "hshav", title: m("presets.lib.hshav.title"), tag: "hair" },
  { id: "ebt", title: m("presets.lib.ebt.title"), tag: "water" },
  { id: "evol", title: m("presets.lib.evol.title"), tag: "eye" },
  { id: "elt", title: m("presets.lib.elt.title"), tag: "eye" },
  { id: "ebrb", title: m("presets.lib.ebrb.title"), tag: "eye" },
  { id: "vsip", title: m("presets.lib.vsip.title"), tag: "voice" },
  { id: "vrest", title: m("presets.lib.vrest.title"), tag: "voice" },
  { id: "mstr", title: m("presets.lib.mstr.title"), tag: "move" },
  { id: "mwalk", title: m("presets.lib.mwalk.title"), tag: "move" },
  { id: "msun", title: m("presets.lib.msun.title"), tag: "move" },
  { id: "ndim", title: m("presets.lib.ndim.title"), tag: "mind" },
  { id: "nchat", title: m("presets.lib.nchat.title"), tag: "mind" },
  { id: "nbr", title: m("presets.lib.nbr.title"), tag: "mind" },
  { id: "njr", title: "journal", tag: "mind" },
  { id: "n3", title: m("presets.lib.n3.title"), tag: "mind" },
  { id: "nview", title: m("presets.lib.nview.title"), tag: "mind" },
  { id: "ntalk", title: m("presets.lib.ntalk.title"), tag: "mind" },
  { id: "wel", title: m("presets.lib.wel.title"), tag: "water", hint: m("presets.lib.wel.hint") },
  { id: "wban", title: m("presets.lib.wban.title"), tag: "water" },
  { id: "wveg", title: m("presets.lib.wveg.title"), tag: "water" },
]);
