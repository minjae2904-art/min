"use client";

// v1.8 weekly share card (spec 8): a story (1080x1920) or square (1080x1080) PNG drawn on a canvas in a fixed dark
// palette. The PNG is pre-rendered on open and on each change, so navigator.share({ files }) runs synchronously in the
// tap (iOS needs the user gesture). Without file sharing the preview image is the fallback (long-press to save).
import { useEffect, useMemo, useRef, useState } from "react";
import { langArr, msgs, withLang, type Lang } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as Msg from "@/i18n/msg/components-share";
import { IconDownload, IconShare } from "@/components/Icons";
import { Section, Segmented, Sheet, Switch, toast } from "@/components/ui";
import type { Cell } from "@/lib/bands";
import type { ShareOpts } from "@/lib/model";
import { shareData, shareLayout, shareTiles, type Box, type ShareData } from "@/lib/share";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

// Mirrors the dark values in globals.css (surfaces, labels, rings, areas): the image looks the same in any app theme.
const C = {
  bg: "#000000", card: "#1c1c1e", text: "#ffffff", text2: "rgba(235,235,245,0.6)", text3: "rgba(235,235,245,0.3)", faint: "rgba(235,235,245,0.12)",
  food: "#fa114f", body: "#92e82a", habit: "#1eeaef", live: "#c699f8", gym: "#74c878", weight: "#fc899d", sleep: "#a2a8fe",
};
const TONE: Record<string, string> = { band: C.body, live: C.live, gym: C.gym, weight: C.weight, sleep: C.sleep };
const m = msgs(Msg);
const title = () => m("shareSheet.cardTitle");
type Toggle = [Exclude<keyof ShareOpts, "fmt">, string, string?];
const TOGGLES: Toggle[] = langArr((): Toggle[] => [
  ["band", m("shareSheet.toggle.band"), m("shareSheet.toggle.bandSub")],
  ["live", m("shareSheet.toggle.live"), m("shareSheet.toggle.liveSub")],
  ["gym", m("shareSheet.toggle.gym")],
  ["weight", m("shareSheet.toggle.weight"), m("shareSheet.toggle.weightSub")],
  ["kg", m("shareSheet.toggle.kg")],
  ["sleep", m("shareSheet.toggle.sleep"), m("shareSheet.toggle.sleepSub")],
]);

function family(): string {
  let thai = "";
  try { thai = getComputedStyle(document.documentElement).getPropertyValue("--font-thai").trim(); } catch { /* SSR or blocked */ }
  return `${thai ? `${thai}, ` : ""}Thonburi, -apple-system, sans-serif`;
}

// True when the Thai face is ready; drawing goes ahead either way (fallback fonts) and redraws on loadingdone.
async function fontsReady(fam: string): Promise<boolean> {
  const f = typeof document !== "undefined" ? document.fonts : undefined;
  if (!f || typeof f.load !== "function") return false;
  try {
    const r = await Promise.all([f.load(`700 64px ${fam}`, "กข"), f.load(`400 40px ${fam}`, "กข")]); // i18n-allow: probe glyphs for loading the Thai font face
    return r[0].length > 0 && f.check(`700 64px ${fam}`, "กข"); // i18n-allow: probe glyphs for loading the Thai font face
  } catch { return false; }
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

function rr(x: CanvasRenderingContext2D, b: Box, r: number) {
  x.beginPath();
  if (typeof x.roundRect === "function") x.roundRect(b.x, b.y, b.w, b.h, r);
  else x.rect(b.x, b.y, b.w, b.h);
}

function card(x: CanvasRenderingContext2D, b: Box, r: number) { rr(x, b, r); x.fillStyle = C.card; x.fill(); }

function glow(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
}

// Largest size <= `size` at which `text` fits `maxW`. Every translated label goes through it (English runs wider).
function fit(x: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number, fam: string): number {
  let s = size;
  x.font = `${weight} ${s}px ${fam}`;
  while (s > 20 && x.measureText(text).width > maxW) { s -= 4; x.font = `${weight} ${s}px ${fam}`; }
  return s;
}

function cell(x: CanvasRenderingContext2D, c: Cell, cx: number, cy: number, r: number) {
  x.beginPath();
  if (c === "off") { x.moveTo(cx - r / 2, cy); x.lineTo(cx + r / 2, cy); x.strokeStyle = C.text3; x.lineWidth = 4; x.lineCap = "round"; x.stroke(); return; }
  x.arc(cx, cy, c === "hit" ? r : r - 2, 0, Math.PI * 2);
  if (c === "hit") { x.fillStyle = C.body; x.fill(); return; }
  x.strokeStyle = c === "today" ? C.body : c === "miss" ? C.text3 : C.faint; // a miss is neutral, never red
  x.lineWidth = c === "none" ? 2 : 4; x.stroke();
}

function draw(d: ShareData, fmt: ShareOpts["fmt"], fam: string, logo: HTMLImageElement | null): HTMLCanvasElement {
  const L = shareLayout(fmt, d), [W, H] = L.size, story = fmt === "story";
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return cv;
  const R = story ? 40 : 30, lab = story ? 36 : 28;
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  glow(x, W * 0.9, 0, W, "rgba(250,17,79,0.22)");
  glow(x, 0, H, W, "rgba(30,234,239,0.12)");
  x.textBaseline = "alphabetic"; x.textAlign = "left";

  const h = L.header, ts = story ? 92 : 72;
  const head = title();
  x.fillStyle = C.text; fit(x, head, 700, ts, h.w, fam); x.fillText(head, h.x, h.y + ts);
  x.fillStyle = C.text2; fit(x, d.range, 400, story ? 44 : 36, h.w, fam); x.fillText(d.range, h.x, h.y + ts + (story ? 80 : 60));

  if (L.band && d.band) {
    const b = L.band, pad = story ? 28 : 18, r = story ? 26 : 14;
    card(x, b, R);
    const inner = b.w - 2 * (pad + 8), bl = m("shareSheet.canvas.band");
    fit(x, bl, 400, lab, inner * 0.62, fam); x.fillStyle = C.text2; x.fillText(bl, b.x + pad + 8, b.y + pad + lab);
    if (d.band.elig) {
      const bv = m("shareSheet.canvas.bandDays", { hit: d.band.hit, elig: d.band.elig });
      x.textAlign = "right"; fit(x, bv, 700, lab, inner * 0.34, fam); x.fillStyle = C.text; x.fillText(bv, b.x + b.w - pad - 8, b.y + pad + lab); x.textAlign = "left";
    }
    const n = d.band.cells.length, cy = b.y + b.h - pad - r, x0 = b.x + pad + 8 + r, step = n > 1 ? (b.w - 2 * (pad + 8 + r)) / (n - 1) : 0;
    d.band.cells.forEach((c, i) => cell(x, c, x0 + i * step, cy, r));
  }

  const tiles = shareTiles(d);
  for (const { key, box } of L.tiles) {
    const t = tiles.find((k) => k.key === key);
    if (!t) continue;
    const pad = story ? 36 : 26, dot = lab * 0.28;
    card(x, box, R);
    x.beginPath(); x.arc(box.x + pad + dot, box.y + pad + lab * 0.62, dot, 0, Math.PI * 2); x.fillStyle = TONE[key] ?? C.habit; x.fill();
    fit(x, t.label, 400, lab, box.w - pad * 2 - dot * 2 - 14, fam); x.fillStyle = C.text2; x.fillText(t.label, box.x + pad + dot * 2 + 14, box.y + pad + lab);
    x.font = `400 ${lab}px ${fam}`;
    const uw = x.measureText(t.unit).width;
    fit(x, t.value, 700, story ? 104 : 64, box.w - pad * 2 - uw - 14, fam);
    const base = box.y + box.h - pad - (story ? 8 : 4);
    x.fillStyle = C.text; x.fillText(t.value, box.x + pad, base);
    const vw = x.measureText(t.value).width;
    x.font = `400 ${lab}px ${fam}`; x.fillStyle = C.text2; x.fillText(t.unit, box.x + pad + vw + 14, base);
  }

  if (L.spark && d.weight && d.weight.pts.length >= 2) {
    const b = L.spark, pad = 36, pts = d.weight.pts;
    card(x, b, R);
    const wl = m("shareSheet.canvas.weight");
    fit(x, wl, 400, lab, b.w - pad * 2, fam); x.fillStyle = C.text2; x.fillText(wl, b.x + pad, b.y + pad + lab);
    const top = b.y + pad + lab + 28, bot = b.y + b.h - pad - 10, left = b.x + pad + 10, right = b.x + b.w - pad - 10;
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (hi - lo < 0.4) { const m = (hi + lo) / 2; lo = m - 0.2; hi = m + 0.2; }
    const px = (i: number) => left + (i / (pts.length - 1)) * (right - left), py = (v: number) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    x.beginPath(); pts.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))));
    x.strokeStyle = C.weight; x.lineWidth = 6; x.lineCap = "round"; x.lineJoin = "round"; x.stroke();
    const lx = px(pts.length - 1), ly = py(pts[pts.length - 1]);
    x.beginPath(); x.arc(lx, ly, 16, 0, Math.PI * 2); x.fillStyle = "rgba(252,137,157,0.25)"; x.fill();
    x.beginPath(); x.arc(lx, ly, 9, 0, Math.PI * 2); x.fillStyle = C.weight; x.fill();
  }

  const f = L.footer, ls = story ? 72 : 56, ly = f.y + (f.h - ls) / 2, fs = story ? 40 : 32;
  let tx = f.x;
  if (logo) { x.save(); rr(x, { x: f.x, y: ly, w: ls, h: ls }, ls * 0.22); x.clip(); x.drawImage(logo, f.x, ly, ls, ls); x.restore(); tx += ls + 20; }
  const brand = m("shareSheet.canvas.brand");
  fit(x, brand, 700, fs, f.w - (tx - f.x), fam); x.fillStyle = C.text; x.fillText(brand, tx, ly + ls / 2 + fs * 0.35);
  return cv;
}

function canShareFiles(f: File): boolean {
  try { return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [f] }); } catch { return false; }
}

export function ShareSheet({ open, today, onClose }: { open: boolean; today: string; onClose: () => void }) {
  return (
    <Sheet open={open} title={m("shareSheet.title")} onClose={onClose}>
      <ShareBody today={today} />
    </Sheet>
  );
}

function ShareBody({ today }: { today: string }) {
  const { s, update } = useStore();
  const o = s.settings.share;
  const lang = useLang();
  const data = useMemo(() => withLang(lang, () => shareData(s, today, o)), [s, today, o, lang]);
  const key = JSON.stringify([data, o.fmt, lang]); // redraw only when the picture would change
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [can, setCan] = useState(false);
  const [failed, setFailed] = useState(false); // Web Share rejected (not a cancel): offer the download link too
  const [fontTick, setFontTick] = useState(0);
  const first = useRef(true);
  const logo = useRef<HTMLImageElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const f = typeof document !== "undefined" ? document.fonts : undefined;
    if (!f || typeof f.addEventListener !== "function") return;
    const on = () => setFontTick((n) => n + 1);
    f.addEventListener("loadingdone", on);
    return () => f.removeEventListener("loadingdone", on);
  }, []);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  useEffect(() => {
    let dead = false;
    const t = setTimeout(async () => {
      const fam = family();
      await fontsReady(fam);
      if (!logo.current) logo.current = await loadImg("/logo-256.png");
      if (dead) return;
      const [d, fmt, l] = JSON.parse(key) as [ShareData, ShareOpts["fmt"], Lang];
      const cv = withLang(l, () => draw(d, fmt, fam, logo.current));
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
      if (dead || !blob) return;
      const f = new File([blob], `krob-week-${today}.png`, { type: "image/png" });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setUrl(urlRef.current); setFile(f); setCan(canShareFiles(f));
    }, first.current ? 0 : 150);
    first.current = false;
    return () => { dead = true; clearTimeout(t); };
  }, [key, today, fontTick]);

  // Synchronous in the tap: the PNG already exists, so iOS keeps the user gesture.
  function onShare() {
    if (!file) return;
    play("tap");
    navigator.share({ files: [file], title: title() }).catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "AbortError") { setFailed(true); toast(m("shareSheet.toast.failed")); }
    });
  }

  const set = (patch: Partial<ShareOpts>) => update((st) => { st.settings.share = { ...st.settings.share, ...patch }; });
  const alt = [`${title()} ${data.range}`, ...shareTiles(data).map((t) => `${t.label} ${t.value} ${t.unit}`)].join(" · ");

  return (
    <>
      <div className="share-preview">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable asset */}
        {url ? <img className={`share-img share-img--${o.fmt}`} src={url} alt={alt} /> : <div className={`share-img share-img--${o.fmt} share-ph`} aria-hidden />}
      </div>
      {/* Download fallback without file sharing (desktop) or after a failed share; iOS keeps the long-press hint, since
          <a download> on a blob URL is unreliable in standalone mode. Never navigates to the blob. */}
      {file && url && (!can || failed) && (
        <a className="btn share-btn" href={url} download={file.name} onClick={() => play("tap")}>
          <IconDownload size={18} /> {m("shareSheet.save")}
        </a>
      )}
      {file && !can && <p className="share-hint">{m("shareSheet.hint")}</p>}
      {(!file || can) && (
        <button type="button" className="btn share-btn" disabled={!file} onClick={onShare}>
          <IconShare size={18} /> {m("shareSheet.share")}
        </button>
      )}
      <div className="share-fmt">
        <Segmented label={m("shareSheet.fmt")} value={o.fmt} options={[["story", m("shareSheet.fmt.story")], ["square", m("shareSheet.fmt.square")]]} onChange={(v) => set({ fmt: v })} />
      </div>
      <Section header={m("shareSheet.content.header")} footer={m("shareSheet.content.footer")}>
        {TOGGLES.filter(([k]) => k !== "kg" || o.weight).map(([k, label, sub]) => (
          <div key={k} className="row">
            <span className="row-main"><div className="row-title">{label}</div>{sub && <div className="row-sub">{sub}</div>}</span>
            <Switch label={label} on={o[k]} onChange={(v) => set({ [k]: v })} />
          </div>
        ))}
      </Section>
    </>
  );
}
