// Called every minute by Supabase pg_cron (supabase/v0.7-config.sql). Sends due reminders as Web Push.
import { timingSafeEqual } from "node:crypto";
import { wallClock } from "@/lib/date";
import { normalize } from "@/lib/model";
import { dueReminders, groupReminders } from "@/lib/reminders";
import { getPushConfig } from "@/lib/server/config";
import { admin, safeError, sendToRows, serverEnv, telegram, type PushRow } from "@/lib/server/push";

export const runtime = "nodejs";
export const maxDuration = 30;

function sameSecret(got: string, want: string) {
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const { missing } = serverEnv();
  if (missing.length) return Response.json({ error: "server not configured" }, { status: 500 });
  const cfg = await getPushConfig();
  if (!cfg || !sameSecret(req.headers.get("authorization")?.trim() ?? "", `Bearer ${cfg.cronSecret}`)) {
    console.error(safeError(new Error("cron secret mismatch"), "push/tick"));
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = admin();
  // Heartbeat so Settings > สถานะระบบ can show the cron reached Vercel (ignore if the table is missing).
  await db.from("krob_heartbeat").upsert({ id: 1, at: new Date().toISOString() });
  const { data: subs, error } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth");
  if (error) return Response.json({ error: safeError(error, "push/tick") }, { status: 500 });

  const byUser = new Map<string, PushRow[]>();
  for (const r of (subs ?? []) as PushRow[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const now = wallClock();
  let sent = 0, failed = 0;
  for (const [userId, rows] of byUser) {
    try {
      const { data: st } = await db.from("app_state").select("data").eq("user_id", userId).maybeSingle();
      if (!st) continue;
      const s = normalize(st.data);
      const { date, reminders, badge } = dueReminders(s, now);
      if (!reminders.length) continue;
      // Insert-or-ignore: rows come back only for keys not logged yet, so each reminder is sent once.
      const { data: logged } = await db
        .from("notification_log")
        .upsert(reminders.map((r) => ({ user_id: userId, date, key: r.key })), { onConflict: "user_id,date,key", ignoreDuplicates: true })
        .select("key");
      const keys = new Set((logged ?? []).map((x) => x.key));
      const fresh = reminders.filter((r) => keys.has(r.key));
      if (!fresh.length) continue;
      // Several in the same minute (e.g. meal + whey at 13:30) -> one notification led by the most important.
      // v1.8 deep link: the lead reminder's url (sanitized again by sw.js before it opens anything).
      const g = groupReminders(fresh, s.settings.privateNotifications);
      const res = await sendToRows(rows, { ...g, badge, url: g.url ?? "/" }, cfg);
      sent += res.sent;
      failed += res.failed;
      const tg = fresh.filter((r) => r.level !== "due");
      const tgSent = tg.length > 0 && (await telegram(tg.map((r) => `${r.title}\n${r.body}`).join("\n\n")));
      // No push got through: forget the log rows so the next minute retries while the reminder is still due,
      // except the ones Telegram delivered (otherwise Telegram would repeat them every minute).
      const retry = fresh.filter((r) => !(tgSent && r.level !== "due")).map((r) => r.key);
      if (!res.sent && res.failed && retry.length) await db.from("notification_log").delete().eq("user_id", userId).eq("date", date).in("key", retry);
    } catch (e) {
      safeError(e, "tick/user");
      failed++;
    }
  }
  return Response.json({ ok: true, users: byUser.size, sent, failed, at: now.toISOString() });
}
