"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { IconArrowRight, IconBack, IconBell, IconBook, IconCalendar, IconDatabase, IconDrop, IconList, IconLock, IconPalette, IconPerson, IconPulse, IconSpark, IconTarget } from "@/components/Icons";
import { ProfileForm } from "@/components/ProfileForm";
import { Chev, ConfirmSheet, Section, Sheet, Tile, toast } from "@/components/ui";
import { brainHeadline } from "@/lib/brain/report";
import { LEVEL_LABEL } from "@/lib/care/presets";
import { logicalDate } from "@/lib/date";
import { age, targets } from "@/lib/health";
import { isStateLike, normalize, type State } from "@/lib/model";
import { play } from "@/lib/sound";
import { SYNC_LABEL, useStore } from "@/lib/store";

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
  const head = useMemo(() => (set.brainAi ? brainHeadline(s, today) : null), [s, today, set.brainAi]);

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
    try { raw = JSON.parse(await f.text()); } catch { return toast("ไฟล์ไม่ถูกต้อง"); }
    if (!isStateLike(raw) || !raw.days || typeof raw.days !== "object") return toast("ไฟล์ไม่ถูกต้อง");
    const next = normalize(raw);
    // Every day must be a DayLog-shaped object, or stats/schedule crash on d.done[...] after it is pushed.
    const badDay = (d: unknown) => !d || typeof d !== "object" || Array.isArray(d) || !("done" in d) || !d.done || typeof d.done !== "object" || Array.isArray(d.done);
    if (Object.values(next.days).some(badDay)) return toast("ไฟล์ไม่ถูกต้อง");
    setPendingImport(next);
  }
  const importSummary = (next: State) => `นำเข้า ${Object.keys(next.days).length} วัน, น้ำหนัก ${next.weights.length} ครั้ง, ยิม ${next.workouts.length} ครั้ง\nข้อมูลปัจจุบันในแอปจะถูกแทนที่ทั้งหมด`;

  return (
    <main className="screen">
      {/* Settings is not a tab any more: its main entry is the Today avatar, so the way back is Today. */}
      <div className="navbar">
        <Link href="/" className="navback" onClick={() => play("nav")}>
          <IconBack size={22} weight={2.4} />
          วันนี้
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 22px" }}>
        <Image src="/logo-256.png" alt="" width={60} height={60} className="app-logo" unoptimized />
        <div>
          <h1 className="large-title" style={{ margin: 0 }}>ตั้งค่า</h1>
          <div className="subtitle" style={{ margin: 0 }}>Krob v1.8 · ครบทุกวัน ไม่ว่ากะไหน</div>
        </div>
      </div>

      <Section>
        <button className="row has-tile" onClick={() => setEditProfile(true)}>
          <Tile color="var(--info)"><IconPerson size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{p.name || "โปรไฟล์"} · {p.sex === "m" ? "ชาย" : "หญิง"} · {age(p.birth)} ปี · {p.heightCm} cm</div>
            <div className="row-sub">{p.startKg} <span className="ic-arrow" role="img" aria-label="ถึง"><IconArrowRight size={14} /></span> {p.goalKg} kg · กินราว {targets(p, p.startKg, set.kcalAdjust).kcal.toLocaleString()} kcal · โปรตีน ~{targets(p, p.startKg).protein} g</div>
          </span>
          <Chev />
        </button>
      </Section>

      <Section>
        <NavRow href="/settings/week" color="var(--info)" icon={<IconCalendar size={18} />} title="แผนประจำสัปดาห์" value={planned ? `${planned}/7 วัน` : undefined} />
        <NavRow href="/settings/term" color="var(--info)" icon={<IconBook size={18} />} title="ตารางเรียน" value={s.schedule.term ? `${s.schedule.term.cls.length} วิชา` : "ยังไม่ได้ตั้ง"} />
        <NavRow href="/settings/schedule" color="var(--orange)" icon={<IconList size={18} />} title="แผนประจำวัน" value={[s.schedule.shiftMin ? `เลื่อน ${s.schedule.shiftMin > 0 ? "+" : ""}${s.schedule.shiftMin} น.` : "", custom ? `+${custom} รายการ` : "", off ? `ปิด ${off}` : ""].filter(Boolean).join(" · ") || undefined} />
        <NavRow href="/settings/care" color="var(--area-recovery)" icon={<IconDrop size={18} />} title="ดูแลตัวเอง" value={careLevel ? `${LEVEL_LABEL[careLevel]} · ${careOn} กิจวัตร` : "ยังไม่ได้ตั้ง"} />
        <NavRow href="/settings/notifications" color="var(--red)" icon={<IconBell size={18} />} title="การแจ้งเตือน" value={set.dndUntil > now ? "พักอยู่" : undefined} />
        <NavRow href="/settings/goals" color="var(--green)" icon={<IconTarget size={18} />} title="เป้าหมาย" value={`วันที่ดี ${Math.round(set.goodDay * 100)}%`} />
        <NavRow href="/settings/brain" color="var(--pink)" icon={<IconSpark size={18} />} title="สมอง Krob" value={!set.brainAi ? "AI ปิด" : head ? `สมดุล ${head.balance}` : undefined} />
        <NavRow href="/settings/appearance" color="var(--purple)" icon={<IconPalette size={18} />} title="รูปลักษณ์ เสียง การสั่น" />
        <NavRow href="/settings/privacy" color="var(--gray)" icon={<IconLock size={18} />} title="ความเป็นส่วนตัว" value={auth.mode === "server" ? (auth.pinOff ? "ไม่ใช้ PIN" : set.pinOnOpen ? "ขอ PIN ทุกครั้ง" : "PIN ครั้งแรก") : set.pinHash ? "ล็อกอยู่" : "ไม่ล็อก"} />
      </Section>

      {auth.mode === "server" && (
        <Section header="บัญชี" footer="เข้าแอปด้วย PIN อย่างเดียว ไม่ต้องใช้อีเมล ข้อมูลซิงค์ทุกเครื่องที่ใส่ PIN เดียวกัน">
          <div className="row"><span className="row-main row-title">เข้าด้วย PIN</span><span className="row-value">{auth.token ? "เข้าอยู่" : "-"}</span></div>
          <div className="row">
            <span className="row-main row-title">สถานะซิงค์</span>
            <span className={`row-value ${sync === "error" ? "ink-danger" : ""}`}>{SYNC_LABEL[sync]}</span>
          </div>
          <button className="row" onClick={() => { play("tap"); setLeaving(true); }}><span className="row-main row-title ink-danger">ออกจากระบบบนเครื่องนี้</span></button>
        </Section>
      )}

      <Section header="ระบบ">
        <NavRow href="/settings/system" color="var(--teal)" icon={<IconPulse size={18} />} title="สถานะระบบ / ทดสอบแจ้งเตือน" />
        <button className="row has-tile" onClick={exportData}>
          <Tile color="var(--info)"><IconDatabase size={18} /></Tile>
          <span className="row-main row-title link">สำรองข้อมูล (JSON)</span>
        </button>
        <button className="row has-tile" onClick={() => { play("tap"); fileRef.current?.click(); }}>
          <Tile color="var(--green)"><IconDatabase size={18} /></Tile>
          <span className="row-main row-title link">นำเข้าข้อมูลสำรอง</span>
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importData(e.target.files?.[0])} />
      </Section>

      <Section footer={auth.token ? "ข้อมูลซิงค์กับ Supabase อัตโนมัติ และเก็บสำรองในเครื่องสำหรับใช้ออฟไลน์" : "ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น"}>
        <button className="row" onClick={() => { play("tap"); setWiping(true); }}>
          <span className="row-main row-title ink-danger">{auth.token ? "ลบแคชในเครื่องนี้ (ข้อมูลบน server ยังอยู่)" : "ลบข้อมูลในเครื่องนี้"}</span>
        </button>
      </Section>

      <ConfirmSheet
        open={pendingImport !== null}
        title="นำเข้าข้อมูลสำรอง"
        body={pendingImport ? importSummary(pendingImport) : undefined}
        confirmLabel="นำเข้าและแทนที่"
        danger
        onClose={() => setPendingImport(null)}
        onConfirm={() => { if (!pendingImport) return; const next = pendingImport; play("done"); update((x) => Object.assign(x, next), { force: true }); toast("นำเข้าข้อมูลแล้ว"); }}
      />
      <ConfirmSheet
        open={leaving}
        title="ออกจากระบบบนเครื่องนี้"
        body={"ข้อมูลในเครื่องนี้จะถูกลบ ข้อมูลบน server ยังอยู่ครบ\nเข้าด้วย PIN อีกครั้งเพื่อดึงข้อมูลกลับมา"}
        confirmLabel="ออกจากระบบ"
        danger
        onClose={() => setLeaving(false)}
        onConfirm={() => { void auth.logout().then((ok) => { if (!ok) { play("error"); toast("ยังมีข้อมูลที่ยังไม่ซิงค์ เชื่อมต่อเน็ตแล้วลองใหม่"); } }); }}
      />
      <ConfirmSheet
        open={wiping}
        title={auth.token ? "ลบแคชในเครื่องนี้" : "ลบข้อมูลในเครื่องนี้"}
        body={auth.token ? "ข้อมูลบน server ยังอยู่ แอปจะโหลดใหม่และดึงข้อมูลกลับมา" : "ข้อมูลทั้งหมดในเครื่องนี้จะหายและกู้คืนไม่ได้"}
        confirmLabel="ลบ"
        danger
        onClose={() => setWiping(false)}
        onConfirm={() => { localStorage.removeItem("krob-v1"); location.reload(); }}
      />

      <Sheet open={editProfile} title="แก้ไขโปรไฟล์" onClose={() => setEditProfile(false)}>
        <div style={{ maxHeight: "70dvh", overflowY: "auto" }}>
          <ProfileForm initial={p} submitLabel="บันทึก" onSave={(np) => { play("done"); update((st) => { st.profile = np; }); setEditProfile(false); }} />
        </div>
      </Sheet>
    </main>
  );
}
