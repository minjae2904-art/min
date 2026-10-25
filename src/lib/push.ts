"use client";

import { STANDALONE_FIX, type Facts, type StepId } from "./push-steps";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";
export type PushResult = { ok: true } | { ok: false; step: StepId; msg: string };
export type HealAction = "none" | "posted" | "resubscribed" | "need-tap" | "error" | "enabled";
export type HealRecord = { at: number; ok: boolean; action: HealAction; ep: string };

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const canPush = () => "serviceWorker" in navigator && "PushManager" in window;

const bearer = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const authed = (token: string, method: string, body?: unknown, ms = 10_000) =>
  fetch("/api/push/" + (method === "TEST" ? "test" : "subscribe"), {
    method: method === "TEST" ? "POST" : method,
    headers: bearer(token),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms),
  });

// Rejects with name "TimeoutError" so callers can map it like any DOMException.
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { const e = new Error("timeout"); e.name = "TimeoutError"; reject(e); }, ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// First statement of any tap handler that may subscribe: iOS shows the prompt only inside the user gesture.
export function askPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return Promise.resolve("denied");
  try { return Promise.resolve(Notification.requestPermission()); } catch { return Promise.resolve("denied"); }
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// The server key the cron signs with. Only a fresh HTTP 200 counts (no env fallback: it may differ from the DB key).
type KeyRes = { key: string } | { status: "missing" | "error" };
async function vapidKey(): Promise<KeyRes> {
  try {
    const r = await fetch("/api/push/vapid", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.status === 503) return { status: "missing" };
    if (r.status !== 200) return { status: "error" };
    const j = (await r.json()) as { publicKey?: string };
    return typeof j.publicKey === "string" && j.publicKey ? { key: j.publicKey.replace(/\s+/g, "") } : { status: "missing" };
  } catch { return { status: "error" }; }
}

// "unknown" = the browser does not expose the key the subscription was made with: never unsubscribe on that.
export function keyMatch(sub: PushSubscription, key: string): "match" | "mismatch" | "unknown" {
  try {
    const raw = sub.options?.applicationServerKey;
    if (!raw) return "unknown";
    const a = new Uint8Array(raw), b = b64ToBytes(key);
    if (!a.length) return "unknown";
    return a.length === b.length && a.every((x, i) => x === b[i]) ? "match" : "mismatch";
  } catch { return "unknown"; }
}

// Warm cache so the tap handler has no network between the permission answer and subscribe().
const WARM_MS = 10 * 60_000;
const warm: { reg?: ServiceWorkerRegistration; regAt: number; key?: string; keyAt: number } = { regAt: 0, keyAt: 0 };
async function readyReg(ms = 8000) {
  if (warm.reg && Date.now() - warm.regAt < WARM_MS) return warm.reg;
  const reg = await withTimeout(navigator.serviceWorker.ready, ms);
  warm.reg = reg; warm.regAt = Date.now();
  return reg;
}
async function cachedKey(): Promise<KeyRes> {
  if (warm.key && Date.now() - warm.keyAt < WARM_MS) return { key: warm.key };
  const k = await vapidKey();
  if ("key" in k) { warm.key = k.key; warm.keyAt = Date.now(); }
  return k;
}
export async function prefetchPush(): Promise<{ reg: ServiceWorkerRegistration | null; key: KeyRes }> {
  if (!canPush()) return { reg: null, key: await cachedKey() };
  const [reg, key] = await Promise.all([readyReg().catch(() => null), cachedKey()]);
  return { reg, key };
}

const HEAL_KEY = "krob-push-heal";
// Set by "ปิดบนเครื่องนี้": iOS keeps the permission "granted", so without it heal would silently re-subscribe.
// Cleared only by a successful enablePush (explicit tap).
const OFF_KEY = "krob-push-off";
export function pushOptedOut(): boolean {
  try { return localStorage.getItem(OFF_KEY) === "1"; } catch { return false; }
}
function record(ok: boolean, action: HealAction, endpoint = "") {
  try { localStorage.setItem(HEAL_KEY, JSON.stringify({ at: Date.now(), ok, action, ep: endpoint.slice(-24) } satisfies HealRecord)); } catch {}
}
export function readHeal(): HealRecord | null {
  try { const j = JSON.parse(localStorage.getItem(HEAL_KEY) ?? "null"); return j && typeof j.at === "number" ? j : null; } catch { return null; }
}

const subBody = (sub: PushSubscription, claim: boolean) => {
  const j = sub.toJSON();
  return { endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, ua: navigator.userAgent, ...(claim ? { claim: true } : {}) };
};
const subscribe = (reg: ServiceWorkerRegistration, key: string) =>
  withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }), 15_000);

function subError(e: unknown) {
  const name = (e as Error)?.name ?? "Error", message = String((e as Error)?.message ?? "");
  switch (name) {
    case "NotAllowedError": return "iPhone ไม่อนุญาต (NotAllowedError) แตะปุ่มอีกครั้ง";
    case "AbortError": return "Apple ปฏิเสธการลงทะเบียน (AbortError) ลองใหม่ หรือรีสตาร์ต iPhone";
    case "InvalidStateError": return "Service worker ไม่พร้อม (InvalidStateError) ปิดแอปแล้วเปิดใหม่";
    case "InvalidAccessError": return "คีย์ server ไม่ถูกต้อง (InvalidAccessError)";
    case "TimeoutError": return "ลงทะเบียนนานเกินไป (TimeoutError) ลองใหม่";
    default: return `ลงทะเบียนไม่สำเร็จ (${name}: ${message.slice(0, 60)})`;
  }
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iOS only exposes PushManager to web apps added to the Home Screen.
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!canPush() || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

// perm = askPermission() started as the first statement of the tap handler. force = drop the local subscription first
// (key mismatch, or a test that never arrived). Saving claims the cron route for this host (explicit tap).
export async function enablePush(token: string | null, perm: Promise<NotificationPermission>, opt: { force?: boolean } = {}): Promise<PushResult> {
  const fail = (step: StepId, msg: string): PushResult => ({ ok: false, step, msg });
  if (!token) return fail("login", "ต้องเข้าด้วย PIN ก่อน");
  if (isIOS() && !isStandalone()) return fail("standalone", STANDALONE_FIX);
  const p = await perm.catch(() => "default" as NotificationPermission);
  if (p === "denied") return fail("permission", "iPhone ปิดการแจ้งเตือนของ Krob ไว้: การตั้งค่า > การแจ้งเตือน > Krob");
  if (p !== "granted") return fail("permission", "ยังไม่ได้กดอนุญาต แตะอีกครั้งแล้วเลือก 'อนุญาต'");
  if (!canPush()) return fail("support", "เบราว์เซอร์นี้ไม่รองรับ Web Push");
  const k = await cachedKey();
  if (!("key" in k)) return fail("key", k.status === "missing" ? "server ยังไม่พร้อมส่ง (ดู สถานะระบบ)" : "ติดต่อ server ไม่ได้ (หมดเวลา)");
  let reg: ServiceWorkerRegistration;
  try { reg = await readyReg(); } catch { return fail("sw", "Service worker ยังไม่ทำงาน ปิดแอปแล้วเปิดใหม่"); }
  let sub = await reg.pushManager.getSubscription().catch(() => null);
  let old: string | null = null;
  if (sub && (opt.force || keyMatch(sub, k.key) === "mismatch")) { old = sub.endpoint; await sub.unsubscribe().catch(() => false); sub = null; }
  if (!sub) {
    try { sub = await subscribe(reg, k.key); } catch (e) { return fail("sub", subError(e)); }
  }
  if (old && old !== sub.endpoint) await authed(token, "DELETE", { endpoint: old }, 5000).catch(() => null);
  const r = await authed(token, "POST", subBody(sub, true)).catch(() => null);
  if (!r) return fail("saved", "ส่งข้อมูลไป server ไม่ได้");
  if (r.status === 401) return fail("saved", "PIN หมดอายุ เข้าใหม่อีกครั้ง");
  if (r.status === 400) return fail("saved", "ข้อมูลลงทะเบียนไม่ถูกต้อง (400)");
  if (!r.ok) return fail("saved", `บันทึกลง server ไม่สำเร็จ (${r.status}) ดูตาราง push_subscriptions ใน สถานะระบบ`);
  try { localStorage.removeItem(OFF_KEY); } catch {}
  record(true, "enabled", sub.endpoint);
  return { ok: true };
}

// Everything the setup checker needs, each probe with its own timeout. The endpoint travels in a header only.
export async function collectFacts(token: string | null, auth: { mode: Facts["mode"]; reason: Facts["reason"] }): Promise<Facts> {
  const support = canPush() && "Notification" in window;
  const f: Facts = {
    ios: isIOS(), standalone: isStandalone(), support, mode: auth.mode, reason: auth.reason, token: !!token,
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    sw: "unknown", key: "unknown", sub: "unknown", saved: "unknown", devices: null, appUrl: undefined,
    origin: location.origin, host: location.host, cronAgeMin: undefined, test: "idle",
  };
  let reg: ServiceWorkerRegistration | null = null;
  if ("serviceWorker" in navigator) {
    try {
      const r = await withTimeout(navigator.serviceWorker.getRegistration(), 3000);
      if (r?.active) { reg = r; f.sw = "active"; }
      else if (r?.installing || r?.waiting) f.sw = "installing";
      else {
        await registerSW();
        reg = await withTimeout(navigator.serviceWorker.ready, 3000).catch(() => null);
        f.sw = reg ? "active" : "none";
      }
    } catch { f.sw = "timeout"; }
  } else f.sw = "none";

  let key: string | null = null;
  if (auth.mode === "server") {
    const k = (await prefetchPush().catch(() => null))?.key ?? { status: "error" as const };
    if ("key" in k) { f.key = "ok"; key = k.key; } else f.key = k.status;
  }

  let sub: PushSubscription | null = null;
  if (reg && support) {
    try {
      sub = await withTimeout(reg.pushManager.getSubscription(), 3000);
      f.sub = !sub ? "none" : !key ? "unverified" : ({ match: "ok", mismatch: "mismatch", unknown: "unverified" } as const)[keyMatch(sub, key)];
    } catch { f.sub = "unknown"; }
  }

  if (token && auth.mode === "server") {
    const r = await fetch("/api/push/status", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${token}`, ...(sub ? { "x-push-endpoint": sub.endpoint } : {}) },
    }).catch(() => null);
    const j = r?.ok ? ((await r.json().catch(() => null)) as { auth?: boolean; devices?: number | null; lastTick?: string | null; push?: { appUrl?: string | null }; thisDevice?: boolean | null } | null) : null;
    if (r?.status === 401 || j?.auth === false) f.saved = "unauthorized";
    else if (!j) { if (sub) f.saved = "error"; }
    else {
      f.devices = j.devices ?? null;
      f.appUrl = j.push?.appUrl ?? null;
      f.cronAgeMin = j.lastTick ? Math.max(0, Math.round((Date.now() - Date.parse(j.lastTick)) / 60_000)) : null;
      if (sub) f.saved = j.thisDevice === true ? "yes" : j.thisDevice === false ? "no" : "error";
    }
  }
  return f;
}

// "ใช้เว็บนี้ส่งแจ้งเตือน": re-save this device with claim, which points the cron at this host.
export async function claimHost(token: string | null): Promise<boolean> {
  if (!token || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return false;
  const r = await authed(token, "POST", subBody(sub, true)).catch(() => null);
  return !!r?.ok;
}

export async function disablePush(token: string | null) {
  try { localStorage.setItem(OFF_KEY, "1"); } catch {} // before the early return: the intent sticks even with no subscription
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (token) await authed(token, "DELETE", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function testPush(token: string | null): Promise<{ ok: boolean; devices: number; sent: number; failed: number; msg: string }> {
  const none = { devices: 0, sent: 0, failed: 0 };
  if (!token) return { ok: false, ...none, msg: "ต้องเข้าด้วย PIN ก่อน" };
  const r = await authed(token, "TEST", undefined, 20_000).catch(() => null);
  if (!r) return { ok: false, ...none, msg: "เชื่อมต่อไม่ได้" };
  const j = (await r.json().catch(() => ({}))) as { missing?: string[]; devices?: number; sent?: number; failed?: number };
  if (r.status === 401) return { ok: false, ...none, msg: "PIN หมดอายุ เข้าใหม่อีกครั้ง" };
  if (!r.ok) return { ok: false, ...none, msg: j.missing ? `server ยังขาด: ${j.missing.join(", ")}` : `ส่งไม่สำเร็จ (${r.status})` };
  const devices = j.devices ?? 0, sent = j.sent ?? 0, failed = j.failed ?? 0;
  const msg = sent ? `ส่งแล้วไปยัง ${sent} เครื่อง` : devices ? "ส่งไม่ถึงเครื่องไหนเลย" : "ยังไม่มีเครื่องที่เปิดการแจ้งเตือน";
  return { ok: true, devices, sent, failed, msg };
}

export async function sendTest(token: string | null): Promise<string> {
  return (await testPush(token)).msg;
}

// Clears shown notifications with this tag, so waitForPush's fallback poll never counts an old one.
export async function closeNotifications(tag: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications({ tag }))?.forEach((n) => n.close());
  } catch {}
}

// Resolves true when this device shows a push with the tag: the SW message, or (an older worker that does not post
// messages yet) a notification with that tag appearing in getNotifications. [verify on device]
export function waitForPush(tag: string, ms = 20_000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  const sw = navigator.serviceWorker;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      sw.removeEventListener("message", onMsg);
      clearInterval(poll); clearTimeout(timer);
      resolve(v);
    };
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "krob-push" && e.data.tag === tag) finish(true); };
    sw.addEventListener("message", onMsg);
    const poll = setInterval(async () => {
      try {
        const reg = await sw.getRegistration();
        if (((await reg?.getNotifications({ tag })) ?? []).length) finish(true);
      } catch {}
    }, 1000);
    const timer = setTimeout(() => finish(false), ms);
  });
}

// Silent repair on app open (permission already granted): never prompts, never toasts, never force-resubscribes,
// never unsubscribes on an unreadable key, never claims the cron route, never runs after "ปิดบนเครื่องนี้".
// At most once per token per HEAL_EVERY_MS (app open and resume); again=true re-runs it after the SW reports
// pushsubscriptionchange.
const HEAL_EVERY_MS = 6 * 3_600_000;
const healed = new Map<string, number>();
export async function healPush(token: string | null, again = false): Promise<void> {
  try {
    if (!token || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (isIOS() && !isStandalone()) return;
    if (!canPush() || pushOptedOut()) return;
    const last = healed.get(token);
    if (!again && last !== undefined && Date.now() - last < HEAL_EVERY_MS) return;
    healed.set(token, Date.now()); // before the first await: two quick resumes never heal in parallel
    const reg = await withTimeout(navigator.serviceWorker.ready, 8000);
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const r = await fetch("/api/push/status", { cache: "no-store", headers: { authorization: `Bearer ${token}`, "x-push-endpoint": sub.endpoint }, signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (!r?.ok) return;
      const j = (await r.json().catch(() => null)) as { thisDevice?: boolean | null } | null;
      if (j?.thisDevice === true) return record(true, "none", sub.endpoint);
      if (j?.thisDevice !== false) return;
      const k = await vapidKey();
      if (!("key" in k)) return;
      let s = sub, action: HealAction = "posted";
      if (keyMatch(sub, k.key) === "mismatch") {
        await sub.unsubscribe().catch(() => false);
        try { s = await subscribe(reg, k.key); action = "resubscribed"; } catch { return record(false, "need-tap", sub.endpoint); }
      }
      const p = await authed(token, "POST", subBody(s, false)).catch(() => null);
      return record(!!p?.ok, p?.ok ? action : "error", s.endpoint);
    }
    const k = await vapidKey();
    if (!("key" in k)) return;
    let s: PushSubscription;
    try { s = await subscribe(reg, k.key); } catch { return record(false, "need-tap"); }
    const p = await authed(token, "POST", subBody(s, false)).catch(() => null);
    record(!!p?.ok, p?.ok ? "resubscribed" : "error", s.endpoint);
  } catch { record(false, "error"); }
}

// Update toast: the server's build id differs from the one baked into this bundle ("dev" = off).
const BUILD = process.env.KROB_BUILD || "dev";
export async function checkForUpdate(): Promise<boolean> {
  if (BUILD === "dev") return false;
  try {
    const r = await fetch("/api/version", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const j = r.ok ? ((await r.json()) as { build?: string }) : null;
    return !!j?.build && j.build !== "dev" && j.build !== BUILD;
  } catch { return false; }
}

// Only ever called from a tap on the update toast. The page HTML is fetched fresh and written over the cached copy
// first, so the SW's 2.5 s cached-navigation fallback serves the new build on a slow link; if the fetch fails the
// cached page (offline fallback) stays untouched.
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await withTimeout(reg.update(), 5000).catch(() => {});
      reg.waiting?.postMessage({ type: "skip-waiting" });
    }
  } catch {}
  try {
    const r = await withTimeout(fetch(location.pathname, { cache: "no-store" }), 8000);
    if (r.ok && typeof caches !== "undefined") for (const k of await caches.keys()) await (await caches.open(k)).put(location.pathname, r.clone());
  } catch {}
  location.reload();
}

export function setBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try { (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {}); } catch {}
}
