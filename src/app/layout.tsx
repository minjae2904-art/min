import type { Metadata, Viewport } from "next";
import { Anuphan } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import LAUNCH from "@/lib/launch.json";
import "./globals.css";

// Thai glyphs: Anuphan (loopless, matches iOS). Latin + numbers fall back to SF Pro on Apple devices
// because -apple-system comes first in the stack and has no Thai glyphs.
const anuphan = Anuphan({ subsets: ["thai"], variable: "--font-thai", display: "swap" });

// Runs before the first paint (next docs: preventing-flash-before-hydration). Applies the forced theme, motion choice,
// accent (html[data-accent], blue = no attribute), text size (html[data-fs], md = no attribute) and the v1.7 Night flag
// (html[data-night] while "nu", the next planned wake, is ahead) that Gate mirrors to "krob-ui", so a non-blue accent
// never flashes blue on a cold launch; then decides the launch animation: only on a load 4 h or more after the app was last
// used ("krob-seen" is refreshed on every load and whenever the page is hidden). While it plays (data-launch=play) the
// page entrance is paused; it is released at 480 ms, when the overlay starts to leave (keep in step with .launch).
// v1.8: html[data-vt="1"] when the View Transitions API exists and motion is allowed (vt.ts; Gate keeps it in sync).
const BOOT = `(function(){var d=document.documentElement,m=matchMedia("(prefers-reduced-motion: reduce)").matches;try{var u=JSON.parse(localStorage.getItem("krob-ui")||"{}");if(u.theme==="light"||u.theme==="dark")d.dataset.theme=u.theme;if(u.motion==="off"){d.dataset.motion="off";m=true}if(/^(green|orange|pink|purple|teal|indigo|mint)$/.test(u.accent))d.dataset.accent=u.accent;if(/^(sm|lg|xl)$/.test(u.fs))d.dataset.fs=u.fs;if(u.nu>Date.now())d.dataset.night="1";}catch(e){}if(typeof document.startViewTransition==="function"&&!m)d.dataset.vt="1";try{var k="krob-seen",n=Date.now(),l=Number(localStorage.getItem(k))||0;localStorage.setItem(k,String(n));document.addEventListener("visibilitychange",function(){if(document.hidden)try{localStorage.setItem(k,String(Date.now()))}catch(e){}});if(m||n-l<3e5)d.dataset.launch="skip";else{d.dataset.launch="play";setTimeout(function(){if(d.dataset.launch==="play")d.dataset.launch="done"},480)}}catch(e){d.dataset.launch="skip"}})()`;

export const metadata: Metadata = {
  title: "Krob",
  description: "ครบ - สุขภาพ ยิม และตารางชีวิตประจำวัน",
  appleWebApp: {
    capable: true, title: "Krob", statusBarStyle: "default",
    // iOS launch screen = plain --bg per iPhone size and appearance (scripts-make-splash.js) = first frame of <LaunchSplash>.
    startupImage: LAUNCH.splash.flatMap(([w, h, d]) => (["light", "dark"] as const).map((c) => ({
      url: `/splash/${w * d}x${h * d}-${c}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait) and (prefers-color-scheme: ${c})`,
    }))),
  },
  // capable only emits mobile-web-app-capable (next/dist/lib/metadata/metadata.js:604-608); older iOS reads startup
  // images only with the apple- tag, and it is harmless otherwise.
  other: { "apple-mobile-web-app-capable": "yes" },
  // src/app/icon.png already emits the <link rel="icon">; only the Apple touch icon needs listing.
  icons: { apple: "/icon-180.png" },
  // Personal app: keep it out of search engines (next.config.ts also sends X-Robots-Tag).
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={anuphan.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
