// Builds all app icons from logo/krob.png. Run: node scripts-make-icons.js
// sharp is borrowed from min1lot-web (not a krob dependency).
const sharp = require("C:/Users/Administrator/min1lot-web/node_modules/sharp");
const SRC = "logo/krob.png";

(async () => {
  const { width, height } = await sharp(SRC).metadata();
  // The rings sit slightly above center in the source; crop a square centered on them.
  const cx = Math.round(width * 0.4995), cy = Math.round(height * 0.4745);
  const size = Math.min(width, height) - 2 * Math.abs(cy - height / 2) - 8;
  const left = Math.max(0, Math.round(cx - size / 2)), top = Math.max(0, Math.round(cy - size / 2));
  const square = await sharp(SRC).extract({ left, top, width: size, height: size }).flatten({ background: "#000" }).png().toBuffer();

  for (const s of [180, 192, 512]) await sharp(square).resize(s, s).png().toFile(`public/icon-${s}.png`);
  // Maskable: Android crops to a circle, keep content inside the safe 80% zone.
  const inner = await sharp(square).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: "#000" } }).composite([{ input: inner, gravity: "center" }]).png().toFile("public/icon-maskable-512.png");
  await sharp(square).resize(64, 64).png().toFile("src/app/icon.png");
  await sharp(square).resize(256, 256).png().toFile("public/logo-256.png");
  console.log("source", width, height, "crop", left, top, size);
})();
