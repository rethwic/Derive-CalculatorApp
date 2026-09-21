// The dial's tactile side: a tiny click and (where the device has one) a short
// buzz for each minute it passes. Browsers only allow sound after a gesture, so
// the audio context is created the first time the dial is touched.

let ctx: AudioContext | null = null;
let last = 0;

export function unlockDialAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx ??= new Ctx();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // no sound, no problem
  }
}

// `strong` is for the five-minute marks: a touch higher and firmer.
export function dialTick(strong: boolean) {
  const now = performance.now();
  if (now - last < 28) return;
  last = now;
  try {
    navigator.vibrate?.(strong ? 9 : 4);
  } catch {
    // not supported
  }
  if (!ctx || ctx.state !== 'running') return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(strong ? 2300 : 1750, t);
    osc.frequency.exponentialRampToValueAtTime(strong ? 1500 : 1100, t + 0.03);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.09 : 0.05, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {
    // ignore
  }
}
