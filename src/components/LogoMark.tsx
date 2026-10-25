import L from "@/lib/launch.json";

export type MarkMode = "launch" | "loading" | "error";

// Krob mark (rings + check) from launch.json. Tracks, each arc and the check are separate <svg> layers, so the launch and
// loading animations move whole HTML boxes with transform/opacity only (composited; no SVG repaint per frame). The arc
// start angle stays in each circle's transform attribute; CSS only transforms the outer <svg> boxes.
export function LogoMark({ size, mode }: { size: number; mode: MarkMode }) {
  const circle = (r: (typeof L.rings)[number], stroke: string) => (
    <circle key={r.key} cx={128} cy={128} r={r.r} strokeWidth={L.ring} strokeDasharray={`${r.len} 600`} transform={`rotate(${r.rot} 128 128)`} style={{ ["--tone" as string]: stroke }} />
  );
  return (
    <div className={`mark mark-${mode}`} style={{ width: size, height: size }} aria-hidden>
      <svg className="mark-tracks" viewBox="0 0 256 256" focusable="false">{L.rings.map((r) => circle(r, `var(--mt-${r.key})`))}</svg>
      {L.rings.map((r, i) => (
        <svg key={r.key} className={`mark-arc r${i}`} viewBox="0 0 256 256" focusable="false">{circle(r, `var(--ring-${r.key})`)}</svg>
      ))}
      <svg className="mark-check" viewBox="0 0 256 256" focusable="false"><path d={L.check.d} strokeWidth={L.check.w} /></svg>
    </div>
  );
}
