// Server-only helpers for Web Push. Secrets come from Vercel env, never from the client.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export type PushRow = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };
export type Payload = { title: string; body: string; tag: string; badge?: number; url?: string };

// Keys pasted into Vercel sometimes carry line breaks/spaces; they are never valid inside a key.
const clean = (v?: string) => v?.replace(/\s+/g, "") || undefined;

export function serverEnv() {
  const env = {
    url: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vapidPublic: clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivate: clean(process.env.VAPID_PRIVATE_KEY),
    vapidSubject: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com",
  };
  // Only the database connection is required; push keys are generated and stored by the server (config.ts).
  const missing = Object.entries({ NEXT_PUBLIC_SUPABASE_URL: env.url, SUPABASE_SERVICE_ROLE_KEY: env.serviceKey })
    .filter(([, v]) => !v).map(([k]) => k);
  return { env, missing };
}

export const cronSecret = () => clean(process.env.CRON_SECRET);

// Never send library error text to the client: it can echo request headers (i.e. the service key).
// Log a redacted copy server-side and return a generic message.
export function safeError(e: unknown, where: string): string {
  const raw = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  console.error(`[${where}]`, raw.replace(/(sb_secret_|sb_publishable_|eyJ)[\w.\-\s]+/g, "$1[redacted]").replace(/Bearer\s+\S+/g, "Bearer [redacted]"));
  return "server error";
}

export function admin() {
  const { env } = serverEnv();
  return createClient(env.url!, env.serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(10_000) }) },
  });
}

export type Vapid = { vapidPublic: string; vapidPrivate: string; subject: string };

// Sends to every subscription; deletes ones the push service says are gone (404/410) or signed with
// another VAPID key (403). Other failures are logged (never the endpoint) and counted.
export async function sendToRows(rows: PushRow[], payload: Payload, v: Vapid): Promise<{ sent: number; failed: number }> {
  const vapidDetails = { subject: v.subject, publicKey: v.vapidPublic, privateKey: v.vapidPrivate };
  let sent = 0, failed = 0;
  await Promise.all(rows.map(async (r) => {
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify(payload), { TTL: 900, urgency: "high", vapidDetails, timeout: 8000 });
      sent++;
    } catch (e) {
      const we = e as { statusCode?: number; body?: string };
      if (we.statusCode === 404 || we.statusCode === 410 || we.statusCode === 403) await admin().from("push_subscriptions").delete().eq("id", r.id);
      else {
        console.error("[push/send]", { id: r.id, code: we.statusCode ?? 0, body: we.body?.slice(0, 200) });
        failed++;
      }
    }
  }));
  return { sent, failed };
}

// Optional second channel. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Vercel to enable.
// Returns true only when Telegram accepted the message (false when not configured or it failed).
export async function telegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  return !!res?.ok;
}
