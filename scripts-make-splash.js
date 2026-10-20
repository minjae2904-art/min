// Builds the iOS startup images (public/splash/<W>x<H>-<light|dark>.png) from src/lib/launch.json. Run: node scripts-make-splash.js
// Plain --bg color on purpose: the web view starts below the status bar (statusBarStyle "default"), so a logo in a
// full-screen image could not line up with the in-app launch mark; a solid color always matches its first frame.
// sharp comes with next (optional dependency), so run npm install first.
const fs = require("fs");
const sharp = require("sharp");
const L = require("./src/lib/launch.json");

(async () => {
  fs.mkdirSync("public/splash", { recursive: true });
  for (const [w, h, d] of L.splash) for (const [scheme, bg] of Object.entries(L.bg)) {
    const file = `public/splash/${w * d}x${h * d}-${scheme}.png`;
    await sharp({ create: { width: w * d, height: h * d, channels: 3, background: bg } }).png({ compressionLevel: 9 }).toFile(file);
    console.log(file);
  }
})();
