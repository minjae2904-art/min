// Pure model of the notification setup checker (Settings > การแจ้งเตือน). Facts come from push.ts collectFacts();
// each step gets a state and, when it fails, the Thai fix for that exact cause.

export type StepId = "standalone" | "support" | "server" | "login" | "permission" | "sw" | "key" | "sub" | "saved" | "route" | "cron" | "test";
export type StepState = "ok" | "fail" | "warn" | "wait" | "skip";
export type Facts = {
  ios: boolean; standalone: boolean; support: boolean; mode: "loading" | "local" | "server"; reason: "unconfigured" | "unreachable" | null;
  token: boolean; permission: "default" | "granted" | "denied" | "unsupported"; sw: "active" | "installing" | "none" | "timeout" | "unknown";
  key: "ok" | "missing" | "error" | "unknown"; sub: "ok" | "unverified" | "none" | "mismatch" | "unknown"; saved: "yes" | "no" | "unauthorized" | "error" | "unknown";
  devices: number | null; appUrl: string | null | undefined; origin: string; host: string; cronAgeMin: number | null | undefined;
  test: "idle" | "sending" | "received" | "sent" | "none" | "error"; testMsg?: string;
};
export type Step = { id: StepId; state: StepState; label: string; detail: string; fix?: string };

export const STANDALONE_FIX = "iPhone ส่งแจ้งเตือนได้เฉพาะแอปบนหน้าจอโฮม: เปิดเว็บนี้ใน Safari > ปุ่มแชร์ > เพิ่มไปยังหน้าจอโฮม แล้วเปิดจากไอคอน Krob";
export const CRON_OK_MIN = 10;

const ORDER: StepId[] = ["standalone", "support", "server", "login", "permission", "sw", "key", "sub", "saved", "route", "cron", "test"];
const LABEL: Record<StepId, string> = {
  standalone: "เปิดจากไอคอนบนหน้าจอโฮม", support: "เครื่องรองรับการแจ้งเตือน", server: "ต่อกับ server ของ Krob", login: "เข้าด้วย PIN แล้ว",
  permission: "iPhone อนุญาตการแจ้งเตือน", sw: "ตัวช่วยเบื้องหลังทำงาน", key: "server พร้อมส่ง", sub: "ลงทะเบียนกับ Apple แล้ว",
  saved: "server รู้จักเครื่องนี้", route: "ส่งผ่านเว็บนี้", cron: "ตัวสั่งงานทุกนาทีทำงานอยู่", test: "ทดสอบส่งถึงเครื่องนี้",
};
const DEPS: Record<StepId, StepId[]> = {
  standalone: [], support: ["standalone"], server: [], login: ["server"], permission: ["support"], sw: ["support"], key: ["server"],
  sub: ["permission", "sw", "key"], saved: ["sub", "login"], route: ["login"], cron: ["login"], test: ["saved"],
};
const PIN_EXPIRED = "PIN หมดอายุ: ตั้งค่า > ออกจากระบบบนเครื่องนี้ แล้วเข้าใหม่";
const CRON_TAIL = " แจ้งเตือนจะไม่ถูกส่งแม้เครื่องพร้อม: ถ้าข้อ 'ส่งผ่านเว็บนี้' ไม่ผ่านให้แก้ข้อนั้นก่อน ไม่อย่างนั้นตรวจ pg_cron ใน Supabase ที่ ตั้งค่า > สถานะระบบ";

type Raw = { state: StepState; detail?: string; fix?: string };
const ok = (detail: string): Raw => ({ state: "ok", detail });
const wait = (detail = "กำลังตรวจ..."): Raw => ({ state: "wait", detail });
const fail = (fix: string): Raw => ({ state: "fail", fix });
const warn = (fix: string): Raw => ({ state: "warn", fix });

function raw(id: StepId, f: Facts): Raw {
  switch (id) {
    case "standalone": return !f.ios ? ok("ไม่จำเป็นบนอุปกรณ์นี้") : f.standalone ? ok("เปิดแบบแอปอยู่") : fail(STANDALONE_FIX);
    case "support": return f.support ? ok("รองรับ") : fail(f.ios ? "ต้องใช้ iOS 16.4 ขึ้นไป อัปเดต iPhone แล้วลองใหม่" : "เบราว์เซอร์นี้ไม่รองรับ Web Push");
    case "server":
      if (f.mode === "loading") return wait();
      if (f.mode === "server") return ok(`เว็บ ${f.host}`);
      return f.reason === "unreachable"
        ? fail("ติดต่อ server ไม่ได้ตอนเปิดแอป จึงใช้ข้อมูลในเครื่องไปก่อน: ตรวจอินเทอร์เน็ต แล้วปิดแอปและเปิดใหม่")
        : fail(`เว็บนี้ (${f.host}) ยังไม่ได้ตั้งค่า server ข้อมูลจึงอยู่แค่ในเครื่องนี้ ไม่ซิงค์ และส่งแจ้งเตือนไม่ได้: 1) ตั้งค่า > สำรองข้อมูล (JSON) ก่อน 2) เปิดเว็บ Krob ตัวหลักที่ตั้ง Supabase ไว้ใน Safari แล้วเพิ่มไปยังหน้าจอโฮม 3) นำเข้าข้อมูลสำรองในแอปใหม่ ห้ามลบไอคอนนี้ก่อนสำรอง เพราะการลบไอคอนจะลบข้อมูลในเครื่องนี้ด้วย`);
    case "login": return f.token ? ok("เข้าสู่ระบบอยู่") : fail("ยังไม่ได้เข้าด้วย PIN บนเครื่องนี้: ปิดแอปแล้วเปิดใหม่ แล้วใส่ PIN");
    case "permission":
      if (f.permission === "granted") return ok("อนุญาตแล้ว");
      if (f.permission === "default") return warn("ยังไม่เคยถาม: แตะ 'เปิดการแจ้งเตือน' แล้วเลือก 'อนุญาต'");
      if (f.permission === "denied") return fail("ถูกปิดไว้: การตั้งค่า iPhone > การแจ้งเตือน > Krob > เปิด 'อนุญาตการแจ้งเตือน' แล้วกลับมาแตะ 'ตรวจอีกครั้ง' (ถ้าไม่มี Krob ในรายการ ให้ลบไอคอนแล้วเพิ่มใหม่ ข้อมูลอยู่บน server ไม่หาย แต่ต้องใส่ PIN ใหม่)");
      return fail("ไม่รองรับ");
    case "sw":
      if (f.sw === "active") return ok("ทำงานอยู่");
      if (f.sw === "installing" || f.sw === "unknown") return wait("กำลังติดตั้ง...");
      return fail("Service worker ยังไม่ทำงาน: ปิดแอปจากตัวสลับแอปแล้วเปิดใหม่");
    case "key":
      if (f.key === "ok") return ok("คีย์พร้อม");
      if (f.key === "unknown") return wait();
      return f.key === "missing" ? fail("server ยังไม่พร้อมส่ง: ดู ตั้งค่า > สถานะระบบ (รัน supabase/v0.7-config.sql)") : fail("ติดต่อ server ไม่ได้ ตรวจอินเทอร์เน็ตแล้วแตะ 'ตรวจอีกครั้ง'");
    case "sub":
      if (f.sub === "ok") return ok("ลงทะเบียนแล้ว");
      if (f.sub === "unverified") return ok("ลงทะเบียนแล้ว (อ่านคีย์ไม่ได้ จึงไม่แตะของเดิม)");
      if (f.sub === "unknown") return wait();
      return f.sub === "none" ? warn("ยังไม่ได้ลงทะเบียน: แตะ 'เปิดการแจ้งเตือน'") : fail("ลงทะเบียนไว้กับคีย์เก่า: แตะ 'ลงทะเบียนใหม่'");
    case "saved":
      if (f.saved === "yes") return ok(`บันทึกแล้ว · ทั้งหมด ${f.devices ?? 0} เครื่อง`);
      if (f.saved === "unknown") return wait();
      return f.saved === "no" ? fail("server ยังไม่มีเครื่องนี้: แตะ 'ลงทะเบียนใหม่'") : fail("ตรวจไม่ได้ (server ตอบผิดพลาด)");
    case "route":
      if (f.appUrl === undefined) return wait();
      if (f.appUrl === null) return fail("ยังไม่รู้ว่าจะส่งแจ้งเตือนผ่านเว็บไหน: แตะ 'ใช้เว็บนี้ส่งแจ้งเตือน'");
      return f.appUrl === f.origin ? ok("ตัวสั่งงานเรียกเว็บนี้")
        : fail(`แจ้งเตือนถูกส่งผ่านเว็บอื่น (${f.appUrl}) ไม่ใช่เว็บนี้ (${f.origin}) ถ้าเว็บนั้นปิดอยู่หรือต้องล็อกอิน แจ้งเตือนจะไม่มา: แตะ 'ใช้เว็บนี้ส่งแจ้งเตือน'`);
    case "cron":
      if (f.cronAgeMin === undefined) return wait();
      if (f.cronAgeMin !== null && f.cronAgeMin <= CRON_OK_MIN) return ok(`ล่าสุด ${f.cronAgeMin} นาทีที่แล้ว`);
      return fail((f.cronAgeMin === null ? "ตัวสั่งงานยังไม่เคยทำงาน (หรือหยุดไปนาน)" : `ตัวสั่งงานหยุดมา ${f.cronAgeMin} นาที`) + CRON_TAIL);
    case "test":
      switch (f.test) {
        case "received": return ok("เครื่องนี้ได้รับแล้ว");
        case "sending": return wait("กำลังส่ง...");
        case "idle": return warn("แตะ 'ส่งทดสอบ'");
        case "sent": return warn("server ส่งแล้วแต่เครื่องนี้ยังไม่ได้รับใน 20 วินาที: ปิดโหมดโฟกัส/ห้ามรบกวน เปิด การตั้งค่า > การแจ้งเตือน > Krob > แบนเนอร์ หรือแตะ 'ลงทะเบียนใหม่'");
        case "none": return fail("ยังไม่มีเครื่องที่ลงทะเบียน");
        default: return fail(f.testMsg || "ส่งทดสอบไม่สำเร็จ");
      }
  }
}

export function pushSteps(f: Facts): Step[] {
  const out = new Map<StepId, Step & { root?: string }>();
  for (const id of ORDER) {
    let r = raw(id, f);
    if (id === "login" && f.saved === "unauthorized") r = fail(PIN_EXPIRED); // override before propagation
    out.set(id, { id, state: r.state, label: LABEL[id], detail: r.detail ?? r.fix ?? "", ...(r.fix ? { fix: r.fix } : {}) });
  }
  // Dependency pass in step order: a blocked dependency hides this step behind the first root cause.
  for (const id of ORDER) {
    const deps = DEPS[id].map((d) => out.get(d)!);
    const blocked = deps.find((d) => d.state === "fail" || d.state === "warn" || d.state === "skip");
    if (blocked) {
      const root = blocked.root ?? blocked.label;
      out.set(id, { id, state: "skip", label: LABEL[id], detail: `รอแก้ข้อ '${root}' ก่อน`, root });
    } else if (deps.some((d) => d.state === "wait")) out.set(id, { id, state: "wait", label: LABEL[id], detail: "รอข้อก่อนหน้า" });
  }
  return ORDER.map((id) => { const { root: _root, ...s } = out.get(id)!; void _root; return s; });
}

export const firstFailing = (steps: Step[]) => steps.find((s) => s.state === "fail" || s.state === "warn");
