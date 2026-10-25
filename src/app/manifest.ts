import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Krob",
    short_name: "Krob",
    description: "ครบ - สุขภาพ ยิม และตารางชีวิตประจำวัน",
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
