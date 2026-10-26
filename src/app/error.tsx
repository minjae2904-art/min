"use client";

import { useEffect } from "react";
import { msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as A from "@/i18n/msg/app";
import * as Common from "@/i18n/msg/common";
import { clearLocalAndReload } from "@/lib/recover";

const m = msgs(A), c = msgs(Common);

// Route-level error boundary: renders inside the themed layout (AppShell is still up).
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useLang(); // re-render on a language switch
  useEffect(() => { console.error("[krob]", error.digest, error.message); }, [error]);
  return (
    <main className="screen">
      <h1 className="large-title">{m("error.title")}</h1>
      <div className="subtitle break-word">{error.digest ?? error.message}</div>
      <div className="confirm-actions">
        <button className="btn" onClick={() => retry()}>{c("retry")}</button>
        <button className="btn secondary" onClick={() => location.reload()}>{c("reload")}</button>
        <button className="btn danger" onClick={clearLocalAndReload}>{m("error.clear")}</button>
      </div>
    </main>
  );
}
