// Built-in day templates. Each new one is a declarative patch on a baseDay() body (schedule.ts), so the
// weight-gain core (weigh, posture, meal1, supp1, meal2, snack, meal3, night, sleep) is shared by id.
// "work" and "off" are the legacy built-ins and return baseDay() unchanged.
import { at } from "./date";
import type { Item, PhaseDef, TemplateDef } from "./schedule";
import { langArr, langMap, msgs, withLang } from "../i18n";
import * as M from "../i18n/msg/lib-1";

const m = msgs(M);

// Item/phase builders (no text of their own).
const game = (min: number, title: string, sub: string, session?: "ny"): Item => ({ id: "game", min, endAt: "game-stop", title, sub, kind: "game", moves: true, ...(session ? { session } : {}) });
const game1 = (title: string, sub?: string): Item => ({ id: "game1", min: at(15), dur: 90, title, ...(sub ? { sub } : {}), kind: "game", moves: true });
const ph = (key: string, anchor: PhaseDef["at"], label: string, tip: string, color: string): PhaseDef => ({ key, at: anchor, label, tip, color });
const prep = (min: number, dur: number, title: string, sub: string): Item => ({ id: "stream-prep", min, dur, title, sub, kind: "stream", ring: "habit" });
const live = (min: number, title: string, sub: string): Item => ({ id: "stream", min, endAt: "stream-end", title, sub, kind: "stream", ring: "habit" });
const clips = (min: number, dur: number, title: string, sub: string): Item => ({ id: "clips", min, dur, title, sub, kind: "stream", ring: "habit" });
const snack2 = (min: number, title: string, sub: string): Item => ({ id: "snack2", min, dur: 10, title, sub, kind: "meal", ring: "food" });

// Text follows the UI language: buildTemplates() runs once per language (langArr caches it), so every item and
// phase const that carries text lives inside it. Item/phase objects are shared by reference within one build.
function buildTemplates(): TemplateDef[] {
  // Items shared by id across templates (ticks survive a template switch).
  const MC_CHECK: Item = { id: "mc-check", min: at(13, 50), dur: 10, title: m("templates.core.mcCheck.title"), sub: m("templates.core.mcCheck.sub"), kind: "mc", ring: "habit" };
  const GYM: Item = { id: "gym", min: at(17, 30), dur: 90, title: m("templates.core.gym.title"), sub: m("templates.core.gym.sub"), kind: "gym", ring: "body" };
  const SUPP3: Item = { id: "supp3", min: at(19), dur: 10, title: m("templates.core.supp3.title"), sub: m("templates.core.supp3.sub"), kind: "supp", ring: "food" };
  const CAF: Item = { id: "caf", min: at(23), title: m("templates.core.caf.title"), kind: "habit", moves: true };
  const GAME_STOP: Item = { id: "game-stop", min: at(3), dur: 45, title: m("templates.core.gameStop.title"), kind: "game", moves: true };
  const PRESLEEP: Item = { id: "presleep", min: at(3, 45), title: m("templates.core.presleep.title"), sub: m("templates.core.presleep.sub"), kind: "supp", ring: "food" };

  // Core patches shared by the no-work templates.
  const MORNING = { meal1: { min: at(13, 20), sub: m("templates.core.meal1.sub") }, supp1: { min: at(13, 20) }, persona: { defaultOff: true } };
  const LATE = { snack: { min: at(0), title: m("templates.core.snack.title"), kind: "meal" as const, sub: "~450 kcal" }, night: { min: at(4, 15), title: m("templates.core.night.title") } };
  const OFF_CUES = { trade: m("templates.core.cue.trade"), night: m("templates.core.cue.night") };

  const P_MORNING = ph("morning", "weigh", m("templates.off.ph.morning.label"), m("templates.off.ph.morning.tip"), "var(--ph-morning)");
  const P_SING = ph("sing", "sing", m("templates.off.ph.sing.label"), m("templates.off.ph.sing.tip"), "var(--ph-voice)");
  const P_BUILD = ph("build", "mc", m("templates.off.ph.build.label"), m("templates.off.ph.build.tip"), "var(--ph-build)");
  const P_FUEL = ph("fuel", "meal2", m("templates.off.ph.fuel.label"), m("templates.off.ph.fuel.tip"), "var(--ph-food)");
  const P_GYM = ph("gym", "gym", m("templates.off.ph.gym.label"), m("templates.off.ph.gym.tip"), "var(--ph-train)");
  const P_DINNER = ph("dinner", "meal3", m("templates.off.ph.dinner.label"), m("templates.off.ph.dinner.tip"), "var(--ph-food)");
  const P_GAME = ph("game", "game", m("templates.off.ph.game.label"), m("templates.off.ph.game.tip"), "var(--ph-live)");
  const P_WIND = ph("winddown", "game-stop", m("templates.off.ph.winddown.label"), m("templates.off.ph.winddown.tip"), "var(--ph-sleep)");
  const P_MOVE = ph("move", "cardio", m("templates.off.ph.move.label"), m("templates.off.ph.move.tip"), "var(--ph-move)");

  // v1.4 stream season: wake 09:30, sleep 01:30, live 19:00-00:30 (marathon 15:00). No session items: go-live stays
  // 19:00 when US DST ends (2026-11-01); London opens 15:00 BKK all season (UK on GMT from 2026-10-25).
  const S_CORE = {
    weigh: { min: at(9, 30), sub: m("templates.stream.weigh.sub") },
    posture: { min: at(9, 45) },
    meal1: { min: at(10), sub: m("templates.stream.meal1.sub") },
    supp1: { min: at(10), title: "Creatine 3-5 g", sub: m("templates.stream.supp1.sub") },
    persona: { defaultOff: true },
    meal2: { min: at(13), sub: m("templates.stream.meal2.sub") },
    meal3: { min: at(18), title: m("templates.stream.meal3.title"), sub: m("templates.stream.meal3.sub") },
    snack: { min: at(21, 45), title: m("templates.stream.snack.title"), kind: "meal" as const, sub: m("templates.stream.snack.sub") },
    night: { min: at(0, 55), title: m("templates.stream.night.title"), sub: m("templates.stream.night.sub") },
    sleep: { min: at(1, 30), title: m("templates.stream.sleep.title"), sub: m("templates.stream.sleep.sub") },
  };
  const S_TRADE = { min: at(14, 45), dur: 50, title: m("templates.stream.trade.title"), sub: m("templates.stream.trade.sub") };
  const S_CAF: Item = { id: "caf", min: at(16, 30), title: m("templates.stream.caf.title"), sub: m("templates.stream.caf.sub"), kind: "habit", moves: true };
  const S_END: Item = { id: "stream-end", min: at(0, 30), title: m("templates.stream.streamEnd.title"), sub: m("templates.stream.streamEnd.sub"), kind: "stream", moves: true };
  const S_PRESLEEP: Item = { ...PRESLEEP, min: at(0, 40), sub: m("templates.stream.presleep.sub") };
  const LIVE_SUB = m("templates.stream.live.sub");
  const S_SING_SUB = m("templates.stream.sing.sub");
  const S_CUES = { trade: m("templates.stream.cue.trade"), presleep: m("templates.stream.cue.presleep"), night: m("templates.stream.cue.night"), "stream-prep": m("templates.stream.cue.streamPrep"), stream: m("templates.stream.cue.stream"), sing: m("templates.stream.cue.sing") };
  const SP_MORNING = ph("morning", "weigh", m("templates.stream.ph.morning.label"), m("templates.stream.ph.morning.tip"), "var(--ph-morning)");
  const SP_SING = ph("sing", "sing", m("templates.stream.ph.sing.label"), m("templates.stream.ph.sing.tip"), "var(--ph-voice)");
  const SP_CLIPS = ph("clips", "clips", m("templates.stream.ph.clips.label"), m("templates.stream.ph.clips.tip"), "var(--ph-live)");
  const SP_MID = ph("midday", "meal2", m("templates.stream.ph.midday.label"), m("templates.stream.ph.midday.tip"), "var(--ph-food)");
  const SP_TRADE = ph("trade", "trade", m("templates.stream.ph.trade.label"), m("templates.stream.ph.trade.tip"), "var(--ph-work)");
  const SP_PREP = ph("prep", "stream-prep", m("templates.stream.ph.prep.label"), m("templates.stream.ph.prep.tip"), "var(--ph-live)");
  const SP_LIVE = ph("stream", "stream", m("templates.stream.ph.stream.label"), m("templates.stream.ph.stream.tip"), "var(--ph-live)");
  const SP_WIND = ph("winddown", "stream-end", m("templates.stream.ph.winddown.label"), m("templates.stream.ph.winddown.tip"), "var(--ph-sleep)");

  // v1.8 term season (class days): wake 08:00, leave by ~08:45, trade 16:00, gym or server 16:30, live 18:45-23:45 (300 min),
  // sleep 00:30 (7.5 h window). Singing moves to the evening before live (no voice work before leaving home). Classes are
  // not template items (term.ts adds them per date). Final class-day times (term-gym / term-live):
  // weigh 08:00, posture 08:10, meal1 + supp1 08:15, persona off (defaultOff), meal2 12:15, mc-check 12:45, caf 15:30,
  // trade 16:00, gym or mc 16:30-17:40, supp3 17:40 (term-gym), meal3 17:55, stream-prep 18:15, sing 18:25, live 18:45,
  // snack 21:45 (BRB during live), stream-end 23:45, presleep 23:55, night 00:05, sleep 00:30. cardio is dropped on both.
  const T_CORE = { ...S_CORE,
    weigh: { min: at(8), sub: m("templates.term.weigh.sub") }, posture: { min: at(8, 10) },
    meal1: { min: at(8, 15), sub: m("templates.term.meal1.sub") }, supp1: { ...S_CORE.supp1, min: at(8, 15) },
    meal2: { min: at(12, 15), title: m("templates.term.meal2.title"), sub: m("templates.term.meal2.sub") },
    meal3: { min: at(17, 55), title: m("templates.term.meal3.title"), sub: m("templates.term.meal3.sub") },
    night: { min: at(0, 5), title: m("templates.term.night.title"), sub: S_CORE.night.sub },
    sleep: { min: at(0, 30), title: m("templates.term.sleep.title"), sub: m("templates.term.sleep.sub") } };
  const T_TRADE = { min: at(16), dur: 25, title: m("templates.term.trade.title"), sub: m("templates.term.trade.sub") };
  const T_CAF: Item = { ...S_CAF, min: at(15, 30) }, T_END: Item = { ...S_END, min: at(23, 45) }, T_PRESLEEP: Item = { ...S_PRESLEEP, min: at(23, 55) };
  const T_SING: Item = { id: "sing", min: at(18, 25), dur: 20, title: m("templates.term.sing.title"), sub: m("templates.term.sing.sub"), kind: "sing", ring: "habit" };
  const T_PREP = prep(at(18, 15), 10, m("templates.term.streamPrep.title"), m("templates.term.streamPrep.sub"));
  const T_CUES = { ...S_CUES, trade: m("templates.term.cue.trade"), sing: m("templates.term.cue.sing"), "stream-prep": m("templates.term.cue.streamPrep"), "mc-check": m("templates.term.cue.mcCheck") };
  const TP_MORNING = ph("morning", "weigh", m("templates.term.ph.morning.label"), m("templates.term.ph.morning.tip"), "var(--ph-morning)");
  const TP_CAMPUS = ph("campus", ["meal1", 35], m("templates.term.ph.campus.label"), m("templates.term.ph.campus.tip"), "var(--ph-work)"); // anchored on meal1, not sing, so voiceRest days keep it
  const TP_MID = ph("midday", "meal2", m("templates.term.ph.midday.label"), m("templates.term.ph.midday.tip"), "var(--ph-food)");
  const TP_TRADE = ph("trade", "trade", m("templates.term.ph.trade.label"), m("templates.term.ph.trade.tip"), "var(--ph-work)");

  const WORK_ADD: Item[] = [
    { ...MC_CHECK, min: at(14, 15), sub: m("templates.work.mcCheck.sub") },
    { id: "sing", min: at(14, 30), dur: 30, title: m("templates.work.sing.title"), sub: m("templates.work.sing.sub"), kind: "sing", ring: "habit" },
    CAF,
  ];
  const WORK_TRADE = { title: m("templates.work.trade.title"), sub: m("templates.work.trade.sub"), dur: 15 };

  return [
    {
      id: "balanced", name: m("templates.tpl.balanced.name"), short: m("templates.tpl.balanced.short"), color: "var(--green)", base: "off", work: false,
      drop: ["cardio"],
      patch: {
        ...MORNING,
        meal2: { min: at(16, 30), title: m("templates.tpl.balanced.meal2.title"), sub: m("templates.tpl.balanced.meal2.sub") },
        trade: { min: at(19, 15), title: m("templates.tpl.balanced.trade.title"), sub: m("templates.tpl.balanced.trade.sub"), dur: 75, session: "ny" },
        meal3: { min: at(20, 45), title: m("templates.tpl.balanced.meal3.title"), sub: "~850 kcal", session: "ny" },
        ...LATE,
        snack: { ...LATE.snack, min: at(0, 30), sub: m("templates.tpl.balanced.snack.sub") },
      },
      add: [
        MC_CHECK,
        { id: "sing", min: at(14, 15), dur: 45, title: m("templates.tpl.balanced.sing.title"), sub: m("templates.tpl.balanced.sing.sub"), kind: "sing", ring: "habit" },
        { id: "mc", min: at(15), dur: 90, title: m("templates.tpl.balanced.mc.title"), sub: m("templates.tpl.balanced.mc.sub"), kind: "mc", ring: "habit" },
        GYM, SUPP3,
        game(at(21, 15), m("templates.tpl.balanced.game.title"), m("templates.tpl.balanced.game.sub"), "ny"),
        { ...CAF, sub: m("templates.tpl.balanced.caf.sub") },
        GAME_STOP, PRESLEEP,
      ],
      cues: OFF_CUES,
      phases: [
        P_MORNING, P_SING, P_BUILD, P_FUEL, P_GYM,
        ph("trade", "trade", m("templates.tpl.balanced.ph.trade.label"), m("templates.tpl.balanced.ph.trade.tip"), "var(--ph-work)"),
        P_DINNER, P_GAME, P_WIND,
      ],
    },
    {
      id: "game-max", name: m("templates.tpl.gameMax.name"), short: m("templates.tpl.gameMax.short"), color: "var(--purple)", base: "off", work: false,
      drop: ["cardio"],
      patch: {
        ...MORNING,
        meal2: { min: at(16, 30), title: m("templates.tpl.gameMax.meal2.title"), sub: m("templates.tpl.gameMax.meal2.sub") },
        trade: { min: at(19, 15), title: m("templates.tpl.gameMax.trade.title"), sub: m("templates.tpl.gameMax.trade.sub"), dur: 30, session: "ny" },
        meal3: { min: at(20), title: m("templates.tpl.gameMax.meal3.title"), sub: "~850 kcal", session: "ny" },
        ...LATE,
        snack: { ...LATE.snack, min: at(0, 15) },
      },
      add: [
        MC_CHECK,
        { id: "sing", min: at(14, 15), dur: 30, title: m("templates.tpl.gameMax.sing.title"), sub: m("templates.tpl.gameMax.sing.sub"), kind: "sing", ring: "habit" },
        game1(m("templates.tpl.gameMax.game1.title"), m("templates.tpl.gameMax.game1.sub")),
        { ...GYM, sub: m("templates.tpl.gameMax.gym.sub") }, SUPP3,
        game(at(20, 30), m("templates.tpl.gameMax.game.title"), m("templates.tpl.gameMax.game.sub"), "ny"),
        CAF, GAME_STOP, PRESLEEP,
      ],
      cues: OFF_CUES,
      phases: [
        P_MORNING, P_SING,
        ph("game1", "game1", m("templates.tpl.gameMax.ph.game1.label"), m("templates.tpl.gameMax.ph.game1.tip"), "var(--ph-live)"),
        P_FUEL, P_GYM,
        ph("trade", "trade", m("templates.tpl.gameMax.ph.trade.label"), m("templates.tpl.gameMax.ph.trade.tip"), "var(--ph-work)"),
        P_DINNER, P_GAME, P_WIND,
      ],
    },
    {
      id: "mc-build", name: m("templates.tpl.mcBuild.name"), short: m("templates.tpl.mcBuild.short"), color: "var(--teal)", base: "off", work: false,
      patch: {
        ...MORNING,
        trade: { defaultOff: true },
        meal2: { min: at(16, 30), sub: "~750 kcal" },
        cardio: { min: at(17, 30), title: m("templates.tpl.mcBuild.cardio.title"), sub: m("templates.tpl.mcBuild.cardio.sub"), dur: 60 },
        meal3: { min: at(20, 15), title: m("templates.tpl.mcBuild.meal3.title"), sub: "~850 kcal" },
        ...LATE,
      },
      add: [
        { id: "sing", min: at(14, 15), dur: 30, title: m("templates.tpl.mcBuild.sing.title"), sub: m("templates.tpl.mcBuild.sing.sub"), kind: "sing", ring: "habit" },
        { id: "mc", min: at(14, 45), dur: 100, title: m("templates.tpl.mcBuild.mc.title"), sub: m("templates.tpl.mcBuild.mc.sub"), kind: "mc", ring: "habit" },
        { id: "supp3", min: at(18, 40), dur: 10, title: m("templates.tpl.mcBuild.supp3.title"), kind: "supp", ring: "food" },
        { id: "mc2", min: at(19), dur: 75, title: m("templates.tpl.mcBuild.mc2.title"), kind: "mc", ring: "habit" },
        game(at(20, 45), m("templates.tpl.mcBuild.game.title"), m("templates.tpl.mcBuild.game.sub")),
        CAF, GAME_STOP, PRESLEEP,
      ],
      cues: { supp3: m("templates.tpl.mcBuild.cue.supp3"), night: m("templates.tpl.mcBuild.cue.night") },
      phases: [
        P_MORNING, P_SING, P_BUILD,
        ph("fuel", "meal2", m("templates.tpl.mcBuild.ph.fuel.label"), m("templates.tpl.mcBuild.ph.fuel.tip"), "var(--ph-food)"),
        P_MOVE,
        ph("build2", "mc2", m("templates.tpl.mcBuild.ph.build2.label"), m("templates.tpl.mcBuild.ph.build2.tip"), "var(--ph-build)"),
        ph("dinner", "meal3", m("templates.tpl.mcBuild.ph.dinner.label"), m("templates.tpl.mcBuild.ph.dinner.tip"), "var(--ph-food)"),
        ph("game", "game", m("templates.tpl.mcBuild.ph.game.label"), m("templates.tpl.mcBuild.ph.game.tip"), "var(--ph-live)"),
        P_WIND,
      ],
    },
    {
      id: "rest", name: m("templates.tpl.rest.name"), short: m("templates.tpl.rest.short"), color: "var(--orange)", base: "off", work: false,
      patch: {
        ...MORNING,
        meal1: { min: at(13, 20), sub: "~650 kcal" },
        supp1: { min: at(13, 20), sub: m("templates.tpl.rest.supp1.sub") },
        trade: { defaultOff: true },
        meal2: { min: at(16, 30), sub: "~750 kcal" },
        cardio: { min: at(17, 30), title: m("templates.tpl.rest.cardio.title"), sub: m("templates.tpl.rest.cardio.sub"), dur: 60 },
        meal3: { min: at(20), title: m("templates.tpl.rest.meal3.title"), sub: "~850 kcal" },
        ...LATE,
      },
      add: [
        { id: "mc-check", min: at(14), dur: 10, title: m("templates.tpl.rest.mcCheck.title"), kind: "mc", ring: "habit" },
        { id: "review", min: at(14, 15), dur: 30, title: m("templates.tpl.rest.review.title"), sub: m("templates.tpl.rest.review.sub"), kind: "habit", ring: "habit" },
        game1(m("templates.tpl.rest.game1.title")),
        { id: "supp3", min: at(18, 40), dur: 10, title: m("templates.tpl.rest.supp3.title"), sub: m("templates.tpl.rest.supp3.sub"), kind: "supp", ring: "food" },
        game(at(20, 30), m("templates.tpl.rest.game.title"), m("templates.tpl.rest.game.sub")),
        CAF, GAME_STOP, PRESLEEP,
      ],
      cues: { supp3: m("templates.tpl.rest.cue.supp3"), night: m("templates.tpl.rest.cue.night") },
      phases: [
        P_MORNING,
        ph("review", "review", m("templates.tpl.rest.ph.review.label"), m("templates.tpl.rest.ph.review.tip"), "var(--ph-work)"),
        ph("game1", "game1", m("templates.tpl.rest.ph.game1.label"), m("templates.tpl.rest.ph.game1.tip"), "var(--ph-live)"),
        ph("evening", "meal2", m("templates.tpl.rest.ph.evening.label"), m("templates.tpl.rest.ph.evening.tip"), "var(--ph-food)"),
        { ...P_MOVE, tip: m("templates.tpl.rest.ph.move.tip") },
        ph("dinner", "meal3", m("templates.tpl.rest.ph.dinner.label"), m("templates.tpl.rest.ph.dinner.tip"), "var(--ph-food)"),
        { ...P_GAME, tip: m("templates.tpl.rest.ph.game.tip") },
        P_WIND,
      ],
    },
    {
      id: "work-plus", name: m("templates.tpl.workPlus.name"), short: m("templates.tpl.workPlus.short"), color: "var(--blue)", base: "work", work: true,
      patch: { persona: { defaultOff: true }, trade: WORK_TRADE },
      add: WORK_ADD,
      cues: { trade: m("templates.tpl.workPlus.cue.trade") },
    },
    {
      id: "work-game", name: m("templates.tpl.workGame.name"), short: m("templates.tpl.workGame.short"), color: "var(--pink)", base: "work", work: true,
      drop: ["gym"],
      patch: {
        persona: { defaultOff: true }, trade: WORK_TRADE,
        supp2: { sub: m("templates.tpl.workGame.supp2.sub") },
        supp3: { title: m("templates.tpl.workGame.supp3.title"), sub: m("templates.tpl.workGame.supp3.sub") },
        meal2c: { title: m("templates.tpl.workGame.meal2c.title") },
      },
      add: [
        ...WORK_ADD,
        { id: "game", min: at(2, 30), dur: 75, kind: "game", title: m("templates.tpl.workGame.game.title"), sub: m("templates.tpl.workGame.game.sub") },
      ],
      cues: { trade: m("templates.tpl.workGame.cue.trade"), supp3: m("templates.tpl.workGame.cue.supp3") },
      phases: [
        ph("prep", "weigh", m("templates.tpl.workGame.ph.prep.label"), m("templates.tpl.workGame.ph.prep.tip"), "var(--ph-morning)"),
        ph("work1", "work-in", m("templates.tpl.workGame.ph.work1.label"), m("templates.tpl.workGame.ph.work1.tip"), "var(--ph-work)"),
        ph("break", "meal2", m("templates.tpl.workGame.ph.break.label"), m("templates.tpl.workGame.ph.break.tip"), "var(--ph-food)"),
        ph("work2", ["meal2", 60], m("templates.tpl.workGame.ph.work2.label"), m("templates.tpl.workGame.ph.work2.tip"), "var(--ph-work)"),
        ph("commute", "work-out", m("templates.tpl.workGame.ph.commute.label"), m("templates.tpl.workGame.ph.commute.tip"), "var(--ph-move)"),
        ph("game", "game", m("templates.tpl.workGame.ph.game.label"), m("templates.tpl.workGame.ph.game.tip"), "var(--ph-live)"),
        ph("winddown", "supp3", m("templates.tpl.workGame.ph.winddown.label"), m("templates.tpl.workGame.ph.winddown.tip"), "var(--ph-sleep)"),
      ],
    },
    {
      id: "stream-gym", name: m("templates.tpl.streamGym.name"), short: m("templates.tpl.streamGym.short"), color: "var(--red)", base: "off", work: false, season: "stream",
      drop: ["cardio"],
      patch: { ...S_CORE, trade: S_TRADE },
      add: [
        { id: "sing", min: at(10, 45), dur: 25, title: m("templates.tpl.streamGym.sing.title"), sub: S_SING_SUB, kind: "sing", ring: "habit" },
        clips(at(11, 15), 45, m("templates.tpl.streamGym.clips.title"), m("templates.tpl.streamGym.clips.sub")),
        { ...MC_CHECK, min: at(12, 15) },
        snack2(at(15, 40), m("templates.tpl.streamGym.snack2.title"), m("templates.tpl.streamGym.snack2.sub")),
        { ...GYM, min: at(16), dur: 75, sub: m("templates.tpl.streamGym.gym.sub") },
        { ...SUPP3, min: at(17, 20) },
        S_CAF,
        prep(at(18, 30), 25, m("templates.tpl.streamGym.streamPrep.title"), SP_PREP.tip),
        live(at(19), m("templates.tpl.streamGym.stream.title"), LIVE_SUB),
        S_END, S_PRESLEEP,
      ],
      cues: { ...S_CUES, clips: m("templates.tpl.streamGym.cue.clips"), snack2: m("templates.tpl.streamGym.cue.snack2") },
      phases: [
        SP_MORNING, SP_SING, SP_CLIPS, SP_MID, SP_TRADE, P_GYM,
        ph("fuel", "supp3", m("templates.tpl.streamGym.ph.fuel.label"), m("templates.tpl.streamGym.ph.fuel.tip"), "var(--ph-food)"),
        SP_PREP, SP_LIVE, SP_WIND,
      ],
    },
    {
      id: "stream-mc", name: m("templates.tpl.streamMc.name"), short: m("templates.tpl.streamMc.short"), color: "var(--teal)", base: "off", work: false, season: "stream",
      patch: {
        ...S_CORE, trade: S_TRADE,
        meal2: { min: at(12, 45), sub: "~750 kcal" },
        cardio: { min: at(16, 15), dur: 45, title: m("templates.tpl.streamMc.cardio.title"), sub: m("templates.tpl.streamMc.cardio.sub") },
      },
      add: [
        { id: "sing", min: at(10, 30), dur: 25, title: m("templates.tpl.streamMc.sing.title"), sub: S_SING_SUB, kind: "sing", ring: "habit" },
        { id: "mc", min: at(11), dur: 90, title: m("templates.tpl.streamMc.mc.title"), sub: m("templates.tpl.streamMc.mc.sub"), kind: "mc", ring: "habit" },
        clips(at(13, 30), 45, m("templates.tpl.streamMc.clips.title"), m("templates.tpl.streamMc.clips.sub")),
        snack2(at(15, 45), m("templates.tpl.streamMc.snack2.title"), "~250 kcal"),
        { ...SUPP3, min: at(17, 10), title: m("templates.tpl.streamMc.supp3.title"), sub: m("templates.tpl.streamMc.supp3.sub") },
        S_CAF,
        prep(at(18, 30), 25, m("templates.tpl.streamMc.streamPrep.title"), SP_PREP.tip),
        live(at(19), m("templates.tpl.streamMc.stream.title"), m("templates.tpl.streamMc.stream.sub")),
        S_END, S_PRESLEEP,
      ],
      cues: { ...S_CUES, clips: m("templates.tpl.streamMc.cue.clips"), supp3: m("templates.tpl.streamMc.cue.supp3") },
      phases: [
        SP_MORNING, SP_SING,
        ph("build", "mc", m("templates.tpl.streamMc.ph.build.label"), m("templates.tpl.streamMc.ph.build.tip"), "var(--ph-build)"),
        SP_MID, SP_CLIPS, SP_TRADE,
        ph("move", "cardio", m("templates.tpl.streamMc.ph.move.label"), m("templates.tpl.streamMc.ph.move.tip"), "var(--ph-move)"),
        ph("fuel", "supp3", m("templates.tpl.streamMc.ph.fuel.label"), m("templates.tpl.streamMc.ph.fuel.tip"), "var(--ph-food)"),
        SP_PREP, { ...SP_LIVE, label: m("templates.tpl.streamMc.ph.stream.label") }, SP_WIND,
      ],
    },
    {
      id: "stream-marathon", name: m("templates.tpl.streamMarathon.name"), short: m("templates.tpl.streamMarathon.short"), color: "var(--purple)", base: "off", work: false, season: "stream",
      drop: ["cardio"],
      patch: {
        ...S_CORE,
        trade: { defaultOff: true }, // FX is closed on Saturday
        weigh: { ...S_CORE.weigh, sub: m("templates.tpl.streamMarathon.weigh.sub") },
        meal1: { min: at(10), sub: m("templates.tpl.streamMarathon.meal1.sub") },
        meal2: { min: at(12, 30), sub: "~800 kcal" },
        meal3: { min: at(17, 45), title: m("templates.tpl.streamMarathon.meal3.title"), sub: m("templates.tpl.streamMarathon.meal3.sub") },
        snack: { ...S_CORE.snack, title: m("templates.tpl.streamMarathon.snack.title") },
      },
      add: [
        clips(at(10, 45), 60, m("templates.tpl.streamMarathon.clips.title"), m("templates.tpl.streamMarathon.clips.sub")),
        { ...MC_CHECK, min: at(12) },
        prep(at(14, 15), 30, m("templates.tpl.streamMarathon.streamPrep.title"), m("templates.tpl.streamMarathon.streamPrep.sub")),
        live(at(15), m("templates.tpl.streamMarathon.stream.title"), m("templates.tpl.streamMarathon.stream.sub")),
        snack2(at(16, 15), m("templates.tpl.streamMarathon.snack2.title"), m("templates.tpl.streamMarathon.snack2.sub")),
        S_CAF, S_END, S_PRESLEEP,
      ],
      cues: { ...S_CUES, clips: m("templates.tpl.streamMarathon.cue.clips"), "stream-prep": m("templates.tpl.streamMarathon.cue.streamPrep") },
      phases: [
        SP_MORNING,
        { ...SP_CLIPS, tip: m("templates.tpl.streamMarathon.ph.clips.tip") },
        ph("midday", "meal2", m("templates.tpl.streamMarathon.ph.midday.label"), m("templates.tpl.streamMarathon.ph.midday.tip"), "var(--ph-food)"),
        SP_PREP, { ...SP_LIVE, label: m("templates.tpl.streamMarathon.ph.stream.label") },
        ph("brb", "meal3", m("templates.tpl.streamMarathon.ph.brb.label"), m("templates.tpl.streamMarathon.ph.brb.tip"), "var(--ph-food)"),
        ph("stream2", ["meal3", 30], m("templates.tpl.streamMarathon.ph.stream2.label"), m("templates.tpl.streamMarathon.ph.stream2.tip"), "var(--ph-live)"),
        SP_WIND,
      ],
    },
    {
      id: "stream-rest", name: m("templates.tpl.streamRest.name"), short: m("templates.tpl.streamRest.short"), color: "var(--orange)", base: "off", work: false, season: "stream",
      patch: {
        ...S_CORE,
        trade: { defaultOff: true },
        supp1: { ...S_CORE.supp1, sub: m("templates.tpl.streamRest.supp1.sub") },
        meal2: { min: at(12), sub: "~750 kcal" },
        cardio: { min: at(10, 45), dur: 45, title: m("templates.tpl.streamRest.cardio.title"), sub: m("templates.tpl.streamRest.cardio.sub") },
      },
      add: [
        { ...MC_CHECK, min: at(12, 45) },
        { id: "review", min: at(13), dur: 45, title: m("templates.tpl.streamRest.review.title"), sub: m("templates.tpl.streamRest.review.sub"), kind: "habit", ring: "habit" },
        clips(at(14), 90, m("templates.tpl.streamRest.clips.title"), m("templates.tpl.streamRest.clips.sub")),
        { ...SUPP3, min: at(16), title: m("templates.tpl.streamRest.supp3.title"), sub: m("templates.tpl.streamRest.supp3.sub") },
        S_CAF,
        prep(at(18, 30), 20, m("templates.tpl.streamRest.streamPrep.title"), m("templates.tpl.streamRest.streamPrep.sub")),
        live(at(19), m("templates.tpl.streamRest.stream.title"), m("templates.tpl.streamRest.stream.sub")),
        S_END, S_PRESLEEP,
      ],
      cues: { ...S_CUES, clips: m("templates.tpl.streamRest.cue.clips"), supp3: m("templates.tpl.streamRest.cue.supp3") },
      phases: [
        SP_MORNING,
        ph("move", "cardio", m("templates.tpl.streamRest.ph.move.label"), m("templates.tpl.streamRest.ph.move.tip"), "var(--ph-move)"),
        SP_MID,
        ph("review", "review", m("templates.tpl.streamRest.ph.review.label"), m("templates.tpl.streamRest.ph.review.tip"), "var(--ph-work)"),
        ph("clips", "clips", m("templates.tpl.streamRest.ph.clips.label"), m("templates.tpl.streamRest.ph.clips.tip"), "var(--ph-live)"),
        ph("rest", "supp3", m("templates.tpl.streamRest.ph.rest.label"), m("templates.tpl.streamRest.ph.rest.tip"), "var(--ph-food)"),
        SP_PREP, { ...SP_LIVE, label: m("templates.tpl.streamRest.ph.stream.label") }, SP_WIND,
      ],
    },
    {
      id: "term-gym", name: m("templates.tpl.termGym.name"), short: m("templates.tpl.termGym.short"), color: "var(--red)", base: "off", work: false, season: "stream",
      drop: ["cardio"],
      patch: { ...T_CORE, trade: T_TRADE },
      add: [
        { ...MC_CHECK, min: at(12, 45) },
        { ...GYM, min: at(16, 30), dur: 70, sub: m("templates.tpl.termGym.gym.sub") },
        { ...SUPP3, min: at(17, 40) },
        T_CAF, T_PREP, T_SING,
        live(at(18, 45), m("templates.tpl.termGym.stream.title"), LIVE_SUB),
        T_END, T_PRESLEEP,
      ],
      cues: T_CUES,
      phases: [
        TP_MORNING, TP_CAMPUS, TP_MID, TP_TRADE, P_GYM,
        ph("fuel", "supp3", m("templates.tpl.termGym.ph.fuel.label"), m("templates.tpl.termGym.ph.fuel.tip"), "var(--ph-food)"),
        SP_PREP, SP_LIVE, SP_WIND,
      ],
    },
    {
      id: "term-live", name: m("templates.tpl.termLive.name"), short: m("templates.tpl.termLive.short"), color: "var(--teal)", base: "off", work: false, season: "stream",
      drop: ["cardio"], // 16:00 cardio would sit on the after-class trade; the server block takes its slot
      patch: { ...T_CORE, trade: T_TRADE },
      add: [
        { ...MC_CHECK, min: at(12, 45) },
        { id: "mc", min: at(16, 30), dur: 70, title: m("templates.tpl.termLive.mc.title"), sub: m("templates.tpl.termLive.mc.sub"), kind: "mc", ring: "habit" },
        T_CAF, T_PREP, T_SING,
        live(at(18, 45), m("templates.tpl.termLive.stream.title"), LIVE_SUB),
        T_END, T_PRESLEEP,
      ],
      cues: { ...T_CUES, mc: m("templates.tpl.termLive.cue.mc") },
      phases: [
        TP_MORNING, TP_CAMPUS, TP_MID, TP_TRADE,
        ph("build", "mc", m("templates.tpl.termLive.ph.build.label"), m("templates.tpl.termLive.ph.build.tip"), "var(--ph-build)"),
        ph("fuel", "meal3", m("templates.tpl.termLive.ph.fuel.label"), m("templates.tpl.termLive.ph.fuel.tip"), "var(--ph-food)"),
        SP_PREP, SP_LIVE, SP_WIND,
      ],
    },
    {
      // The day before a class day: wake 09:00, weekly review + clips ahead (class days leave no time to edit), sleep 00:30.
      id: "term-rest", name: m("templates.tpl.termRest.name"), short: m("templates.tpl.termRest.short"), color: "var(--orange)", base: "off", work: false, season: "stream",
      patch: {
        ...S_CORE,
        weigh: { ...S_CORE.weigh, min: at(9) }, posture: { min: at(9, 15) },
        meal1: { ...S_CORE.meal1, min: at(9, 30) }, supp1: { ...S_CORE.supp1, min: at(9, 30), sub: m("templates.tpl.termRest.supp1.sub") },
        persona: { defaultOff: true }, trade: { defaultOff: true },
        meal2: { min: at(12), sub: "~750 kcal" },
        cardio: { min: at(10, 30), dur: 45, title: m("templates.tpl.termRest.cardio.title"), sub: m("templates.tpl.termRest.cardio.sub") },
        meal3: { ...S_CORE.meal3, min: at(17, 30), title: m("templates.tpl.termRest.meal3.title") },
        snack: { ...S_CORE.snack, min: at(21, 15) },
        night: { ...S_CORE.night, min: at(23, 55) },
        sleep: { min: at(0, 30), title: m("templates.tpl.termRest.sleep.title"), sub: m("templates.tpl.termRest.sleep.sub") },
      },
      add: [
        { ...MC_CHECK, min: at(12, 30) },
        { id: "review", min: at(12, 45), dur: 45, title: m("templates.tpl.termRest.review.title"), sub: m("templates.tpl.termRest.review.sub"), kind: "habit", ring: "habit" },
        clips(at(13, 45), 90, m("templates.tpl.termRest.clips.title"), m("templates.tpl.termRest.clips.sub")),
        { ...SUPP3, min: at(15, 30), title: m("templates.tpl.termRest.supp3.title"), sub: "~350 kcal" },
        { ...S_CAF, min: at(15, 30) },
        { ...T_SING, min: at(16, 45), sub: m("templates.tpl.termRest.sing.sub") },
        prep(at(18), 20, m("templates.tpl.termRest.streamPrep.title"), m("templates.tpl.termRest.streamPrep.sub")),
        live(at(18, 30), m("templates.tpl.termRest.stream.title"), m("templates.tpl.termRest.stream.sub")),
        { ...S_END, min: at(23, 30) },
        { ...S_PRESLEEP, min: at(23, 40) },
      ],
      cues: { ...S_CUES, clips: m("templates.tpl.termRest.cue.clips"), supp3: m("templates.tpl.termRest.cue.supp3"), sing: m("templates.tpl.termRest.cue.sing"), "mc-check": m("templates.tpl.termRest.cue.mcCheck") },
      phases: [
        SP_MORNING,
        ph("move", "cardio", m("templates.tpl.termRest.ph.move.label"), m("templates.tpl.termRest.ph.move.tip"), "var(--ph-move)"),
        SP_MID,
        ph("review", "review", m("templates.tpl.termRest.ph.review.label"), m("templates.tpl.termRest.ph.review.tip"), "var(--ph-work)"),
        ph("clips", "clips", m("templates.tpl.termRest.ph.clips.label"), m("templates.tpl.termRest.ph.clips.tip"), "var(--ph-live)"),
        ph("rest", "supp3", m("templates.tpl.termRest.ph.rest.label"), m("templates.tpl.termRest.ph.rest.tip"), "var(--ph-food)"),
        SP_PREP, { ...SP_LIVE, label: m("templates.tpl.termRest.ph.stream.label") }, SP_WIND,
      ],
    },
    { id: "work", name: m("templates.tpl.work.name"), short: m("templates.tpl.work.short"), color: "var(--gray)", base: "work", work: true, legacy: true },
    { id: "off", name: m("templates.tpl.off.name"), short: m("templates.tpl.off.short"), color: "var(--gray)", base: "off", work: false, legacy: true },
  ];
}

export const TEMPLATES: TemplateDef[] = langArr(buildTemplates);

export const TEMPLATE_BY_ID: ReadonlyMap<string, TemplateDef> = langMap(() => new Map(TEMPLATES.map((t) => [t.id, t])));
export const BUILTIN_IDS: ReadonlySet<string> = new Set(withLang("th", () => TEMPLATES.map((t) => t.id))); // ids only

// v1.8 term season (index 4; indices 0-3 are locked by tests and stored plans).
export const TERM_PRESET = "term";
function buildWeekPresets(): { id: string; name: string; note: string; days: string[] }[] {
  const list = [
    { id: "job", name: m("templates.week.job.name"), note: m("templates.week.job.note"), days: ["rest", "work-plus", "work-plus", "work-game", "work-plus", "work-plus", "mc-build"] },
    { id: "nojob", name: m("templates.week.nojob.name"), note: m("templates.week.nojob.note"), days: ["rest", "balanced", "game-max", "mc-build", "balanced", "game-max", "mc-build"] },
    { id: "gamer", name: m("templates.week.gamer.name"), note: m("templates.week.gamer.note"), days: ["rest", "game-max", "balanced", "rest", "game-max", "game-max", "mc-build"] },
    { id: "stream", name: m("templates.week.stream.name"), note: m("templates.week.stream.note"),
      days: ["stream-rest", "stream-gym", "stream-gym", "stream-mc", "stream-gym", "stream-gym", "stream-marathon"] },
  ];
  list.push({ id: TERM_PRESET, name: m("templates.week.term.name"), note: m("templates.week.term.note"),
    days: ["term-rest", "term-gym", "term-gym", "term-live", "term-gym", "term-gym", "stream-marathon"] });
  return list;
}
export const WEEK_PRESETS: { id: string; name: string; note: string; days: string[] }[] = langArr(buildWeekPresets);
export const TERM_IDS: ReadonlySet<string> = new Set(["term-gym", "term-live", "term-rest"]);
// Template to use on a class day per built-in (outside the term templates), and the in-term swap when the gym cannot move.
export const TERM_FOR: Record<string, string> = { "stream-gym": "term-gym", "stream-mc": "term-live", "stream-rest": "term-rest", balanced: "term-gym", "game-max": "term-live", "mc-build": "term-live", rest: "term-rest" };
export const TERM_ALT: Record<string, string> = { "term-gym": "term-live" };

// job=true: build from the user's off weekdays. Off days in Sunday-first order get rest, then mc-build, then game-max.
// Work days get work-plus; with 5+ work days the 3rd work day gets work-game. Empty offWeekdays -> WEEK_PRESETS[0].
export function introPreset(offWeekdays: number[], job: boolean): string[] {
  if (!job) return [...WEEK_PRESETS[1].days];
  if (!offWeekdays.length) return [...WEEK_PRESETS[0].days];
  const workDays = 7 - offWeekdays.length; let off = 0, work = 0;
  return Array.from({ length: 7 }, (_, dow) => offWeekdays.includes(dow)
    ? (["rest", "mc-build"][off++] ?? "game-max")
    : (++work === 3 && workDays >= 5 ? "work-game" : "work-plus"));
}
