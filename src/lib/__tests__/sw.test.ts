// v1.8 push deep links: public/sw.js notificationclick, run in a vm context with mocked self/clients/caches.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { URL_CASES } from "./url-cases";

const SRC = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "https://krob.test";

// A MessageChannel stand-in: whatever the page posts on port2 reaches port1.onmessage.
class FakeChannel {
  port1: { onmessage: ((m: { data: unknown }) => void) | null } = { onmessage: null };
  port2 = { postMessage: (d: unknown) => this.port1.onmessage?.({ data: d }) };
}
type Port = { postMessage: (d: unknown) => void };
type Client = { url: string; focus: () => Promise<void>; navigate: (u: string) => Promise<void>; postMessage: (m: unknown, ports: Port[]) => void; msgs: unknown[] };

function client(path: string, ack: boolean): Client {
  const msgs: unknown[] = [];
  return {
    url: ORIGIN + path, msgs,
    focus: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    postMessage: (m, ports) => { msgs.push(m); if (ack) ports[0].postMessage({ type: "krob-open-ok" }); },
  };
}

function load(list: Client[]) {
  const h: Record<string, (e: unknown) => void> = {};
  const opened: string[] = [];
  const self = {
    addEventListener: (t: string, f: (e: unknown) => void) => { h[t] = f; },
    location: { origin: ORIGIN },
    clients: { matchAll: async () => list, openWindow: async (u: string) => { opened.push(u); }, claim: async () => {} },
    registration: { showNotification: async () => {} },
    skipWaiting: () => {},
    navigator: {},
  };
  const caches = { open: async () => ({ add: async () => {}, put: async () => {} }), keys: async () => [], match: async () => undefined, delete: async () => true };
  vm.runInNewContext(SRC, {
    self, location: self.location, caches, URL, Response, MessageChannel: FakeChannel,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
  });
  const click = (url: unknown) => {
    let p: Promise<unknown> = Promise.resolve();
    h.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (x: Promise<unknown>) => { p = x; } });
    return p;
  };
  return { h, opened, click };
}

afterEach(() => { vi.useRealTimers(); });

describe("sw.js notificationclick", () => {
  it("registers the push handlers", () => {
    const { h } = load([]);
    for (const t of ["install", "activate", "fetch", "push", "pushsubscriptionchange", "notificationclick", "message"]) expect(typeof h[t]).toBe("function");
  });

  it("no open window: opens the safe url (cold start)", async () => {
    const { opened, click } = load([]);
    await click("/?do=water");
    expect(opened).toEqual(["/?do=water"]);
  });

  it("an acknowledging page routes in-app: focus, krob-open message, no navigate", async () => {
    const c = client("/gym", true);
    const { opened, click } = load([c]);
    await click("/?do=trade");
    expect(c.focus).toHaveBeenCalled();
    expect(c.msgs).toEqual([{ type: "krob-open", url: "/?do=trade" }]);
    expect(c.navigate).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });

  it("no ack in 700 ms: navigates when path + query differ", async () => {
    vi.useFakeTimers();
    const c = client("/", false);
    const { click } = load([c]);
    const p = click("/?do=care&r=pm");
    await vi.advanceTimersByTimeAsync(750);
    await p;
    expect(c.navigate).toHaveBeenCalledWith("/?do=care&r=pm");
  });

  it("no ack and already on that exact url: only focus", async () => {
    vi.useFakeTimers();
    const c = client("/insights?tab=review", false);
    const { click } = load([c]);
    const p = click("/insights?tab=review");
    await vi.advanceTimersByTimeAsync(750);
    await p;
    expect(c.focus).toHaveBeenCalled();
    expect(c.navigate).not.toHaveBeenCalled();
  });

  it("navigate failure falls back to openWindow", async () => {
    vi.useFakeTimers();
    const c = client("/", false);
    c.navigate = vi.fn(async () => { throw new Error("not controlled"); });
    const { opened, click } = load([c]);
    const p = click("/gym");
    await vi.advanceTimersByTimeAsync(750);
    await p;
    expect(opened).toEqual(["/gym"]);
  });

  it.each(URL_CASES)("sanitizes %j to %j", async (input, expected) => {
    const { opened, click } = load([]);
    await click(input);
    expect(opened).toEqual([expected]);
    const c = client("/body", true);
    await load([c]).click(input);
    expect(c.msgs).toEqual([{ type: "krob-open", url: expected }]);
  });

  it("missing notification data opens /", async () => {
    const { h, opened } = load([]);
    let p: Promise<unknown> = Promise.resolve();
    h.notificationclick({ notification: { close() {} }, waitUntil: (x: Promise<unknown>) => { p = x; } });
    await p;
    expect(opened).toEqual(["/"]);
  });
});
