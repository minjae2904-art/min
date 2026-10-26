"use client";

import Link from "next/link";
import { msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as A from "@/i18n/msg/app";

const m = msgs(A);

// Client component so the copy follows the UI language (rendered inside AppShell, below LangProvider).

export default function NotFound() {
  useLang();
  return (
    <main className="screen">
      <h1 className="large-title">{m("notFound.title")}</h1>
      <div className="subtitle">{m("notFound.sub")}</div>
      <Link href="/" className="btn">{m("notFound.btn")}</Link>
    </main>
  );
}
