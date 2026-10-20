"use client";

import { useEffect, useRef, useState } from "react";
import L from "@/lib/launch.json";
import { LogoMark } from "./LogoMark";
import { motionOff } from "./ui";

const EXIT_AT = 480; // ms after first paint; keep in step with .launch in globals.css and BOOT in layout.tsx
const AWAY = 5 * 60_000; // same threshold as BOOT (3e5): shorter app switches never replay it

// Brand moment over everything (z 130) on a cold start and when the app comes back to the front, only after 5 min
// away (BOOT in layout.tsx decides the cold start before paint; krob-seen holds the last time the app was hidden).
// CSS plays the whole 0.68 s timeline from the first paint, before hydration, so it never waits for JS and never holds
// the app back. JS only skips on tap and unmounts on a timer (never on animationend: motion-off kills animations).
export function LaunchSplash() {
  const [state, setState] = useState<"on" | "skip" | "gone">("on");
  const [run, setRun] = useState(0); // remount key: a new node restarts the CSS timeline
  const ref = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Back to the front after AWAY: replay the same timeline (iOS keeps the PWA alive, so BOOT does not run again).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden || motionOff()) return;
      let last = 0;
      try { last = Number(localStorage.getItem("krob-seen")) || 0; } catch {}
      if (!last || Date.now() - last < AWAY) return;
      const d = document.documentElement;
      d.dataset.launch = "play"; // holds the page entrance at frame 0, as on a cold start
      timers.current.forEach(clearTimeout);
      timers.current = [
        setTimeout(() => { if (d.dataset.launch === "play") d.dataset.launch = "done"; }, EXIT_AT),
        setTimeout(() => setState("gone"), 700),
      ];
      setRun((n) => n + 1);
      setState("on");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); timers.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.launch === "skip" || motionOff()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the boot decision is client-only
      setState("gone");
      return;
    }
    const t = setTimeout(() => setState("gone"), 700); // CSS has hidden it at 680 ms; this only removes the node
    return () => clearTimeout(t);
  }, []);

  if (state === "gone") return null;
  return (
    <div key={run} ref={ref} className={`launch ${state === "skip" ? "skip" : ""}`} aria-hidden onPointerDown={() => {
      // Once the CSS exit runs, swapping to the skip animation would flash the overlay back to opaque.
      if (state !== "on" || Number(ref.current?.getAnimations?.()[0]?.currentTime ?? 0) >= EXIT_AT) return;
      document.documentElement.dataset.launch = "done"; // release the paused page entrance now
      setState("skip");
      setTimeout(() => setState("gone"), 200);
    }}>
      <LogoMark size={L.size} mode="launch" />
    </div>
  );
}
