"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Section } from "./ui";

// Single account, created by the owner in the Supabase dashboard (public sign-up disabled).
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }

  return (
    <main className="screen" style={{ paddingTop: "calc(env(safe-area-inset-top) + 15vh)" }}>
      <img src="/icon-192.png" alt="" width={84} height={84} style={{ borderRadius: 19, display: "block", margin: "0 auto 16px" }} />
      <h1 className="large-title" style={{ textAlign: "center" }}>Krob</h1>
      <div className="subtitle" style={{ textAlign: "center" }}>ลงชื่อเข้าใช้เพื่อซิงค์ข้อมูล</div>
      <form onSubmit={submit}>
        <Section footer={err || undefined}>
          <input className="field" type="email" autoComplete="username" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} style={{ borderRadius: 0 }} />
          <div style={{ borderTop: "0.5px solid var(--sep)", marginLeft: 16 }} />
          <input className="field" type="password" autoComplete="current-password" placeholder="รหัสผ่าน" value={password} onChange={(e) => setPassword(e.target.value)} style={{ borderRadius: 0 }} />
        </Section>
        <button className="btn" disabled={busy || !email || !password} style={{ opacity: busy || !email || !password ? 0.5 : 1 }}>
          {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}
