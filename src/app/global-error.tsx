"use client";

import { useEffect } from "react";
import { msgs } from "@/i18n";
import { useBootLang } from "@/i18n/react";
import * as A from "@/i18n/msg/app";
import { clearLocalAndReload } from "@/lib/recover";

const m = msgs(A);

// Replaces the root layout when it crashes: no globals.css here, so the styles are inline.
const btn: React.CSSProperties = { display: "block", width: "100%", padding: 14, borderRadius: 12, border: 0, fontSize: 17, fontWeight: 600, fontFamily: "inherit" };

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const lang = useBootLang(); // outside the store: the language the app last ran in
  useEffect(() => { console.error("[krob]", error.digest, error.message); }, [error]);
  return (
    <html lang={lang}>
      <body style={{ margin: 0, padding: "max(24px, env(safe-area-inset-top)) 16px 24px", minHeight: "100dvh", background: "#f2f2f7", color: "#000", fontFamily: "-apple-system, BlinkMacSystemFont, 'Leelawadee UI', sans-serif", colorScheme: "light" }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, margin: "4px 0 2px" }}>{m.in(lang, "globalError.title")}</h1>
        <p style={{ color: "rgba(60,60,67,0.6)", fontSize: 15, margin: "0 0 18px", wordBreak: "break-word" }}>{error.digest ?? error.message}</p>
        <div style={{ display: "grid", gap: 10 }}>
          <button style={{ ...btn, background: "#007aff", color: "#fff" }} onClick={() => retry()}>{m.in(lang, "globalError.retry")}</button>
          <button style={{ ...btn, background: "rgba(120,120,128,0.12)", color: "#007aff" }} onClick={() => location.reload()}>{m.in(lang, "globalError.reload")}</button>
          <button style={{ ...btn, background: "rgba(120,120,128,0.12)", color: "#ff3b30" }} onClick={clearLocalAndReload}>{m.in(lang, "globalError.clear")}</button>
        </div>
      </body>
    </html>
  );
}
