import { useSyncExternalStore } from 'react';
import { clearStatus, showStatus } from './islandStatus';

// A countdown timer that lives outside any page, so it keeps running as you
// move around the site (and across reloads: it stores when it will end, not a
// number of seconds left). The clock island shows it and controls it.

export type TimerPhase = 'idle' | 'running' | 'paused';

export interface TimerSnapshot {
  phase: TimerPhase;
  durationMs: number;
  remainingMs: number;
}

interface Stored {
  phase: TimerPhase;
  durationMs: number;
  // When a running timer reaches zero (epoch ms); null when not running.
  endsAt: number | null;
  // What was left when it was paused.
  remainingMs: number;
}

const KEY = 'derive-timer';
const IDLE: Stored = { phase: 'idle', durationMs: 0, endsAt: null, remainingMs: 0 };

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return IDLE;
    const p = JSON.parse(raw) as Partial<Stored>;
    if ((p.phase === 'running' || p.phase === 'paused') && typeof p.durationMs === 'number') {
      return {
        phase: p.phase,
        durationMs: p.durationMs,
        endsAt: typeof p.endsAt === 'number' ? p.endsAt : null,
        remainingMs: typeof p.remainingMs === 'number' ? p.remainingMs : p.durationMs,
      };
    }
  } catch {
    // fall through to idle
  }
  return IDLE;
}

let stored: Stored = load();
let ticker: number | undefined;
const listeners = new Set<() => void>();

function remaining(): number {
  return stored.phase === 'running' && stored.endsAt !== null
    ? Math.max(0, stored.endsAt - Date.now())
    : stored.remainingMs;
}

function compute(): TimerSnapshot {
  return { phase: stored.phase, durationMs: stored.durationMs, remainingMs: remaining() };
}

let snapshot: TimerSnapshot = compute();

function persist() {
  try {
    if (stored.phase === 'idle') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage unavailable: the timer still runs, it just won't survive a reload.
  }
}

function emit() {
  snapshot = compute();
  listeners.forEach((listener) => listener());
}

function stopTicker() {
  if (ticker !== undefined) window.clearInterval(ticker);
  ticker = undefined;
}

function startTicker() {
  stopTicker();
  ticker = window.setInterval(tick, 250);
}

// A soft two-note chime. Wrapped in try/catch: browsers only allow sound after
// the page has been interacted with, and a refusal should be silent.
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    [
      [880, 0],
      [1174.66, 0.2],
    ].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.65);
    });
    window.setTimeout(() => ctx.close(), 1800);
  } catch {
    // no sound, no problem
  }
}

function finish() {
  stopTicker();
  stored = IDLE;
  persist();
  emit();
  showStatus("Time's up", 'bell', 20000, [
    {
      label: '+5 min',
      run: () => {
        startTimer(5);
        showStatus('Timer set · 5 min', 'bell', 1800);
      },
    },
    { label: 'Dismiss', run: clearStatus },
  ]);
  chime();
  try {
    navigator.vibrate?.([220, 110, 220]);
  } catch {
    // not supported
  }
}

function tick() {
  if (stored.phase === 'running' && remaining() <= 0) {
    finish();
    return;
  }
  emit();
}

export function startTimer(minutes: number) {
  const durationMs = Math.max(1, Math.round(minutes)) * 60_000;
  stored = { phase: 'running', durationMs, endsAt: Date.now() + durationMs, remainingMs: durationMs };
  persist();
  startTicker();
  emit();
}

export function pauseTimer() {
  if (stored.phase !== 'running') return;
  stored = { ...stored, phase: 'paused', remainingMs: remaining(), endsAt: null };
  stopTicker();
  persist();
  emit();
}

export function resumeTimer() {
  if (stored.phase !== 'paused') return;
  stored = { ...stored, phase: 'running', endsAt: Date.now() + stored.remainingMs };
  persist();
  startTicker();
  emit();
}

export function cancelTimer() {
  if (stored.phase === 'idle') return;
  stopTicker();
  stored = IDLE;
  persist();
  emit();
}

// A timer that was running when the page was closed picks up where it should:
// still counting, or — if its time passed while you were away — done.
if (stored.phase === 'running') {
  if (remaining() <= 0) window.setTimeout(finish, 0);
  else startTicker();
}

// Background tabs throttle timers, so catch up the moment the tab is visible.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && stored.phase === 'running') tick();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTimer(): TimerSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

// "24:59", or "1:05:30" once it's an hour or more. Rounds up, so a timer shows
// its full minute until a whole second has actually gone.
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
