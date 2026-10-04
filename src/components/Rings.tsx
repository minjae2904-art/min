// Apple Fitness style activity rings. values are 0..1 (can exceed 1).
export function Rings({ values, size = 120 }: { values: [number, number, number]; size?: number }) {
  const colors = ["var(--ring-food)", "var(--ring-body)", "var(--ring-habit)"];
  const stroke = size * 0.11;
  const gap = stroke * 1.1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      {values.map((v, i) => {
        const r = size / 2 - stroke / 2 - i * gap;
        const c = 2 * Math.PI * r;
        return (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[i]} strokeOpacity={0.22} strokeWidth={stroke} />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[i]} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(v, 1))}
              style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2, 0.9, 0.3, 1)" }}
            />
          </g>
        );
      })}
    </svg>
  );
}
