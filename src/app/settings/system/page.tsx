"use client";

import { useEffect, useState } from "react";
import { NavBar, Section, toast } from "@/components/ui";
import { pushState, sendTest, type PushState } from "@/lib/push";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

type Status = {
  env: Record<string, boolean>;
  push?: { config: boolean; vapid: boolean; source: string | null; appUrl: string | null; cronSecret: boolean };
  tables: Record<string, boolean> | null;
  lastTick: string | null;
  devices: number | null;
};

const ENV_HINT: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase URL",
  SUPABASE_SERVICE_ROLE_KEY: "คีย์ลับ service_role (Vercel เท่านั้น)",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "ไม่บังคับแล้ว: server สร้างเอง",
  VAPID_PRIVATE_KEY: "ไม่บังคับแล้ว: server สร้างเอง",
  VAPID_SUBJECT: "ไม่บังคับ",
  CRON_SECRET: "ไม่บังคับแล้ว: server สร้างเอง",
  GEMINI_API_KEY: "ไม่บังคับ: AI โค้ชด้วย Gemini (aistudio.google.com)",
  ANTHROPIC_API_KEY: "ไม่บังคับ: AI โค้ชด้วย Claude (ใช้เมื่อไม่มี Gemini)",
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
  const { sync, auth } = useStore();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [device, setDevice] = useState<PushState | null>(null);
  const [now, setNow] = useState(0);

  async function load() {
    setErr("");
    setNow(Date.now());
    setDevice(await pushState());
    const r = await fetch("/api/push/status", { method: "POST", headers: { authorization: `Bearer ${auth.token}` } }).catch(() => null);
    if (!r) return setErr("เชื่อมต่อ server ไม่ได้");
    if (r.status === 404) return setErr("เว็บนี้ยังเป็นเวอร์ชันเก่า (ยังไม่มี API) ให้ push โค้ดล่าสุดขึ้น GitHub ก่อน");
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return setErr(`ตรวจไม่ได้ (${r.status})`);
    setSt(j);
  }
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [auth.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const tickAge = st?.lastTick && now ? Math.round((now - new Date(st.lastTick).getTime()) / 60000) : null;
  const OPTIONAL = ["TELEGRAM", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "CRON_SECRET"];
  const ready = !!st && st.env.NEXT_PUBLIC_SUPABASE_URL && st.env.SUPABASE_SERVICE_ROLE_KEY && !!st.tables && Object.values(st.tables).every(Boolean) && !!st.push?.appUrl && tickAge !== null && tickAge < 5 && (st.devices ?? 0) > 0;

  return (
    <main className="screen">
      <NavBar title="สถานะระบบ" sub={ready ? "ระบบแจ้งเตือนพร้อมใช้งาน" : "เช็กว่าการแจ้งเตือนตอนปิดแอปพร้อมหรือยัง"} />

      {err && <Section><div className="row"><span className="row-main row-title" style={{ color: "var(--red)", fontSize: 15 }}>{err}</span></div></Section>}

      <Section header="เครื่องนี้">
        <Check ok={!!auth.token} label="เข้าด้วย PIN (เชื่อม server)" hint={auth.mode === "local" ? "server ยังไม่พร้อม: ต้องมี SUPABASE_SERVICE_ROLE_KEY" : undefined} />
        <Check ok={sync === "synced"} label="ซิงค์ข้อมูล" hint={sync} />
        <Check ok={device === "on"} label="อนุญาตแจ้งเตือนบนเครื่องนี้" hint={device === "needs-install" ? "ต้องเปิดจากไอคอนหน้าจอโฮม" : device === "off" ? "เปิดที่ ตั้งค่า > การแจ้งเตือน" : undefined} />
      </Section>

      {st && (
        <>
          <Section header="ค่าตั้งค่าบน Vercel" footer="ใส่ที่ Vercel > Project > Settings > Environment Variables แล้ว Redeploy">
            {Object.entries(st.env).map(([k, v]) => <Check key={k} ok={v} label={k} hint={ENV_HINT[k]} optional={OPTIONAL.includes(k)} />)}
          </Section>

          <Section header="ระบบแจ้งเตือน (สร้างเองอัตโนมัติ)" footer="กุญแจแจ้งเตือนและรหัสลับสร้างและเก็บใน Supabase เอง ไม่ต้องใส่ env · ที่อยู่เว็บจะบันทึกเมื่อเปิดการแจ้งเตือนบนเครื่องนี้">
            <Check ok={st.push?.config} label="ตาราง krob_config" hint={st.push?.config ? undefined : "รัน supabase/v0.7-config.sql"} />
            <Check ok={st.push?.vapid} label="กุญแจ VAPID" hint={st.push?.source === "env" ? "ใช้ค่าจาก env" : st.push?.vapid ? "สร้างโดย server" : undefined} />
            <Check ok={st.push?.cronSecret} label="รหัสลับตัวสั่งงาน" />
            <Check ok={!!st.push?.appUrl} label="ที่อยู่เว็บสำหรับตัวสั่งงาน" hint={st.push?.appUrl ?? "เปิดการแจ้งเตือนบน iPhone 1 ครั้ง"} />
          </Section>

          <Section header="ฐานข้อมูล Supabase" footer="ถ้ายังไม่มี ให้รัน supabase/v0.7-config.sql ใน SQL Editor">
            {st.tables ? Object.entries(st.tables).map(([k, v]) => <Check key={k} ok={v} label={k} />) : <Check ok={false} label="ต้องมี URL + service_role ก่อนจึงตรวจได้" />}
          </Section>

          <Section header="ตัวสั่งงานทุกนาที (pg_cron)">
            <Check ok={tickAge !== null && tickAge < 5} label="ทำงานล่าสุด" hint={st.lastTick ? `${tickAge} นาทีที่แล้ว` : "ยังไม่เคยทำงาน - รัน v0.7-config.sql แล้วเปิดการแจ้งเตือนบน iPhone"} />
            <Check ok={(st.devices ?? 0) > 0} label="อุปกรณ์ที่รับแจ้งเตือน" hint={st.devices === null ? undefined : `${st.devices} เครื่อง`} />
          </Section>
        </>
      )}

      <Section>
        <button className="row" onClick={() => { play("tap"); load(); }}><span className="row-main row-title link">ตรวจอีกครั้ง</span></button>
        {auth.token && device === "on" && (
          <button className="row" onClick={async () => { play("tap"); toast(await sendTest(auth.token)); }}><span className="row-main row-title link">ส่งแจ้งเตือนทดสอบไป iPhone</span></button>
        )}
      </Section>
    </main>
  );
}
