"use client";

import { Suspense } from "react";
import { InsightsView } from "@/components/insights/InsightsView";

// Merges the old /stats and /balance pages (both redirect here, see next.config.ts and public/sw.js).
export default function InsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightsView />
    </Suspense>
  );
}
