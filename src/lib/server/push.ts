// Server-only helpers for Web Push. Secrets come from Vercel env, never from the client.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export type PushRow = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };
export type Payload = { title: string; body: string; tag: string; badge?: number; url?: string };

export function serverEnv() {
  const env = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    vapidPublic: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapidPrivate: process.env.VAPID_PRIVATE_KEY,
    vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  };
  const missing = Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: env.url,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceKey,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: env.vapidPublic,
    VAPID_PRIVATE_KEY: env.vapidPrivate,
  }).filter(([, v]) => !v).map(([k]) => k);
  return { env, missing };
}

export function admin() {
  const { env } = serverEnv();
  return createClient(env.url!, env.serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidSet = false;
// Sends to every subscription; deletes ones the push service says are gone (404/410).
export async function sendToRows(rows: PushRow[], payload: Payload): Promise<number> {
  const { env } = serverEnv();
  if (!vapidSet) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublic!, env.vapidPrivate!);
    vapidSet = true;
  }
  let sent = 0;
  await Promise.all(rows.map(async (r) => {
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify(payload), { TTL: 900, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin().from("push_subscriptions").delete().eq("id", r.id);
    }
  }));
  return sent;
}

// Optional second channel. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Vercel to enable.
export async function telegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => {});
}
