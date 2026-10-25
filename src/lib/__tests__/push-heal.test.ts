import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// healPush / disablePush / enablePush with stubbed browser globals (non-iOS UA, permission granted).
type Sub = { endpoint: string; options: { applicationServerKey: null }; toJSON: () => unknown; unsubscribe: () => Promise<boolean> };
const mkSub = (ep: string): Sub => ({ endpoint: ep, options: { applicationServerKey: null }, toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }), unsubscribe: vi.fn(async () => true) });

let current: Sub | null;
let pm: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let fetchMock: ReturnType<typeof vi.fn>;
let store: Map<string, string>;

async function load() {
  vi.resetModules();
  return import("../push");
}

beforeEach(() => {
  current = null;
  store = new Map();
  pm = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => { current = mkSub("https://push.example/new"); return current; }),
  };
  const reg = { pushManager: pm };
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/push/vapid") return new Response(JSON.stringify({ publicKey: "AAAA" }), { status: 200 });
    if (url === "/api/push/status") return new Response(JSON.stringify({ thisDevice: true }), { status: 200 });
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("window", { PushManager: function PushManager() {}, matchMedia: () => ({ matches: true }) });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", serviceWorker: { ready: Promise.resolve(reg), getRegistration: async () => reg } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const posts = () => fetchMock.mock.calls.filter(([u, o]) => u === "/api/push/subscribe" && o?.method === "POST").length;

describe("healPush", () => {
  it("re-subscribes silently when permission is granted and no subscription exists", async () => {
    const p = await load();
    await p.healPush("t");
    expect(pm.subscribe).toHaveBeenCalledTimes(1);
    expect(posts()).toBe(1);
    expect(p.readHeal()?.action).toBe("resubscribed");
  });
  it("never runs after 'ปิดบนเครื่องนี้' (disablePush), even with the permission still granted", async () => {
    const p = await load();
    current = mkSub("https://push.example/old");
    await p.disablePush("t");
    expect(p.pushOptedOut()).toBe(true);
    current = null;
    fetchMock.mockClear();
    await p.healPush("t");
    await p.healPush("t", true);
    expect(pm.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("disablePush records the opt-out even when there is no subscription", async () => {
    const p = await load();
    await p.disablePush("t");
    expect(p.pushOptedOut()).toBe(true);
  });
  it("a successful enablePush (explicit tap) clears the opt-out", async () => {
    const p = await load();
    store.set("krob-push-off", "1");
    expect(await p.enablePush("t", Promise.resolve("granted"))).toEqual({ ok: true });
    expect(p.pushOptedOut()).toBe(false);
  });
  it("throttles to once per 6 h per token; again=true bypasses it", async () => {
    const p = await load();
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    await p.healPush("t");
    current = null; // dropped again
    await p.healPush("t");
    expect(pm.subscribe).toHaveBeenCalledTimes(1);
    current = null;
    await p.healPush("t", true);
    expect(pm.subscribe).toHaveBeenCalledTimes(2);
    current = null;
    now.mockReturnValue(t0 + 7 * 3_600_000);
    await p.healPush("t");
    expect(pm.subscribe).toHaveBeenCalledTimes(3);
  });
});
