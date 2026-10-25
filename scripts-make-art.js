// Rebuilds app icons and art derivatives from logo/art/ (originals are not deployed).
// Run: node scripts-make-art.js  (sharp ships with next; run npm install first). Idempotent.
const fs = require("fs");
const sharp = require("sharp");
const SRC = "logo/art";
const OUT = "public/art";
const WEBP = { quality: 82, alphaQuality: 90, effort: 5 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const BADGES = ["gym-streak", "singing", "live-stream", "hydration", "sleep", "trading-discipline", "minecraft-server", "consistency", "trophy"];
const EMPTY = ["lifting-dumbbell", "holding-water", "streaming", "sleeping"];

const report = (f) => console.log(f.padEnd(40), String(fs.statSync(f).size).padStart(8), "B");
async function checkSize(file, w, h) {
  const m = await sharp(file).metadata();
  if (m.width !== w || m.height !== h) console.warn(`warn: ${file} is ${m.width}x${m.height}, expected ${w}x${h}`);
}

// Content box from the alpha channel (alpha > 8). sharp's trim() unions an RGB match against the
// top-left pixel with the alpha box, so hidden RGB in transparent pixels could widen it; do it directly.
async function alphaBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let l = info.width, t = info.height, r = -1, b = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[y * info.width + x] > 8) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  return r < 0 ? null : { left: l, top: t, width: r - l + 1, height: b - t + 1 };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // Icons: full-bleed source, flattened on black (iOS fills transparency with black anyway).
  const icon = `${SRC}/icon-app.png`;
  await checkSize(icon, 1254, 1254);
  const icons = [["public/icon-180.png", 180], ["public/icon-192.png", 192], ["public/icon-512.png", 512], ["public/logo-256.png", 256], ["src/app/icon.png", 64]];
  for (const [f, n] of icons) {
    await sharp(icon).resize(n, n, { kernel: "lanczos3" }).flatten({ background: "#000" }).png({ compressionLevel: 9 }).toFile(f);
    report(f);
  }
  // Maskable: content inside the 80% safe zone, padded on black (the icon's vignette edge is near black).
  const inner = await sharp(icon).resize(410, 410, { kernel: "lanczos3" }).flatten({ background: "#000" }).toBuffer();
  await sharp(inner).extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#000" }).png({ compressionLevel: 9 }).toFile("public/icon-maskable-512.png");
  report("public/icon-maskable-512.png");

  // Badges: numbered 512 RGBA set -> 256 WebP (covers 56px at DPR 3) and 128 WebP (DPR 2 / small uses).
  for (let i = 0; i < BADGES.length; i++) {
    const src = `${SRC}/${String(i + 1).padStart(2, "0")}-${BADGES[i]}.png`;
    await checkSize(src, 512, 512);
    for (const n of [256, 128]) {
      const f = `${OUT}/badge-${BADGES[i]}-${n}.webp`;
      await sharp(src).resize(n, n, { fit: "contain", background: CLEAR }).webp(WEBP).toFile(f);
      report(f);
    }
  }

  // Empty states: trim to content, pad 6%, fit into 800x600 (full) and 400x300 (compact).
  for (let i = 0; i < EMPTY.length; i++) {
    const src = `${SRC}/${String(i + 1).padStart(2, "0")}-${EMPTY[i]}.png`;
    await checkSize(src, 800, 600);
    const box = await alphaBox(src);
    let buf = await sharp(src).ensureAlpha().png().toBuffer();
    if (box) {
      const px = Math.round(box.width * 0.06), py = Math.round(box.height * 0.06);
      buf = await sharp(buf).extract(box).extend({ top: py, bottom: py, left: px, right: px, background: CLEAR }).png().toBuffer();
    }
    for (const [w, h] of [[800, 600], [400, 300]]) {
      const f = `${OUT}/empty-${EMPTY[i]}-${w}.webp`;
      await sharp(buf).resize(w, h, { fit: "contain", background: CLEAR }).webp(WEBP).toFile(f);
      report(f);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
