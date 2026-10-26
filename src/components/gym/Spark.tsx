// Tiny trend line (inline SVG, --area-training) with a dot on the last point. Fewer than 2 points draws only the dot.
export function Spark({ values, label, w = 96, h = 28 }: { values: number[]; label?: string; w?: number; h?: number }) {
  if (!values.length) return null;
  const lo = Math.min(...values), hi = Math.max(...values), pad = 3;
  const x = (i: number) => (values.length < 2 ? w - pad : pad + (i * (w - 2 * pad)) / (values.length - 1));
  const y = (v: number) => (hi === lo ? h / 2 : h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo));
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label ?? "แนวโน้ม"}>
      {values.length > 1 && <polyline points={pts} fill="none" stroke="var(--area-training)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(last)} cy={y(values[last])} r={3} fill="var(--area-training)" />
    </svg>
  );
}
