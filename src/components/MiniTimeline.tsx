import { hm } from "@/lib/date";
import { blockEnd, type Item } from "@/lib/schedule";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";

const m = msgs(C);

const COLOR: Partial<Record<Item["kind"], string>> = { game: "var(--area-leisure)", sing: "var(--area-voice)", mc: "var(--area-projects)", gym: "var(--area-training)", trade: "var(--area-trading)", stream: "var(--area-leisure)", class: "var(--info)" };

// Thin bar of the waking day (weigh..sleep) with the shift and the activity blocks; no labels.
export function MiniTimeline({ items, work, nowMin }: { items: Item[]; work?: boolean; nowMin?: number }) {
  const from = items.find((i) => i.id === "weigh")?.min ?? 780;
  const to = items.find((i) => i.kind === "sleep")?.min ?? 1740;
  const span = Math.max(1, to - from);
  const pos = (m: number) => Math.min(100, Math.max(0, ((m - from) / span) * 100));
  const blocks: { key: string; title: string; start: number; end: number; color: string }[] = [];
  const wi = items.find((i) => i.id === "work-in"), wo = items.find((i) => i.id === "work-out");
  if (work && wi && wo) blocks.push({ key: "work", title: m("miniTimeline.work"), start: wi.min, end: wo.min, color: "var(--info)" });
  for (const i of items) {
    const color = COLOR[i.kind];
    if (!color || i.id === "game-stop") continue;
    const end = blockEnd(items, i);
    if (end !== undefined) blocks.push({ key: i.id, title: i.title, start: i.min, end, color });
  }
  const label = blocks.map((b) => `${b.title} ${hm(b.start)}-${hm(b.end)}`).join(", ");
  return (
    <div className="mini-tl" role="img" aria-label={label || m("miniTimeline.aria")}>
      {blocks.map((b, k) => (
        <span key={b.key} style={{ left: `${pos(b.start)}%`, width: `${Math.max(1.5, pos(b.end) - pos(b.start))}%`, ["--tone" as string]: b.color, ["--bi" as string]: k }} />
      ))}
      {nowMin !== undefined && nowMin >= from && nowMin <= to && <i className="mini-tl-now" style={{ left: `${pos(nowMin)}%` }} />}
    </div>
  );
}
