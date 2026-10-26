"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { IconArrowRight, IconBack, IconBell, IconBook, IconCalendar, IconDatabase, IconDrop, IconList, IconLock, IconPalette, IconPerson, IconPulse, IconSpark, IconTarget } from "@/components/Icons";
import { LangPicker } from "@/components/LangPicker";
import { fmt, msgs, withLang } from "@/i18n";
import { rich, useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/app-settings";
import * as Common from "@/i18n/msg/common";
import { ProfileForm } from "@/components/ProfileForm";
import { Chev, ConfirmSheet, Section, Sheet, Tile, toast } from "@/components/ui";
import { brainHeadline } from "@/lib/brain/report";
import { LEVEL_LABEL } from "@/lib/care/presets";
import { logicalDate } from "@/lib/date";
import { age, targets } from "@/lib/health";
import { isStateLike, normalize, type State } from "@/lib/model";
import { play } from "@/lib/sound";
import { SYNC_LABEL, useStore } from "@/lib/store";

const m = msgs(C), c = msgs(Common);

function NavRow({ href, color, icon, title, value }: { href: string; color: string; icon: React.ReactNode; title: string; value?: string }) {
  return (
    <Link href={href} className="row row-link has-tile" onClick={() => play("nav")}>
      <Tile color={color}>{icon}</Tile>
      <span className="row-main row-title">{title}</span>
      {value && <span className="row-value fs-sub">{value}</span>}
      <Chev />
    </Link>
  );
}

export default function Settings() {
  const { s, update, sync, auth } = useStore();
  const lang = useLang();
  const [editProfile, setEditProfile] = useState(false);
  const [pendingImport, setPendingImport] = useState<State | null>(null);
  const [wiping, setWiping] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [now] = useState(() => Date.now());
  const p = s.profile;
  const set = s.settings;
  const custom = s.schedule.custom.length;
  const off = Object.values(s.schedule.overrides).filter((o) => o.enabled === false).length;
  const planned = set.weekPlan.filter((p) => p !== null).length;
  const careLevel = s.care.level;
  const careOn = (s.schedule.care ?? []).filter((r) => r.on).length;
  const today = logicalDate();
  const head = useMemo(() => (set.brainAi ? withLang(lang, () => brainHeadline(s, today)) : null), [s, today, set.brainAi, lang]);

  const fileRef = useRef<HTMLInputElement>(null);

  // iOS: the share sheet (Files, AirDrop, Line) is the only way a PWA can hand over a file; browsers fall back to a download.
  async function exportData() {
    play("done");
    const name = `krob-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const json = JSON.stringify(s, null, 2);
    const file = new File([json], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Krob backup" }).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = name;
    a.click();
  }

  // Restores a backup file: validated through normalize(), then saved via update() so updatedAt bumps and the normal push carries it.
  async function importData(f: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    let raw: unknown;
    try { raw = JSON.parse(await f.text()); } catch { return toast(m("settings.toast.badFile")); }
    if (!isStateLike(raw) || !raw.days || typeof raw.days !== "object") return toast(m("settings.toast.badFile"));
    const next = normalize(raw);
    // Every day must be a DayLog-shaped object, or stats/schedule crash on d.done[...] after it is pushed.
    const badDay = (d: unknown) => !d || typeof d !== "object" || Array.isArray(d) || !("done" in d) || !d.done || typeof d.done !== "object" || Array.isArray(d.done);
    if (Object.values(next.days).some(badDay)) return toast(m("settings.toast.badFile"));
    setPendingImport(next);
  }
  const importSummary = (next: State) => m("settings.import.summary", { days: Object.keys(next.days).length, weights: next.weights.length, gym: next.workouts.length });

  return (
    <main className="screen">
      {/* Settings is not a tab any more: its main entry is the Today avatar, so the way back is Today. */}
      <div className="navbar">
        <Link href="/" className="navback" onClick={() => play("nav")}>
          <IconBack size={22} weight={2.4} />
          {c("today")}
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 22px" }}>
        <Image src="/logo-256.png" alt="" width={60} height={60} className="app-logo" unoptimized />
        <div>
          <h1 className="large-title" style={{ margin: 0 }}>{c("settings")}</h1>
          <div className="subtitle" style={{ margin: 0 }}>{m("settings.subtitle")}</div>
        </div>
      </div>

      <LangPicker />

      <Section>
        <button className="row has-tile" onClick={() => setEditProfile(true)}>
          <Tile color="var(--info)"><IconPerson size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{m("settings.profile.title", { name: p.name || m("settings.profile.default"), sex: p.sex === "m" ? m("settings.profile.male") : m("settings.profile.female"), age: age(p.birth), cm: p.heightCm })}</div>
            <div className="row-sub">{rich(m("settings.profile.sub", { start: p.startKg, goal: p.goalKg, kcal: fmt.num(targets(p, p.startKg, set.kcalAdjust).kcal), protein: targets(p, p.startKg).protein }), { arrow: <span className="ic-arrow" role="img" aria-label={m("settings.profile.arrow")}><IconArrowRight size={14} /></span> })}</div>
          </span>
          <Chev />
        </button>
      </Section>

      <Section>
        <NavRow href="/settings/week" color="var(--info)" icon={<IconCalendar size={18} />} title={m("settings.week.title")} value={planned ? m("settings.week.value", { n: planned }) : undefined} />
        <NavRow href="/settings/term" color="var(--info)" icon={<IconBook size={18} />} title={m("settings.term.title")} value={s.schedule.term ? m("settings.term.value", { n: s.schedule.term.cls.length }) : m("settings.notSet")} />
        <NavRow href="/settings/schedule" color="var(--orange)" icon={<IconList size={18} />} title={m("settings.schedule.title")} value={[s.schedule.shiftMin ? m("settings.schedule.shift", { sign: s.schedule.shiftMin > 0 ? "+" : "", n: s.schedule.shiftMin }) : "", custom ? m("settings.schedule.custom", { n: custom }) : "", off ? m("settings.schedule.off", { n: off }) : ""].filter(Boolean).join(" · ") || undefined} />
        <NavRow href="/settings/care" color="var(--area-recovery)" icon={<IconDrop size={18} />} title={m("settings.care.title")} value={careLevel ? m("settings.care.value", { level: LEVEL_LABEL[careLevel], n: careOn }) : m("settings.notSet")} />
        <NavRow href="/settings/notifications" color="var(--red)" icon={<IconBell size={18} />} title={m("settings.notif.title")} value={set.dndUntil > now ? m("settings.notif.paused") : undefined} />
        <NavRow href="/settings/goals" color="var(--green)" icon={<IconTarget size={18} />} title={m("settings.goals.title")} value={m("settings.goals.value", { pct: Math.round(set.goodDay * 100) })} />
        <NavRow href="/settings/brain" color="var(--pink)" icon={<IconSpark size={18} />} title={m("settings.brain.title")} value={!set.brainAi ? m("settings.brain.aiOff") : head ? m("settings.brain.balance", { balance: head.balance }) : undefined} />
        <NavRow href="/settings/appearance" color="var(--purple)" icon={<IconPalette size={18} />} title={m("settings.appearance.title")} />
        <NavRow href="/settings/privacy" color="var(--gray)" icon={<IconLock size={18} />} title={m("settings.privacy.title")} value={auth.mode === "server" ? (auth.pinOff ? m("settings.privacy.noPin") : set.pinOnOpen ? m("settings.privacy.pinEvery") : m("settings.privacy.pinFirst")) : set.pinHash ? m("settings.privacy.locked") : m("settings.privacy.unlocked")} />
      </Section>

      {auth.mode === "server" && (
        <Section header={m("settings.account.header")} footer={m("settings.account.footer")}>
          <div className="row"><span className="row-main row-title">{m("settings.account.pin")}</span><span className="row-value">{auth.token ? m("settings.account.signedIn") : "-"}</span></div>
          <div className="row">
            <span className="row-main row-title">{m("settings.account.sync")}</span>
            <span className={`row-value ${sync === "error" ? "ink-danger" : ""}`}>{SYNC_LABEL[sync]}</span>
          </div>
          <button className="row" onClick={() => { play("tap"); setLeaving(true); }}><span className="row-main row-title ink-danger">{m("settings.account.signOut")}</span></button>
        </Section>
      )}

      <Section header={m("settings.system.header")}>
        <NavRow href="/settings/system" color="var(--teal)" icon={<IconPulse size={18} />} title={m("settings.system.status")} />
        <button className="row has-tile" onClick={exportData}>
          <Tile color="var(--info)"><IconDatabase size={18} /></Tile>
          <span className="row-main row-title link">{m("settings.system.backup")}</span>
        </button>
        <button className="row has-tile" onClick={() => { play("tap"); fileRef.current?.click(); }}>
          <Tile color="var(--green)"><IconDatabase size={18} /></Tile>
          <span className="row-main row-title link">{m("settings.system.import")}</span>
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importData(e.target.files?.[0])} />
      </Section>

      <Section footer={auth.token ? m("settings.data.footerSync") : m("settings.data.footerLocal")}>
        <button className="row" onClick={() => { play("tap"); setWiping(true); }}>
          <span className="row-main row-title ink-danger">{auth.token ? m("settings.data.clearCacheRow") : m("settings.data.wipe")}</span>
        </button>
      </Section>

      <ConfirmSheet
        open={pendingImport !== null}
        title={m("settings.system.import")}
        body={pendingImport ? importSummary(pendingImport) : undefined}
        confirmLabel={m("settings.import.confirm")}
        danger
        onClose={() => setPendingImport(null)}
        onConfirm={() => { if (!pendingImport) return; const next = pendingImport; play("done"); update((x) => Object.assign(x, next), { force: true }); toast(m("settings.import.done")); }}
      />
      <ConfirmSheet
        open={leaving}
        title={m("settings.account.signOut")}
        body={m("settings.signOut.body")}
        confirmLabel={m("settings.signOut.confirm")}
        danger
        onClose={() => setLeaving(false)}
        onConfirm={() => { void auth.logout().then((ok) => { if (!ok) { play("error"); toast(m("settings.signOut.unsynced")); } }); }}
      />
      <ConfirmSheet
        open={wiping}
        title={auth.token ? m("settings.data.clearCache") : m("settings.data.wipe")}
        body={auth.token ? m("settings.data.clearCacheBody") : m("settings.data.wipeBody")}
        confirmLabel={c("delete")}
        danger
        onClose={() => setWiping(false)}
        onConfirm={() => { localStorage.removeItem("krob-v1"); location.reload(); }}
      />

      <Sheet open={editProfile} title={m("settings.profile.edit")} onClose={() => setEditProfile(false)}>
        <div style={{ maxHeight: "70dvh", overflowY: "auto" }}>
          <ProfileForm initial={p} submitLabel={c("save")} onSave={(np) => { play("done"); update((st) => { st.profile = np; }); setEditProfile(false); }} />
        </div>
      </Sheet>
    </main>
  );
}
