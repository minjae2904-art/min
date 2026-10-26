import { ViewTransition, type ReactNode } from "react";

// v1.8 tab switch transition (Next docs: view-transitions guide, directional navigation). Nav's TabLink tags the
// navigation with "tab-l" / "tab-r" only when html[data-vt="1"]; any other navigation maps to "none" (no animation).
const DIR = { "tab-l": "tab-l", "tab-r": "tab-r", default: "none" };

export function TabPage({ children }: { children: ReactNode }) {
  return <ViewTransition enter={DIR} exit={DIR} default="none">{children}</ViewTransition>;
}
