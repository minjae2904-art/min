"use client";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.replace(/s+/g, "");

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

const authed = (token: string, method: string, body?: unknown) =>
  fetch("/api/push/" + (method === "TEST" ? "test" : "subscribe"), {
    method: method === "TEST" ? "POST" : method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iOS only exposes PushManager to web apps added to the Home Screen.
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// Must run inside a tap handler (iOS requires a user gesture for the permission prompt).
export async function enablePush(token: string | null): Promise<string | null> {
  if (!token) return "ต้องเข้าด้วย PIN ก่อน";
  if (!VAPID) return "server ยังไม่ได้ตั้งค่า NEXT_PUBLIC_VAPID_PUBLIC_KEY";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "ไม่ได้รับอนุญาตให้แจ้งเตือน";
  const reg = (await registerSW()) ?? (await navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) }));
  const j = sub.toJSON();
  const r = await authed(token, "POST", { endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, ua: navigator.userAgent }).catch(() => null);
  if (!r) return "เชื่อมต่อ server ไม่ได้";
  if (!r.ok) return `บันทึกไม่สำเร็จ (${r.status})`;
  return null;
}

export async function disablePush(token: string | null) {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (token) await authed(token, "DELETE", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function sendTest(token: string | null): Promise<string> {
  if (!token) return "ต้องเข้าด้วย PIN ก่อน";
  const r = await authed(token, "TEST").catch(() => null);
  if (!r) return "เชื่อมต่อไม่ได้";
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return j.missing ? `server ยังขาด: ${j.missing.join(", ")}` : `ส่งไม่สำเร็จ (${r.status})`;
  return j.sent ? `ส่งแล้วไปยัง ${j.sent} เครื่อง` : "ยังไม่มีเครื่องที่เปิดการแจ้งเตือน";
}

export function setBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try { (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {}); } catch {}
}
