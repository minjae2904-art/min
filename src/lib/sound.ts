// Tiny UI sounds synthesized with Web Audio (no files). Pattern borrowed from min1lot-web lib/uiSound.js.
// iOS Safari has no vibration API, so a soft tick is the closest thing to haptic feedback.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let soundOn = true;
export const setSoundOn = (v: boolean) => { soundOn = v; };

function ac() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(f: number, t: number, at = 0, to?: number) {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const v = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(f, c.currentTime + at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, c.currentTime + at + t);
  v.gain.setValueAtTime(0.0001, c.currentTime + at);
  v.gain.exponentialRampToValueAtTime(1, c.currentTime + at + 0.006);
  v.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + t);
  o.connect(v);
  v.connect(master);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + t + 0.02);
}

export function play(name: "tick" | "done" | "complete" | "undo") {
  if (!soundOn) return;
  try { navigator.vibrate?.(name === "complete" ? [12, 40, 12] : 10); } catch {}
  if (name === "tick") tone(1400, 0.035);
  if (name === "undo") tone(660, 0.06, 0, 440);
  if (name === "done") { tone(880, 0.07); tone(1320, 0.09, 0.05); }
  if (name === "complete") { tone(784, 0.09); tone(988, 0.09, 0.08); tone(1318, 0.16, 0.16); }
}
