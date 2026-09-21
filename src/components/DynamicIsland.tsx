import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { setTheme, useTheme } from '../lib/theme';

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

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// How long a press has to be held before the island opens up. A shorter press
// is just a click (and goes home).
const HOLD_MS = 320;

// One extra digit above and two below the real range, so a drum can roll
// through its wrap-around (…9 → 0…) without ever showing a gap.
function drumDigits(mod: number): number[] {
  return Array.from({ length: mod + 2 }, (_, i) => (i - 1 + mod) % mod);
}

// A small black pill in the style of the iPhone's Dynamic Island, showing
// the 12-hour time as four rolling digits (06:50, always with a leading
// zero). It doubles as the site's home button, and holding it down opens it
// into a larger rounded rectangle that stays open until you click outside it:
// the day on the left of the time, the date on the right, and a dark mode
// switch underneath.
// Positioned by <TopBar>, which sits it beside the calculator button.
export function DynamicIsland() {
  const [now, setNow] = useState(() => new Date());
  const label = clockLabel(now);
  const [expanded, setExpanded] = useState(false);
  // True from the moment of pressing until release. The hover "grow" lets go
  // right away (see the CSS), so it has long since settled by the time a hold
  // is long enough to open the island — the two never animate together.
  const [pressed, setPressed] = useState(false);
  const stripRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const holdTimer = useRef<number | null>(null);
  // Set once a press has been held long enough to open the island, so the
  // click that follows the release doesn't also navigate home.
  const heldOpen = useRef(false);

  const linkRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  // What the switch shows. It's set on its own, in the same instant as the
  // click, rather than derived from the theme — the theme change is a
  // full-screen capture and repaint, and the switch shouldn't wait for it.
  const [checked, setChecked] = useState(theme === 'dark');
  useEffect(() => {
    setChecked(theme === 'dark');
  }, [theme]);

  function toggleTheme(e: React.MouseEvent<HTMLButtonElement>) {
    const next = !checked;
    const rect = e.currentTarget.querySelector('.island-switch')?.getBoundingClientRect();
    const origin = rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    // The switch snaps to its new state *before* the ripple takes its still
    // pictures, so both already show it flipped: it answers at once, and the
    // ripple starts at once, with no wait for a slide to finish first.
    document.documentElement.dataset.themeSwitching = 'true';
    flushSync(() => setChecked(next));
    setTheme(next ? 'dark' : 'light', origin);
  }

  // Letting go only cancels a hold that hadn't finished yet — once the island
  // is open it stays open (see the click-outside effect below).
  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function startHold(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    heldOpen.current = false;
    setPressed(true);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      heldOpen.current = true;
      setExpanded(true);
    }, HOLD_MS);
    // The release can happen anywhere (a finger can drift off the island), so
    // listen on the window rather than the island.
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      cancelHold();
      setPressed(false);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  // While it's open, clicking the island itself doesn't send you home — it's
  // showing information, and you close it by clicking anywhere else.
  function handleClick(e: React.MouseEvent) {
    if (heldOpen.current || expanded) {
      e.preventDefault();
      heldOpen.current = false;
    }
  }

  // A hold that opened the island and ended somewhere other than on the home
  // link never sees the click that would clear this flag, so clear it whenever
  // the island closes — otherwise the next click on the clock (a keyboard
  // Enter, say) would be swallowed.
  useEffect(() => {
    if (!expanded) heldOpen.current = false;
  }, [expanded]);

  // Once open, it stays open until you click (or tap) outside it, or press
  // Escape. Only attached while open, so the press that opened it isn't
  // mistaken for a click outside.
  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(e: PointerEvent) {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setExpanded(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
  }, []);

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

    const labelTimer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(labelTimer);
    };
  }, []);

  return (
    <div
      ref={linkRef}
      className={`dynamic-island-link${expanded ? ' dynamic-island-link-expanded' : ''}${pressed ? ' dynamic-island-link-pressed' : ''}`}
      onPointerDown={startHold}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="island-anchor">
        <motion.div
          className="dynamic-island"
          initial={{ y: -24, opacity: 0, scale: 0.6 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260 }}
        >
          <span className="island-top">
            <span className="island-side island-side-left" aria-hidden="true">
              {dayLabel(now)}
            </span>
            <Link
              to="/"
              className="island-digits"
              aria-label={`Home. Current time ${label}`}
              draggable={false}
              onClick={handleClick}
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
            </Link>
            <span className="island-side island-side-right" aria-hidden="true">
              {dateLabel(now)}
            </span>
          </span>
          <span className="island-controls" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="island-theme"
              role="switch"
              aria-checked={checked}
              tabIndex={expanded ? 0 : -1}
              onClick={toggleTheme}
            >
              <MoonIcon />
              <span className="island-theme-label">Dark mode</span>
              <span className="island-switch" aria-hidden="true" />
            </button>
          </span>
        </motion.div>
      </span>
    </div>
  );
}
