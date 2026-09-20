import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Each of the four slots is a vertical drum of digits. The digit that is
// actually correct is always the one sitting in the window; between changes
// it drifts steadily upward in step with the real clock, and when its time is
// up the next digit rolls in from below. `mod` is how many distinct digits
// that slot cycles through before wrapping.
const SLOTS = [
  { mod: 2 }, // hours, tens (0-1)
  { mod: 10 }, // hours, ones
  { mod: 6 }, // minutes, tens (0-5)
  { mod: 10 }, // minutes, ones
] as const;

// How far, at most, the current digit drifts up before it hands over, as a
// fraction of the spacing between digits (about 4px). Small enough that the
// digit stays fully in view and the next one stays out of it.
const MAX_DRIFT = 0.07;

// How quickly the drums glide to their target (seconds). Short enough that
// the slow drift is followed exactly, long enough that a digit change reads
// as a smooth roll rather than a jump.
const GLIDE_SECONDS = 0.16;

// The drum position each slot is heading toward right now: the true digit,
// plus a drift proportional to how far through its own span the clock is —
// the last slot across the 60 seconds of a minute, the next across the ten
// minutes it takes to change a minutes-tens digit, then the 60 minutes of an
// hour, then the ten hours of a tens-of-hours digit.
function drumTargets(now: Date): number[] {
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  const minutes = now.getMinutes();
  const hours = now.getHours();

  // 12-hour clock: 13:00 is 1, midnight is 12.
  const hour12 = hours % 12 || 12;

  const minuteOnesFrac = seconds / 60;
  const minuteTensFrac = ((minutes % 10) + minuteOnesFrac) / 10;
  const hourOnesFrac = (minutes + minuteOnesFrac) / 60;
  const hourTensFrac = ((hour12 % 10) + hourOnesFrac) / 10;

  return [
    (hour12 >= 10 ? 1 : 0) + MAX_DRIFT * hourTensFrac,
    (hour12 % 10) + MAX_DRIFT * hourOnesFrac,
    Math.floor(minutes / 10) + MAX_DRIFT * minuteTensFrac,
    (minutes % 10) + MAX_DRIFT * minuteOnesFrac,
  ];
}

function clockLabel(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// One extra digit above and two below the real range, so a drum can roll
// through its wrap-around (…9 → 0…) without ever showing a gap.
function drumDigits(mod: number): number[] {
  return Array.from({ length: mod + 2 }, (_, i) => (i - 1 + mod) % mod);
}

// A small black pill in the style of the iPhone's Dynamic Island, showing
// the 12-hour time as four rolling digits (06:50, always with a leading
// zero). Positioned by <TopBar>, which sits it beside the calculator button.
export function DynamicIsland() {
  const [label, setLabel] = useState(() => clockLabel(new Date()));
  const stripRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;
    let lastTime = performance.now();
    const shown = drumTargets(new Date());
    const written: string[] = [];

    function tick(t: number) {
      const dt = Math.min((t - lastTime) / 1000, 1);
      lastTime = t;
      const targets = drumTargets(new Date());
      const k = 1 - Math.exp(-dt / GLIDE_SECONDS);

      targets.forEach((target, i) => {
        const { mod } = SLOTS[i];
        let goal = target;
        // A drum only ever rolls upward: when the target has wrapped back
        // (…9 → 0, or 23:59 → 00:00), aim for the same digit one lap ahead
        // instead of rolling backwards through every digit.
        if (goal < shown[i] - 0.5) goal += mod;
        // Back from a hidden tab (or first frame): no long glide, just land.
        shown[i] = dt >= 1 ? goal : shown[i] + (goal - shown[i]) * k;
        if (shown[i] >= mod) shown[i] -= mod;

        const value = shown[i].toFixed(3);
        if (written[i] !== value) {
          written[i] = value;
          stripRefs.current[i]?.style.setProperty('--pos', value);
        }
      });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    const labelTimer = window.setInterval(() => setLabel(clockLabel(new Date())), 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(labelTimer);
    };
  }, []);

  return (
    <motion.div
      className="dynamic-island"
      initial={{ y: -24, opacity: 0, scale: 0.6 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 260 }}
      role="timer"
      aria-label={`Current time ${label}`}
    >
      {SLOTS.map((slot, i) => (
        <span key={i} className="island-slot" aria-hidden="true">
          <span className="island-window">
            <span
              className="island-strip"
              ref={(el) => {
                stripRefs.current[i] = el;
              }}
            >
              {drumDigits(slot.mod).map((d, j) => (
                <span key={j} className="island-digit">
                  {d}
                </span>
              ))}
            </span>
          </span>
        </span>
      ))}
    </motion.div>
  );
}
