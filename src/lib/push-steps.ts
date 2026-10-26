// Pure model of the notification setup checker (Settings > การแจ้งเตือน). Facts come from push.ts collectFacts();
// each step gets a state and, when it fails, the fix for that exact cause (UI language; text in lib-11).
import { langObj, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-11";

const m = msgs(M);

export type StepId = "standalone" | "support" | "server" | "login" | "permission" | "sw" | "key" | "sub" | "saved" | "route" | "cron" | "test";
export type StepState = "ok" | "fail" | "warn" | "wait" | "skip";
export type Facts = {
  ios: boolean; standalone: boolean; support: boolean; mode: "loading" | "local" | "server"; reason: "unconfigured" | "unreachable" | null;
  token: boolean; permission: "default" | "granted" | "denied" | "unsupported"; sw: "active" | "installing" | "none" | "timeout" | "unknown";
  key: "ok" | "missing" | "error" | "unknown"; sub: "ok" | "unverified" | "none" | "mismatch" | "unknown"; saved: "yes" | "no" | "unauthorized" | "error" | "unknown";
  devices: number | null; appUrl: string | null | undefined; origin: string; host: string; cronAgeMin: number | null | undefined;
  test: "idle" | "sending" | "received" | "sent" | "none" | "error"; testMsg?: string;
};
export type Step = { id: StepId; state: StepState; label: string; detail: string; fix?: string };

export const STANDALONE_FIX = m.in("th", "pushSteps.standaloneFix"); // legacy th value (tests)
export const standaloneFix = () => m("pushSteps.standaloneFix");
export const CRON_OK_MIN = 10;

const ORDER: StepId[] = ["standalone", "support", "server", "login", "permission", "sw", "key", "sub", "saved", "route", "cron", "test"];
const LABEL: Record<StepId, string> = langObj(() => ({
  standalone: m("pushSteps.label.standalone"), support: m("pushSteps.label.support"), server: m("pushSteps.label.server"), login: m("pushSteps.label.login"),
  permission: m("pushSteps.label.permission"), sw: m("pushSteps.label.sw"), key: m("pushSteps.label.key"), sub: m("pushSteps.label.sub"),
  saved: m("pushSteps.label.saved"), route: m("pushSteps.label.route"), cron: m("pushSteps.label.cron"), test: m("pushSteps.label.test"),
}));
const DEPS: Record<StepId, StepId[]> = {
  standalone: [], support: ["standalone"], server: [], login: ["server"], permission: ["support"], sw: ["support"], key: ["server"],
  sub: ["permission", "sw", "key"], saved: ["sub", "login"], route: ["login"], cron: ["login"], test: ["saved"],
};

type Raw = { state: StepState; detail?: string; fix?: string };
const ok = (detail: string): Raw => ({ state: "ok", detail });
const wait = (detail = m("pushSteps.checking")): Raw => ({ state: "wait", detail });
const fail = (fix: string): Raw => ({ state: "fail", fix });
const warn = (fix: string): Raw => ({ state: "warn", fix });

function raw(id: StepId, f: Facts): Raw {
  switch (id) {
    case "standalone": return !f.ios ? ok(m("pushSteps.standalone.notNeeded")) : f.standalone ? ok(m("pushSteps.standalone.ok")) : fail(standaloneFix());
    case "support": return f.support ? ok(m("pushSteps.support.ok")) : fail(f.ios ? m("pushSteps.support.ios") : m("pushSteps.support.browser"));
    case "server":
      if (f.mode === "loading") return wait();
      if (f.mode === "server") return ok(m("pushSteps.server.ok", { host: f.host }));
      return f.reason === "unreachable"
        ? fail(m("pushSteps.server.unreachable"))
        : fail(m("pushSteps.server.unconfigured", { host: f.host }));
    case "login": return f.token ? ok(m("pushSteps.login.ok")) : fail(m("pushSteps.login.fail"));
    case "permission":
      if (f.permission === "granted") return ok(m("pushSteps.permission.ok"));
      if (f.permission === "default") return warn(m("pushSteps.permission.default"));
      if (f.permission === "denied") return fail(m("pushSteps.permission.denied"));
      return fail(m("pushSteps.permission.unsupported"));
    case "sw":
      if (f.sw === "active") return ok(m("pushSteps.sw.ok"));
      if (f.sw === "installing" || f.sw === "unknown") return wait(m("pushSteps.sw.installing"));
      return fail(m("pushSteps.sw.fail"));
    case "key":
      if (f.key === "ok") return ok(m("pushSteps.key.ok"));
      if (f.key === "unknown") return wait();
      return f.key === "missing" ? fail(m("pushSteps.key.missing")) : fail(m("pushSteps.key.error"));
    case "sub":
      if (f.sub === "ok") return ok(m("pushSteps.sub.ok"));
      if (f.sub === "unverified") return ok(m("pushSteps.sub.unverified"));
      if (f.sub === "unknown") return wait();
      return f.sub === "none" ? warn(m("pushSteps.sub.none")) : fail(m("pushSteps.sub.mismatch"));
    case "saved":
      if (f.saved === "yes") return ok(m("pushSteps.saved.ok", { n: f.devices ?? 0 }));
      if (f.saved === "unknown") return wait();
      return f.saved === "no" ? fail(m("pushSteps.saved.no")) : fail(m("pushSteps.saved.error"));
    case "route":
      if (f.appUrl === undefined) return wait();
      if (f.appUrl === null) return fail(m("pushSteps.route.none"));
      return f.appUrl === f.origin ? ok(m("pushSteps.route.ok"))
        : fail(m("pushSteps.route.other", { appUrl: f.appUrl, origin: f.origin }));
    case "cron":
      if (f.cronAgeMin === undefined) return wait();
      if (f.cronAgeMin !== null && f.cronAgeMin <= CRON_OK_MIN) return ok(m("pushSteps.cron.ok", { n: f.cronAgeMin }));
      return fail((f.cronAgeMin === null ? m("pushSteps.cron.never") : m("pushSteps.cron.stopped", { n: f.cronAgeMin })) + m("pushSteps.cronTail"));
    case "test":
      switch (f.test) {
        case "received": return ok(m("pushSteps.test.received"));
        case "sending": return wait(m("pushSteps.test.sending"));
        case "idle": return warn(m("pushSteps.test.idle"));
        case "sent": return warn(m("pushSteps.test.sent"));
        case "none": return fail(m("pushSteps.test.none"));
        default: return fail(f.testMsg || m("pushSteps.test.failed"));
      }
  }
}

export function pushSteps(f: Facts): Step[] {
  const out = new Map<StepId, Step & { root?: string }>();
  for (const id of ORDER) {
    let r = raw(id, f);
    if (id === "login" && f.saved === "unauthorized") r = fail(m("pushSteps.pinExpired")); // override before propagation
    out.set(id, { id, state: r.state, label: LABEL[id], detail: r.detail ?? r.fix ?? "", ...(r.fix ? { fix: r.fix } : {}) });
  }
  // Dependency pass in step order: a blocked dependency hides this step behind the first root cause.
  for (const id of ORDER) {
    const deps = DEPS[id].map((d) => out.get(d)!);
    const blocked = deps.find((d) => d.state === "fail" || d.state === "warn" || d.state === "skip");
    if (blocked) {
      const root = blocked.root ?? blocked.label;
      out.set(id, { id, state: "skip", label: LABEL[id], detail: m("pushSteps.waitFix", { root }), root });
    } else if (deps.some((d) => d.state === "wait")) out.set(id, { id, state: "wait", label: LABEL[id], detail: m("pushSteps.waitPrev") });
  }
  return ORDER.map((id) => { const { root: _root, ...s } = out.get(id)!; void _root; return s; });
}

export const firstFailing = (steps: Step[]) => steps.find((s) => s.state === "fail" || s.state === "warn");
