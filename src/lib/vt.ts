// v1.8 view transitions: tab switches only (React <ViewTransition> + <Link transitionTypes>). The BOOT script in
// layout.tsx and Gate keep html[data-vt="1"] while the API exists and motion is allowed (OS and in-app setting).
export const vtAllowed = (o: { supported: boolean; reduced: boolean; motionOff: boolean }) => o.supported && !o.reduced && !o.motionOff;
export const vtOn = () => typeof document !== "undefined" && document.documentElement.dataset.vt === "1";
// Page entrance kind, set by Gate in the commit that mounts the new page: "tab" = a switch between two tab pages (its
// rise is dropped while view transitions run, globals.css), push/pop = deeper/shallower inside one tab or settings
// (tab index -1), else "none" (plain rise). Tied to the commit, so a slow route never replays the rise mid-slide.
export type NavDir = "none" | "push" | "pop" | "tab";
export function navDir(from: string, to: string, tabOf: (p: string) => number): NavDir {
  const a = tabOf(from), b = tabOf(to);
  if (a !== b) return a >= 0 && b >= 0 ? "tab" : "none";
  const d = to.split("/").length - from.split("/").length;
  return d > 0 ? "push" : d < 0 ? "pop" : "none";
}
