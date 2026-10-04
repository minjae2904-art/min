// UI feedback: synthesized sounds (Web Audio, no files - pattern from min1lot-web lib/uiSound.js) + haptics.
// Haptics: Android uses navigator.vibrate. iOS Safari has no vibrate API, but since iOS 18 toggling an
// <input type="checkbox" switch> plays the system haptic, so we click a hidden one inside the tap handler.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let on = true;
let vol = 1;

export function configureSound(enabled: boolean, volume: number) {
  on = enabled;
  vol = volume;
  if (master) master.gain.value = 0.12 * vol;
}

function ac() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.12 * vol;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function env(c: AudioContext, g: GainNode, at: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

// Pitched note: sine body + a little triangle for a soft "glass" pluck.
function note(freq: number, at = 0, decay = 0.18, peak = 0.9, glideTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + at;
  for (const [type, mul, p] of [["sine", 1, peak], ["triangle", 2, peak * 0.18]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * mul, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo * mul, t + decay);
    env(c, g, t, p, 0.004, decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

// Filtered noise burst: the "click" of the iOS keyboard / switches.
function click(at = 0, freq = 3800, decay = 0.018, peak = 0.7) {
  const c = ac();
  if (!c || !master || !noise) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 1.2;
  const g = c.createGain();
  env(c, g, t, peak, 0.001, decay);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + decay + 0.03);
}

function whoosh(up: boolean) {
  const c = ac();
  if (!c || !master || !noise) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(up ? 400 : 2400, t);
  lp.frequency.exponentialRampToValueAtTime(up ? 2400 : 400, t + 0.18);
  const g = c.createGain();
  env(c, g, t, 0.25, 0.04, 0.16);
  src.connect(lp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.25);
}

function haptic(pattern: number | number[]) {
  try {
    if (navigator.vibrate?.(pattern)) return;
  } catch {}
  try {
    const label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {}
}

export type Sound = "tap" | "toggle" | "done" | "complete" | "undo" | "open" | "close" | "error" | "water";

export function play(name: Sound) {
  if (!on) return;
  if (name !== "open" && name !== "close") haptic(name === "complete" ? [12, 60, 12, 60, 24] : name === "error" ? [30, 40, 30] : 8);
  switch (name) {
    case "tap": click(); break;
    case "toggle": click(0, 3200); click(0.045, 4400, 0.014, 0.5); break;
    case "done": click(0, 4200, 0.012, 0.4); note(1046.5, 0.005, 0.16); note(1568, 0.06, 0.22, 0.7); break; // C6 -> G6
    case "complete": [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(f, i * 0.07, 0.3, 0.8)); note(2093, 0.3, 0.6, 0.35); break; // C major arpeggio
    case "undo": note(740, 0, 0.14, 0.6, 460); break;
    case "open": whoosh(true); break;
    case "close": whoosh(false); break;
    case "error": note(220, 0, 0.09, 0.8); note(196, 0.11, 0.12, 0.8); break;
    case "water": note(880, 0, 0.08, 0.6, 1320); note(1320, 0.05, 0.12, 0.4, 1760); break; // rising "bloop"
  }
}
