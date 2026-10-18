"use client";

import { useEffect } from "react";
import { clearLocalAndReload } from "@/lib/recover";

// Route-level error boundary: renders inside the themed layout (AppShell is still up).
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error("[krob]", error.digest, error.message); }, [error]);
  return (
    <main className="screen">
      <h1 className="large-title">มีบางอย่างผิดพลาด</h1>
      <div className="subtitle" style={{ wordBreak: "break-word" }}>{error.digest ?? error.message}</div>
      <div style={{ display: "grid", gap: 10 }}>
        <button className="btn" onClick={() => retry()}>ลองใหม่</button>
        <button className="btn secondary" onClick={() => location.reload()}>โหลดใหม่</button>
        <button className="btn danger" onClick={clearLocalAndReload}>ล้างข้อมูลในเครื่องนี้แล้วเปิดใหม่</button>
      </div>
    </main>
  );
}
