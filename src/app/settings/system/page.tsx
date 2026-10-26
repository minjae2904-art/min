"use client";

import { useEffect, useState } from "react";
import { NavBar, Section, toast } from "@/components/ui";
import { langHeader, langObj, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as S from "@/i18n/msg/app-settings-system";
import * as Common from "@/i18n/msg/common";
import { pushState, sendTest, type PushState } from "@/lib/push";
import { play } from "@/lib/sound";
import { SYNC_LABEL, useStore } from "@/lib/store";

type Status = {
  env: Record<string, boolean>;
  push?: { config: boolean; vapid: boolean; source: string | null; appUrl: string | null; cronSecret: boolean };
  tables: Record<string, boolean> | null;
  lastTick: string | null;
  devices: number | null;
  aiCache?: boolean;
};

const m = msgs(S), c = msgs(Common);
const ENV_HINT: Record<string, string> = langObj(() => ({
  NEXT_PUBLIC_SUPABASE_URL: "Supabase URL",
  SUPABASE_SERVICE_ROLE_KEY: m("system.env.serviceRole"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: m("system.env.vapidAuto"),
  VAPID_PRIVATE_KEY: m("system.env.vapidAuto"),
  VAPID_SUBJECT: c("optional"),
  CRON_SECRET: m("system.env.cron"),
  GEMINI_API_KEY: m("system.env.gemini"),
  ANTHROPIC_API_KEY: m("system.env.anthropic"),
  TELEGRAM: m("system.env.telegram"),
}));

function Check({ ok, label, hint, optional }: { ok: boolean | null | undefined; label: string; hint?: string; optional?: boolean }) {
  return (
    <div className="row">
      <span className="row-main">
        <div className="row-title fs-sub">{label}</div>
        {hint && <div className="row-sub">{hint}</div>}
      </span>
      <span className={`fs-sub ${ok ? "pill-on" : optional ? "row-value" : "pill-off"}`}>{ok ? m("system.check.ready") : ok === null || ok === undefined ? "-" : optional ? m("system.check.unset") : m("system.check.missing")}</span>
    </div>
  );
}

export default function SystemStatus() {
  const { sync, auth } = useStore();
  useLang(); // re-render on a language switch
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [device, setDevice] = useState<PushState | null>(null);
  const [now, setNow] = useState(0);

  async function load() {
    setErr("");
    setNow(Date.now());
    setDevice(await pushState());
    const r = await fetch("/api/push/status", { method: "POST", headers: { authorization: `Bearer ${auth.token}`, ...langHeader() } }).catch(() => null);
    if (!r) return setErr(m("system.err.connect"));
    if (r.status === 404) return setErr(m("system.err.old"));
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return setErr(m("system.err.status", { status: r.status }));
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
      <NavBar title={m("system.title")} sub={ready ? m("system.sub.ready") : m("system.sub.check")} />

      {err && <Section><div className="row"><span className="row-main row-title ink-danger fs-sub">{err}</span></div></Section>}

      <Section header={m("system.device.header")}>
        <Check ok={!!auth.token} label={m("system.device.pin")} hint={auth.mode === "local" ? m("system.device.pinHint") : undefined} />
        <Check ok={sync === "synced"} label={m("system.device.sync")} hint={SYNC_LABEL[sync]} />
        <Check ok={device === "on"} label={m("system.device.notify")} hint={device === "needs-install" ? m("system.device.install") : device === "off" ? m("system.device.off") : undefined} />
      </Section>

      {!st && !err && <Section header={m("system.env.header")}><div className="skel-rows" aria-hidden><span className="skel" style={{ width: "70%" }} /><span className="skel" style={{ width: "55%" }} /><span className="skel" style={{ width: "62%" }} /></div></Section>}

      {st && (
        <div className="swap">
          <Section header={m("system.env.header")} footer={m("system.env.footer")}>
            {Object.entries(st.env).map(([k, v]) => <Check key={k} ok={v} label={k} hint={ENV_HINT[k]} optional={OPTIONAL.includes(k)} />)}
          </Section>

          <Section header={m("system.push.header")} footer={m("system.push.footer")}>
            <Check ok={st.push?.config} label={m("system.push.config")} hint={st.push?.config ? undefined : m("system.push.configHint")} />
            <Check ok={st.push?.vapid} label={m("system.push.vapid")} hint={st.push?.source === "env" ? m("system.push.vapidEnv") : st.push?.vapid ? m("system.push.vapidServer") : undefined} />
            <Check ok={st.push?.cronSecret} label={m("system.push.cronSecret")} />
            <Check ok={!!st.push?.appUrl} label={m("system.push.appUrl")} hint={st.push?.appUrl ?? m("system.push.appUrlHint")} />
          </Section>

          <Section header={m("system.db.header")} footer={m("system.db.footer")}>
            {st.tables ? Object.entries(st.tables).map(([k, v]) => <Check key={k} ok={v} label={k} />) : <Check ok={false} label={m("system.db.need")} />}
          </Section>

          <Section header={m("system.brain.header")} footer={m("system.brain.footer")}>
            {st.aiCache !== undefined && <Check ok={st.aiCache} optional label={m("system.brain.cache")} hint={st.aiCache ? undefined : m("system.brain.cacheHint")} />}
          </Section>

          <Section header={m("system.tick.header")}>
            <Check ok={tickAge !== null && tickAge < 5} label={m("system.tick.last")} hint={st.lastTick ? m("system.tick.ago", { n: String(tickAge) }) : m("system.tick.never")} />
            <Check ok={(st.devices ?? 0) > 0} label={m("system.tick.devices")} hint={st.devices === null ? undefined : m("system.tick.deviceCount", { n: st.devices })} />
          </Section>
        </div>
      )}

      <Section>
        <button className="row" onClick={() => { play("tap"); load(); }}><span className="row-main row-title link">{m("system.btn.recheck")}</span></button>
        {auth.token && device === "on" && (
          <button className="row" onClick={async () => { play("tap"); toast(await sendTest(auth.token)); }}><span className="row-main row-title link">{m("system.btn.test")}</span></button>
        )}
      </Section>
    </main>
  );
}
