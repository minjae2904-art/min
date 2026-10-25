import { describe, expect, it } from "vitest";
import { firstFailing, pushSteps, STANDALONE_FIX, type Facts, type StepId } from "../push-steps";

const ORIGIN = "https://krob.example.app";
const good: Facts = {
  ios: true, standalone: true, support: true, mode: "server", reason: null, token: true, permission: "granted", sw: "active",
  key: "ok", sub: "ok", saved: "yes", devices: 2, appUrl: ORIGIN, origin: ORIGIN, host: "krob.example.app", cronAgeMin: 1, test: "received",
};
const steps = (p: Partial<Facts>) => pushSteps({ ...good, ...p });
const step = (p: Partial<Facts>, id: StepId) => steps(p).find((s) => s.id === id)!;

describe("pushSteps", () => {
  it("all good: every step ok, nothing failing", () => {
    const s = steps({});
    expect(s.map((x) => x.state).every((x) => x === "ok")).toBe(true);
    expect(s.map((x) => x.id)).toEqual(["standalone", "support", "server", "login", "permission", "sw", "key", "sub", "saved", "route", "cron", "test"]);
    expect(firstFailing(s)).toBeUndefined();
    expect(step({}, "saved").detail).toContain("2 เครื่อง");
  });

  it("non-iOS standalone is ok", () => {
    const s = step({ ios: false, standalone: false }, "standalone");
    expect(s.state).toBe("ok");
    expect(s.detail).toBe("ไม่จำเป็นบนอุปกรณ์นี้");
  });

  it("iOS Safari tab fails standalone and skips everything that depends on it", () => {
    const s = steps({ standalone: false, support: false, permission: "unsupported", sw: "none", sub: "unknown" });
    const by = (id: StepId) => s.find((x) => x.id === id)!;
    expect(by("standalone").state).toBe("fail");
    expect(by("standalone").fix).toBe(STANDALONE_FIX);
    for (const id of ["support", "permission", "sw", "sub", "saved", "test"] as StepId[]) {
      expect(by(id).state).toBe("skip");
      expect(by(id).detail).toBe("รอแก้ข้อ 'เปิดจากไอคอนบนหน้าจอโฮม' ก่อน");
    }
    expect(by("server").state).toBe("ok"); // independent chain
    expect(firstFailing(s)?.id).toBe("standalone");
  });

  it("warn propagates: permission default skips sub, saved and test into one actionable row", () => {
    const s = steps({ permission: "default", sub: "none", saved: "unknown", test: "idle" });
    const by = (id: StepId) => s.find((x) => x.id === id)!;
    expect(by("permission").state).toBe("warn");
    expect(by("sub").state).toBe("skip");
    expect(by("saved").state).toBe("skip");
    expect(by("test").state).toBe("skip");
    expect(by("test").detail).toContain("iPhone อนุญาตการแจ้งเตือน");
    expect(s.filter((x) => x.state === "fail" || x.state === "warn").map((x) => x.id)).toEqual(["permission"]);
  });

  it("wait propagates as wait", () => {
    const s = steps({ sw: "installing", sub: "unknown", saved: "unknown" });
    const by = (id: StepId) => s.find((x) => x.id === id)!;
    expect(by("sw").state).toBe("wait");
    expect(by("sw").detail).toBe("กำลังติดตั้ง...");
    expect(by("sub").state).toBe("wait");
    expect(by("sub").detail).toBe("รอข้อก่อนหน้า");
    expect(by("test").state).toBe("wait");
  });

  it("fail beats wait among dependencies", () => {
    const s = step({ permission: "denied", sw: "installing" }, "sub");
    expect(s.state).toBe("skip");
  });

  it("saved=unauthorized overrides login before propagation", () => {
    const s = steps({ saved: "unauthorized" });
    const by = (id: StepId) => s.find((x) => x.id === id)!;
    expect(by("login").state).toBe("fail");
    expect(by("login").fix).toContain("PIN หมดอายุ");
    expect(by("saved").state).toBe("skip");
    expect(by("route").state).toBe("skip");
    expect(by("cron").state).toBe("skip");
    expect(firstFailing(s)?.id).toBe("login");
  });

  it("sub unverified is ok; none warns; mismatch fails", () => {
    expect(step({ sub: "unverified" }, "sub").state).toBe("ok");
    expect(step({ sub: "unverified" }, "sub").detail).toContain("อ่านคีย์ไม่ได้");
    expect(step({ sub: "none", saved: "unknown" }, "sub").state).toBe("warn");
    expect(step({ sub: "mismatch" }, "sub").fix).toBe("ลงทะเบียนไว้กับคีย์เก่า: แตะ 'ลงทะเบียนใหม่'");
  });

  it("server unconfigured vs unreachable texts; only unconfigured has the backup steps", () => {
    const un = step({ mode: "local", reason: "unconfigured", token: false }, "server");
    const ur = step({ mode: "local", reason: "unreachable", token: false }, "server");
    expect(un.state).toBe("fail");
    expect(ur.state).toBe("fail");
    expect(un.fix).toContain("สำรองข้อมูล");
    expect(un.fix).toContain("krob.example.app");
    expect(ur.fix).not.toContain("สำรองข้อมูล");
    expect(ur.fix).toContain("ติดต่อ server ไม่ได้ตอนเปิดแอป");
    expect(step({ mode: "loading" }, "server").state).toBe("wait");
    expect(step({ mode: "local", reason: "unconfigured", token: false }, "login").state).toBe("skip");
    expect(step({ mode: "local", reason: "unconfigured", token: false }, "key").state).toBe("skip");
  });

  it("fail texts per step", () => {
    expect(step({ support: false }, "support").fix).toContain("iOS 16.4");
    expect(step({ ios: false, support: false }, "support").fix).toBe("เบราว์เซอร์นี้ไม่รองรับ Web Push");
    expect(step({ token: false, saved: "unknown" }, "login").fix).toContain("ยังไม่ได้เข้าด้วย PIN");
    expect(step({ permission: "denied" }, "permission").fix).toContain("การตั้งค่า iPhone > การแจ้งเตือน > Krob");
    expect(step({ permission: "unsupported" }, "permission").fix).toBe("ไม่รองรับ");
    expect(step({ sw: "none" }, "sw").fix).toContain("Service worker ยังไม่ทำงาน");
    expect(step({ sw: "timeout" }, "sw").state).toBe("fail");
    expect(step({ key: "missing" }, "key").fix).toContain("v0.7-config.sql");
    expect(step({ key: "error" }, "key").fix).toContain("ตรวจอีกครั้ง");
    expect(step({ saved: "no" }, "saved").fix).toContain("server ยังไม่มีเครื่องนี้");
    expect(step({ saved: "error" }, "saved").fix).toBe("ตรวจไม่ได้ (server ตอบผิดพลาด)");
    expect(step({ test: "idle" }, "test").state).toBe("warn");
    expect(step({ test: "sent" }, "test").fix).toContain("20 วินาที");
    expect(step({ test: "sending" }, "test").state).toBe("wait");
    expect(step({ test: "none" }, "test").fix).toBe("ยังไม่มีเครื่องที่ลงทะเบียน");
    expect(step({ test: "error", testMsg: "ส่งไม่สำเร็จ (500)" }, "test").fix).toBe("ส่งไม่สำเร็จ (500)");
  });

  it("route: same origin ok, null fail, other host fail", () => {
    expect(step({}, "route").state).toBe("ok");
    expect(step({ appUrl: null }, "route").state).toBe("fail");
    const other = step({ appUrl: "https://preview-123.vercel.app" }, "route");
    expect(other.state).toBe("fail");
    expect(other.fix).toContain("https://preview-123.vercel.app");
    expect(other.fix).toContain(ORIGIN);
    expect(step({ appUrl: undefined }, "route").state).toBe("wait");
  });

  it("cron: 10 ok, 11 fail, null fail, undefined wait", () => {
    expect(step({ cronAgeMin: 10 }, "cron").state).toBe("ok");
    expect(step({ cronAgeMin: 10 }, "cron").detail).toBe("ล่าสุด 10 นาทีที่แล้ว");
    expect(step({ cronAgeMin: 11 }, "cron").state).toBe("fail");
    expect(step({ cronAgeMin: 11 }, "cron").fix).toContain("11 นาที");
    expect(step({ cronAgeMin: null }, "cron").state).toBe("fail");
    expect(step({ cronAgeMin: undefined }, "cron").state).toBe("wait");
  });

  it("firstFailing returns the first fail or warn in step order", () => {
    expect(firstFailing(steps({ cronAgeMin: 30, test: "idle" }))?.id).toBe("cron");
    expect(firstFailing(steps({ test: "idle" }))?.id).toBe("test");
    expect(firstFailing(steps({ sw: "installing", sub: "unknown" }))).toBeUndefined();
  });
});
