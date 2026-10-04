"use client";

import { useEffect, useState } from "react";
import { NavBar, Section, toast } from "@/components/ui";
import { pushState, sendTest, type PushState } from "@/lib/push";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

type Status = {
  env: Record<string, boolean>;
  tables: Record<string, boolean> | null;
  lastTick: string | null;
  devices: number | null;
};

const ENV_HINT: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase URL",
  SUPABASE_SERVICE_ROLE_KEY: "คีย์ลับ service_role (Vercel เท่านั้น)",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "VAPID public key",
  VAPID_PRIVATE_KEY: "VAPID private key",
  VAPID_SUBJECT: "mailto:อีเมลของคุณ",
  CRON_SECRET: "รหัสลับที่ใส่ใน SQL ด้วย",
  TELEGRAM: "ไม่บังคับ: Telegram bot",
};

function Check({ ok, label, hint, optional }: { ok: boolean | null | undefined; label: string; hint?: string; optional?: boolean }) {
  return (
    <div className="row">
      <span className="row-main">
        <div className="row-title" style={{ fontSize: 15 }}>{label}</div>
        {hint && <div className="row-sub">{hint}</div>}
      </span>
      <span className={ok ? "pill-on" : optional ? "row-value" : "pill-off"} style={{ fontSize: 14 }}>{ok ? "พร้อม" : ok === null || ok === undefined ? "-" : optional ? "ไม่ได้ตั้ง" : "ยังไม่มี"}</span>
    </div>
  );
}

export default function SystemStatus() {
  const { session, sync } = useStore();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [device, setDevice] = useState<PushState | null>(null);
  const [now, setNow] = useState(0);

  async function load() {
    setErr("");
    setNow(Date.now());
    setDevice(await pushState());
    if (!session) return setErr("ต้องเข้าสู่ระบบก่อน");
    const r = await fetch("/api/push/status", { method: "POST", headers: { authorization: `Bearer ${session.access_token}` } }).catch(() => null);
    if (!r) return setErr("เชื่อมต่อ server ไม่ได้");
    if (r.status === 404) return setErr("เว็บนี้ยังเป็นเวอร์ชันเก่า (ยังไม่มี API) ให้ push โค้ดล่าสุดขึ้น GitHub ก่อน");
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return setErr(`ตรวจไม่ได้ (${r.status})`);
    setSt(j);
  }
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const tickAge = st?.lastTick && now ? Math.round((now - new Date(st.lastTick).getTime()) / 60000) : null;
  const ready = !!st && Object.entries(st.env).every(([k, v]) => v || k === "TELEGRAM") && !!st.tables && Object.values(st.tables).every(Boolean) && tickAge !== null && tickAge < 5 && (st.devices ?? 0) > 0;

  return (
    <main className="screen">
      <NavBar title="สถานะระบบ" sub={ready ? "ระบบแจ้งเตือนพร้อมใช้งาน" : "เช็กว่าการแจ้งเตือนตอนปิดแอปพร้อมหรือยัง"} />

      {err && <Section><div className="row"><span className="row-main row-title" style={{ color: "var(--red)", fontSize: 15 }}>{err}</span></div></Section>}

      <Section header="เครื่องนี้">
        <Check ok={!!session} label="เข้าสู่ระบบ Supabase" hint={session?.user.email} />
        <Check ok={sync === "synced"} label="ซิงค์ข้อมูล" hint={sync} />
        <Check ok={device === "on"} label="อนุญาตแจ้งเตือนบนเครื่องนี้" hint={device === "needs-install" ? "ต้องเปิดจากไอคอนหน้าจอโฮม" : device === "off" ? "เปิดที่ ตั้งค่า > การแจ้งเตือน" : undefined} />
      </Section>

      {st && (
        <>
          <Section header="ค่าตั้งค่าบน Vercel" footer="ใส่ที่ Vercel > Project > Settings > Environment Variables แล้ว Redeploy">
            {Object.entries(st.env).map(([k, v]) => <Check key={k} ok={v} label={k} hint={ENV_HINT[k]} optional={k === "TELEGRAM"} />)}
          </Section>

          <Section header="ฐานข้อมูล Supabase" footer="ถ้ายังไม่มี ให้รัน supabase/v0.3-push.sql ใน SQL Editor">
            {st.tables ? Object.entries(st.tables).map(([k, v]) => <Check key={k} ok={v} label={k} />) : <Check ok={false} label="ต้องมี URL + service_role ก่อนจึงตรวจได้" />}
          </Section>

          <Section header="ตัวสั่งงานทุกนาที (pg_cron)">
            <Check ok={tickAge !== null && tickAge < 5} label="ทำงานล่าสุด" hint={st.lastTick ? `${tickAge} นาทีที่แล้ว` : "ยังไม่เคยทำงาน - เช็ก APP_URL และ CRON_SECRET ใน SQL"} />
            <Check ok={(st.devices ?? 0) > 0} label="อุปกรณ์ที่รับแจ้งเตือน" hint={st.devices === null ? undefined : `${st.devices} เครื่อง`} />
          </Section>
        </>
      )}

      <Section>
        <button className="row" onClick={() => { play("tap"); load(); }}><span className="row-main row-title link">ตรวจอีกครั้ง</span></button>
        {session && device === "on" && (
          <button className="row" onClick={async () => { play("tap"); toast(await sendTest(session)); }}><span className="row-main row-title link">ส่งแจ้งเตือนทดสอบไป iPhone</span></button>
        )}
        {!supabase && <div className="row"><span className="row-main row-sub">เว็บนี้ยังไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL</span></div>}
      </Section>
    </main>
  );
}
