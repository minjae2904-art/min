// Round E batch 4: English output of the care engine, push messages and the brain user turn; stored defaults stay canonical.
import { describe, expect, it } from "vitest";
import { withLang } from "../../i18n/core";
import { careCheckText, careRoutineName, careStepText, careTaskText, stepTitle } from "../../i18n/stored";
import * as Coach from "../../i18n/msg/app-api-ai-coach";
import { addDays } from "../date";
import { normalize, type State } from "../model";
import { checkNext, thShort, useByChip } from "../care/body";
import { cadLabel } from "../care/cadence";
import { careFlag, HELP, RED_FLAGS } from "../care/flags";
import { CHECK_DEFAULTS, LEVEL_LABEL, LEVEL_SUMMARY, PACK_STEPS, PACKS, PRELIVE, SLOTS, STEP_LIBRARY, TAG_LABEL, TASK_PRESETS } from "../care/presets";
import { applyLevel, careSub, dueTasks, resetRoutine, rowState, stepShort, stepsFor } from "../care/progress";
import { BOWEL, CAF_LABEL, SYM_LABEL, URINE, WALK } from "../care/track";
import { enablePush, testPush } from "../push";
import { userText } from "../brain/context";

const THAI = /[฀-๿]/;
const D = "2026-10-27";
const noThai = (list: (string | undefined)[]) => { for (const t of list) if (t !== undefined) { expect(t.trim()).not.toBe(""); expect(THAI.test(t), t).toBe(false); } };
const enStepHeads = () => withLang("en", () => PACK_STEPS.map((p) => stepShort(p.step)));
const mk = (level: "lite" | "std" | "full" = "std"): State => { const s = normalize({}); applyLevel(s, level, D); s.days[D] = { type: "stream-gym", done: {}, waterMl: 0 }; return s; };
const step = (slot: string, id: string, lang: "th" | "en" = "th") => withLang(lang, () => PACK_STEPS.find((p) => p.slot === slot && p.step.id === id)!.step);

describe("batch 4 English", () => {
  it("presets have no Thai in en and keep ids and shapes", () => {
    withLang("en", () => {
      noThai(SLOTS.map((x) => x.name));
      noThai(PACK_STEPS.flatMap((p) => [p.step.title, p.step.hint]));
      noThai(PRELIVE.flatMap((x) => [x.title, x.hint]));
      noThai(PACKS.flatMap((p) => [p.name, p.desc]));
      noThai(TASK_PRESETS.flatMap((t) => [t.title, t.hint]));
      noThai(CHECK_DEFAULTS.flatMap((c) => [c.name, c.note]));
      noThai(STEP_LIBRARY.flatMap((x) => [x.title, x.hint]));
      noThai([...Object.values(LEVEL_LABEL), ...Object.values(LEVEL_SUMMARY), ...Object.values(TAG_LABEL)]);
      noThai([...URINE, ...WALK, ...BOWEL, ...Object.values(SYM_LABEL), ...Object.values(CAF_LABEL), ...RED_FLAGS, ...HELP.map((h) => h[1])]);
      expect(SLOTS.find((x) => x.id === "am")!.name).toBe("Morning");
      expect(LEVEL_LABEL.std).toBe("Standard");
    });
    expect(withLang("en", () => PACK_STEPS.map((p) => `${p.slot}.${p.step.id}`))).toEqual(withLang("th", () => PACK_STEPS.map((p) => `${p.slot}.${p.step.id}`)));
    expect(withLang("en", () => PRELIVE[0] === PACK_STEPS.find((p) => p.step.id === "set")!.step)).toBe(true);
    expect(HELP.map((h) => h[0])).toEqual(["1323", "1669", "191"]);
  });

  it("stored defaults resolve by value and slot (spec 7)", () => {
    const amCl = step("am", "cl"), pmCl = step("pm", "cl");
    const enAm = step("am", "cl", "en").title, enPm = step("pm", "cl", "en").title;
    expect(withLang("en", () => stepTitle({ title: amCl.title, ed: true } as { title: string }))).toBe(enAm);
    expect(careStepText.canon(pmCl.title)).toBe(pmCl.title);
    expect(careStepText.canon(enPm)).toBe(enPm); // en text is user text (th-only index)
    expect(withLang("en", () => careStepText(amCl.title))).not.toBe(withLang("en", () => careStepText(pmCl.title)));
    expect(withLang("en", () => careStepText("my own step"))).toBe("my own step");
    expect(withLang("en", () => careRoutineName(withLang("th", () => SLOTS[3].name)))).toBe("Bedtime");
    expect(withLang("en", () => careTaskText(withLang("th", () => TASK_PRESETS[0].title)))).toBe(withLang("en", () => TASK_PRESETS[0].title));
    expect(withLang("en", () => careCheckText(withLang("th", () => CHECK_DEFAULTS[0].name)))).toBe("Annual checkup");
  });

  it("writers store canonical th defaults even in en", () => {
    const th = mk("full");
    const en = withLang("en", () => mk("full"));
    expect(en.schedule.care).toEqual(th.schedule.care);
    expect(en.care.tasks).toEqual(th.care.tasks);
    expect(en.care.checks).toEqual(th.care.checks);
    withLang("en", () => resetRoutine(en, "am", D));
    expect(en.schedule.care!.find((r) => r.id === "am")!.name).toBe(withLang("th", () => SLOTS[0].name));
  });

  it("progress text in en", () => {
    const s = mk("std");
    const r = s.schedule.care!.find((x) => x.id === "am")!;
    const st = rowState(r, s.days[D], D, s.days[addDays(D, -1)]);
    const th = careSub(st), en = withLang("en", () => careSub(st));
    expect(th).toBe("ล้างหน้า · กันแดด · +1 · +2 ไม่บังคับ");
    expect(en).toBe("Wash face · Sunscreen · +1 · +2 optional");
    expect(withLang("en", () => stepShort(step("am", "br")))).toBe("Brush teeth");
    expect(enStepHeads()).not.toContain("");
    expect(withLang("en", () => stepShort({ id: "x", title: "My long custom step name here", tag: "face" }))).toBe("My long custom step");
    noThai(withLang("en", () => dueTasks(s, D).flatMap((t) => [t.title, t.hint])));
    expect(dueTasks(s, D).map((t) => t.title)).toEqual(s.care.tasks.filter((t) => t.on).map((t) => t.title).slice(0, 6));
    // conflict: the first strong step's title shows in the UI language
    s.schedule.care!.find((x) => x.id === "pm")!.steps.push(
      { ...structuredClone(step("pm", "bha")), id: "a1", cad: "d" }, { id: "a2", title: "x", tag: "face", irr: "ret" });
    const pm = s.schedule.care!.find((x) => x.id === "pm")!;
    const v = withLang("en", () => stepsFor(pm, s.days[D], D, undefined)).find((x) => x.why === "conflict");
    expect(v?.first).toBe("BHA/salicylic (clogged pores)");
    expect(stepsFor(pm, s.days[D], D, undefined).find((x) => x.why === "conflict")?.first).toBe(step("pm", "bha").title);
  });

  it("cadence, body and flags in en", () => {
    withLang("en", () => {
      expect(cadLabel("w:1,3,5")).toBe("Mon/Wed/Fri");
      expect(cadLabel("e:3@2026-01-01")).toBe("Every 3 days");
      expect(cadLabel("e:2@2026-01-01")).toBe("Alternate nights");
      expect(thShort("2026-10-24")).toBe("24 Oct");
      expect(checkNext({ id: "bp", name: "x", everyM: 12, last: "2025-01-05" }, D).label).toBe("Due now");
      expect(checkNext({ id: "bp", name: "x", everyM: 12, last: "2026-10-05" }, D).label).toBe("Next 5 Oct 2027");
      expect(useByChip({ id: "p", name: "Sunscreen gel", cat: "face", exp: "2026-01-01" }, D)?.text).toBe("Expired · time to replace this sunscreen");
      expect(useByChip({ id: "p", name: "Serum", cat: "face", exp: "2026-11-01" }, D)?.text).toBe("Use by 1 Nov");
    });
    expect(useByChip({ id: "p", name: "Sunscreen gel", cat: "face", exp: "2026-01-01" }, D)?.text).toBe("หมดอายุ · กันแดดหมดอายุอย่าใช้");
    const s = mk();
    s.care.checks.find((c) => c.id === "lab")!.flag = true;
    const f = withLang("en", () => careFlag(s, D))!;
    expect(f.title).toBe("Blood test: lipids, glucose, kidney function: result out of range");
    noThai([f.title, f.body, f.who, ...f.tips]);
    expect(careFlag(s, D)!.title).toBe("ผลตรวจเลือด: ไขมัน น้ำตาล การทำงานไตมีค่าผิดปกติ");
    s.care.checks.find((c) => c.id === "lab")!.flag = false;
    s.care.ms.mole = 3;
    const g = withLang("en", () => careFlag(s, D))!;
    noThai([g.title, g.body, g.who, ...g.tips]);
    expect(g.body).toBe("Worth having a dermatologist look at it soon · Not a diagnosis");
  });

  it("push messages and the brain user turn in en", async () => {
    // The early-return messages are built synchronously, so wrapping only the call is enough (withLang refuses promises).
    expect(await withLang("en", () => ({ p: testPush(null) })).p).toMatchObject({ ok: false, msg: "Sign in with your PIN first" });
    expect((await testPush(null)).msg).toBe("ต้องเข้าด้วย PIN ก่อน");
    const r = await withLang("en", () => ({ p: enablePush(null, Promise.resolve("granted")) })).p;
    expect(r).toEqual({ ok: false, step: "login", msg: "Sign in with your PIN first" });
    const ctx = { v: 1 } as unknown as Parameters<typeof userText>[0];
    expect(userText(ctx, "brief")).toBe('data: {"v":1}\nงาน: สรุปวันนี้');
    expect(withLang("en", () => userText(ctx, "weekly"))).toBe('data: {"v":1}\ntask: Weekly review');
  });

  it("coach prompts: en answers in English with the same structure", () => {
    expect(Coach.en["coach.system"]).toContain("Answer in English");
    expect(Coach.th["coach.system"]).toContain("ตอบเป็นภาษาไทย");
    expect(Coach.en["coach.task"].split("\n").length).toBe(Coach.th["coach.task"].split("\n").length);
    expect(Coach.en["coach.system"].split("\n").length).toBe(Coach.th["coach.system"].split("\n").length);
  });
});
