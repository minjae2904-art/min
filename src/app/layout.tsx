import type { Metadata, Viewport } from "next";
import { Anuphan } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// Thai glyphs: Anuphan (loopless, matches iOS). Latin + numbers fall back to SF Pro on Apple devices
// because -apple-system comes first in the stack and has no Thai glyphs.
const anuphan = Anuphan({ subsets: ["thai"], variable: "--font-thai", display: "swap" });

export const metadata: Metadata = {
  title: "Krob",
  description: "ครบ - สุขภาพ ยิม และตารางชีวิตประจำวัน",
  appleWebApp: { capable: true, title: "Krob", statusBarStyle: "default" },
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
    <html lang="th" className={anuphan.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
