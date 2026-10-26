// v1.8 weekly share card (pure): what goes on the image and where. Only counts and rounded numbers; never reads
// journal, trade (no P&L), profile name, identity, template names, custom titles or class titles.
import { fmt, getLang, msgs, plural } from "../i18n";
import * as M from "../i18n/msg/lib-3";
import { band, type Band } from "./bands";
import { addDays } from "./date";
import { trend } from "./health";
import type { ShareOpts, State } from "./model";
import { sleepHours } from "./stats";

export const SHARE_SIZE = { story: [1080, 1920], square: [1080, 1080] } as const;
export type ShareData = { range: string; band?: Band; liveH?: number; gym?: number; weight?: { delta: number | null; kg: number | null; pts: number[] }; sleep?: number };
export type ShareTile = { key: "band" | "live" | "gym" | "weight" | "sleep"; label: string; value: string; unit: string };
export type Box = { x: number; y: number; w: number; h: number };

const m = msgs(M);
const short = (d: string) => fmt.dayMonth(d);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r05 = (n: number) => Math.round(n * 2) / 2;
const halfText = (h: number) => h.toFixed(1).replace(/\.0$/, "");
const signed = (n: number) => (Math.abs(n) < 0.05 ? "0.0" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);

// The 7 logical days ending `end`.
export function shareData(s: State, end: string, o: ShareOpts): ShareData {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const out: ShareData = { range: `${short(dates[0])} - ${short(end)}` };
  if (o.band) out.band = band(s, end, "day", 7);
  if (o.live) {
    // Real session minutes only (never planned hours); omitted when nothing was recorded.
    const min = dates.reduce((a, d) => { const m = s.days[d]?.live?.min; return a + (typeof m === "number" && m > 0 ? m : 0); }, 0);
    const h = r05(min / 60);
    if (h > 0) out.liveH = h;
  }
  if (o.gym) out.gym = new Set(s.workouts.filter((w) => w.date >= dates[0] && w.date <= end && w.code.startsWith("D")).map((w) => w.date)).size;
  if (o.weight) {
    const from = addDays(end, -13);
    const pts = trend(s.weights).filter((w) => w.date >= from && w.date <= end).map((w) => Math.round(w.trend * 100) / 100);
    if (pts.length) {
      const delta = pts.length >= 2 ? r1(pts[pts.length - 1] - pts[0]) : null;
      const kg = o.kg ? r1(pts[pts.length - 1]) : null;
      if (delta !== null || kg !== null) out.weight = { delta, kg, pts };
    }
  }
  if (o.sleep) {
    const hs = dates.map((d) => sleepHours(s, d)).filter((h): h is number => h !== null);
    if (hs.length >= 3) out.sleep = r05(hs.reduce((a, b) => a + b, 0) / hs.length);
  }
  return out;
}

export function shareTiles(d: ShareData): ShareTile[] {
  const t: ShareTile[] = [];
  if (d.band && d.band.elig) t.push({ key: "band", label: m("share.tile.band"), value: `${d.band.hit}/${d.band.elig}`, unit: m("share.unit.days") });
  if (d.liveH !== undefined) t.push({ key: "live", label: m("share.tile.live"), value: halfText(d.liveH), unit: m("share.unit.h") });
  if (d.gym !== undefined) t.push({ key: "gym", label: m("share.tile.gym"), value: String(d.gym), unit: plural(getLang(), d.gym, m("share.unit.gymOne"), m("share.unit.gym")) });
  if (d.weight) {
    const { delta, kg } = d.weight;
    if (kg !== null) t.push({ key: "weight", label: m("share.tile.weight"), value: kg.toFixed(1), unit: delta !== null ? `kg (${signed(delta)})` : "kg" });
    else if (delta !== null) t.push({ key: "weight", label: m("share.tile.weight"), value: signed(delta), unit: "kg" });
  }
  if (d.sleep !== undefined) t.push({ key: "sleep", label: m("share.tile.sleep"), value: halfText(d.sleep), unit: m("share.unit.h") });
  return t;
}

// 72 px margins, 2-column tiles (an odd last tile spans both). The middle block (band, tiles, spark) is centred
// between header and footer. Story keeps clear of the top/bottom bars of story viewers; square has no spark.
export function shareLayout(fmt: ShareOpts["fmt"], d: ShareData): { size: [number, number]; header: Box; band?: Box; tiles: { key: string; box: Box }[]; spark?: Box; footer: Box } {
  const [W, H] = SHARE_SIZE[fmt];
  const M = 72, IW = W - M * 2, story = fmt === "story";
  const L = story ? { top: 200, head: 200, band: 160, tile: 230, gap: 32, spark: 200, foot: 100, bottom: 120 } : { top: M, head: 150, band: 110, tile: 150, gap: 24, spark: 0, foot: 80, bottom: M };
  const header: Box = { x: M, y: L.top, w: IW, h: L.head };
  const footer: Box = { x: M, y: H - L.bottom - L.foot, w: IW, h: L.foot };
  const tiles = shareTiles(d);
  const showBand = !!d.band;
  const showSpark = story && !!d.weight && d.weight.pts.length >= 2;
  const rows = Math.ceil(tiles.length / 2);
  const parts = [showBand ? L.band : 0, rows ? rows * L.tile + (rows - 1) * L.gap : 0, showSpark ? L.spark : 0].filter((h) => h > 0);
  const used = parts.reduce((a, h) => a + h, 0) + Math.max(0, parts.length - 1) * L.gap;
  const top = header.y + header.h + L.gap, avail = footer.y - L.gap - top;
  let y = top + Math.max(0, Math.round((avail - used) / 2));
  const out: ReturnType<typeof shareLayout> = { size: [W, H], header, tiles: [], footer };
  if (showBand) { out.band = { x: M, y, w: IW, h: L.band }; y += L.band + L.gap; }
  const tw = (IW - L.gap) / 2;
  tiles.forEach((t, i) => {
    const r = Math.floor(i / 2), c = i % 2, wide = i === tiles.length - 1 && tiles.length % 2 === 1;
    out.tiles.push({ key: t.key, box: { x: M + (wide ? 0 : c * (tw + L.gap)), y: y + r * (L.tile + L.gap), w: wide ? IW : tw, h: L.tile } });
  });
  if (rows) y += rows * L.tile + rows * L.gap;
  if (showSpark) out.spark = { x: M, y, w: IW, h: L.spark };
  return out;
}
