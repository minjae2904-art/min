import type { MetadataRoute } from "next";
import { msgs } from "@/i18n";
import * as A from "@/i18n/msg/app";

const m = msgs(A);

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Krob",
    short_name: "Krob",
    // Static: one fixed bilingual description (spec 6.4); name/short_name stay "Krob".
    description: `${m.in("th", "app.desc")} / ${m.in("en", "app.desc")}`,
    start_url: "/",
    display: "standalone",
    // Dark-first, like the startup images' dark set. launch.json bg must equal --surface-0 in both modes (#f2f2f7 / #000).
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
