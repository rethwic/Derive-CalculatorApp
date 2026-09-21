import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { ACCENTS, setAccent, setTheme, useAccent, useTheme, type Accent } from '../lib/theme';
import { showStatus, useIslandStatus, type StatusIcon } from '../lib/islandStatus';
import { dialTick, unlockDialAudio } from '../lib/dialFeel';
import { cancelTimer, formatCountdown, pauseTimer, resumeTimer, startTimer, useTimer } from '../lib/timer';

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
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

// Minutes offered as one-tap timers in the open island.
const TIMER_PRESETS = [15, 30, 60];

// The timer badge on the pill's left: a small circle with the whole minutes
// left inside, and a ring around it that drains over each minute. When the
// ring has run all the way round the number drops by one and the ring refills.
function TimerBadge({ minutes, fraction, paused }: { minutes: number; fraction: number; paused: boolean }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <span className={`island-timer${paused ? ' island-timer-is-paused' : ''}`} aria-hidden="true">
      <svg className="island-ring" viewBox="0 0 32 32">
        <circle className="island-ring-track" cx="16" cy="16" r="14" />
        <circle
          className="island-ring-arc"
          cx="16"
          cy="16"
          r="14"
          pathLength={1}
          strokeDasharray={`${f} 1`}
          style={{ opacity: f < 0.008 ? 0 : 1 }}
        />
      </svg>
      <span className="island-timer-text" data-long={minutes >= 100 ? 'true' : undefined}>
        {minutes}
      </span>
    </span>
  );
}

// The ruler wraps around a disk seen edge-on: half the window shows this many
// minutes either side of the middle, out to HALF_ANGLE, where the ticks turn
// away. The most it will go to is DIAL_MAX.
const DIAL_HALF = 27;
const DIAL_HALF_ANGLE = (70 * Math.PI) / 180;
const DIAL_ANGLE = DIAL_HALF_ANGLE / DIAL_HALF;
const DIAL_MAX = 180;
const DIAL_TICKS = Array.from({ length: DIAL_MAX + 1 }, (_, i) => i);

// A ruler to scrub: drag it sideways (or use the wheel or arrow keys) to pick
// the minutes, then Start. The reading under the pointer is big and on the right.
function TimerDial({
  minutes,
  onChange,
  onStart,
  onBack,
  focusable,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  onStart: () => void;
  onBack: () => void;
  focusable: boolean;
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; samples: { t: number; m: number }[] } | null>(null);
  const inertia = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [radius, setRadius] = useState(80);
  // Where the disk is turned to. Dragging follows the finger exactly; a key,
  // the wheel, or letting go eases it to the chosen minute.
  const [pos, setPos] = useState(minutes);
  const posRef = useRef(minutes);
  const clamp = (v: number) => Math.max(1, Math.min(DIAL_MAX, v));
  const whole = Math.round(minutes);

  useLayoutEffect(() => {
    const el = windowRef.current;
    if (el) setRadius(el.clientWidth / 2 / Math.sin(DIAL_HALF_ANGLE));
  }, []);

  // A click (and a buzz) for every minute passed — a firmer one on the fives.
  const lastWhole = useRef(whole);
  useEffect(() => {
    if (whole !== lastWhole.current) {
      lastWhole.current = whole;
      dialTick(whole % 5 === 0);
    }
  }, [whole]);

  const stopInertia = () => {
    cancelAnimationFrame(inertia.current);
    inertia.current = 0;
  };
  useEffect(() => stopInertia, []);

  useEffect(() => {
    if (dragging) {
      posRef.current = minutes;
      setPos(minutes);
      return;
    }
    let raf = 0;
    const tick = () => {
      const diff = minutes - posRef.current;
      posRef.current = Math.abs(diff) < 0.01 ? minutes : posRef.current + diff * 0.22;
      setPos(posRef.current);
      if (posRef.current !== minutes) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [minutes, dragging]);

  function onDown(e: React.PointerEvent) {
    unlockDialAudio();
    stopInertia();
    windowRef.current?.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: minutes, samples: [] };
    setDragging(true);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const m = clamp(d.start - (e.clientX - d.x) / (radius * DIAL_ANGLE));
    d.samples.push({ t: performance.now(), m });
    if (d.samples.length > 6) d.samples.shift();
    onChange(m);
  }
  function onUp() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);

    // A flick keeps the disk spinning, slowing to a stop on a whole minute.
    const now = performance.now();
    const recent = d.samples.filter((s) => now - s.t < 90);
    let v = 0;
    if (recent.length >= 2) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      v = (last.m - first.m) / Math.max(1, last.t - first.t);
    }
    if (Math.abs(v) < 0.008) {
      onChange(whole);
      return;
    }
    let m = minutes;
    let prev = now;
    const step = (t: number) => {
      const dt = Math.min(48, t - prev);
      prev = t;
      m = clamp(m + v * dt);
      v *= Math.pow(0.94, dt / 16);
      const atEdge = m <= 1 || m >= DIAL_MAX;
      if (Math.abs(v) < 0.0025 || atEdge) {
        inertia.current = 0;
        onChange(Math.round(m));
        return;
      }
      onChange(m);
      inertia.current = requestAnimationFrame(step);
    };
    inertia.current = requestAnimationFrame(step);
  }
  function onKey(e: React.KeyboardEvent) {
    unlockDialAudio();
    stopInertia();
    const jump = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(clamp(whole + jump));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(clamp(whole - jump));
    else if (e.key === 'Home') onChange(1);
    else if (e.key === 'End') onChange(DIAL_MAX);
    else if (e.key === 'Enter') onStart();
    else return;
    e.preventDefault();
  }

  return (
    <span className="island-dial">
      <div
        ref={windowRef}
        className={`island-dial-window${dragging ? ' island-dial-dragging' : ''}`}
        role="slider"
        tabIndex={focusable ? 0 : -1}
        aria-label="Timer minutes"
        aria-valuemin={1}
        aria-valuemax={DIAL_MAX}
        aria-valuenow={whole}
        aria-valuetext={`${whole} minutes`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => {
          unlockDialAudio();
          stopInertia();
          onChange(clamp(whole + (e.deltaY + e.deltaX > 0 ? 1 : -1)));
        }}
        onKeyDown={onKey}
      >
        <div className="island-dial-strip">
          {DIAL_TICKS.map((i) => {
            const theta = (i - pos) * DIAL_ANGLE;
            if (Math.abs(theta) >= 1.5) return null;
            const c = Math.cos(theta);
            return (
              <i
                key={i}
                className={`island-dial-tick${i % 5 === 0 ? ' island-dial-tick-major' : ''}${i <= whole ? ' island-dial-tick-on' : ''}`}
                style={
                  {
                    '--f': Math.pow(c, 1.2),
                    '--b': Math.pow(1 - c, 1.3),
                    transform: `translateX(${radius * Math.sin(theta)}px) scale(${c}, ${Math.pow(c, 0.4)})`,
                  } as React.CSSProperties
                }
                data-label={i % 5 === 0 ? i : undefined}
              />
            );
          })}
        </div>
        <span className="island-dial-marker" aria-hidden="true" />
      </div>
      <span className="island-dial-row">
        <button
          type="button"
          className="island-dial-back"
          aria-label="Back to timer presets"
          tabIndex={focusable ? 0 : -1}
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" className="island-dial-start" tabIndex={focusable ? 0 : -1} onClick={onStart}>
          Start Timer
        </button>
        <span className="island-dial-readout" aria-hidden="true">
          {formatCountdown(whole * 60000)}
        </span>
      </span>
    </span>
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

// --- Settings hint -----------------------------------------------------------
// Everything behind the long press (dark mode, accent colors) is invisible
// until you know to hold the clock, so every time the page loads the island
// gives a gentle pulse and a small label. It goes away on any click, when you
// open the island, or after a few seconds. Nothing is remembered between loads.
const HINT_DELAY_MS = 2600;
const HINT_VISIBLE_MS = 7000;

function StatusGlyph({ icon }: { icon: StatusIcon }) {
  if (icon === 'copy') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2.2" />
        <path d="M5 15V6.5A2.5 2.5 0 017.5 4H15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'bell') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 1.5h-15L6 16.5z"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path d="M10 20.5a2 2 0 004 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'info') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 11v5.5M12 7.6v.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M7.8 12.4l3 3 5.4-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A small black pill in the style of the iPhone's Dynamic Island, showing
// the 12-hour time as four rolling digits (06:50, always with a leading
// zero). It doubles as the site's home button, and holding it down opens it
// into a larger rounded rectangle that stays open until you click outside it:
// the day on the left of the time, the date on the right, and underneath a
// dark mode switch and the accent color picker. It also briefly turns into a
// confirmation ("Added to workspace") when something in the app reports one.
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

  // --- status messages: the pill widens to fit the message, the time fades out
  // and the message fades in, then it all settles back. The last message is
  // kept while it fades out, so the text doesn't vanish mid-shrink.
  const status = useIslandStatus();
  const showingStatus = status !== null && !expanded;
  const lastStatus = useRef(status);
  if (status) lastStatus.current = status;
  const shownStatus = status ?? lastStatus.current;
  const statusRef = useRef<HTMLSpanElement>(null);
  const [statusWidth, setStatusWidth] = useState(0);
  useLayoutEffect(() => {
    const width = statusRef.current?.offsetWidth ?? 0;
    setStatusWidth(width);
    // Also published on the top bar, so the calculator button (a sibling, which
    // can't see this component's own variable) can slide out of the way.
    linkRef.current?.parentElement?.style.setProperty('--status-w', `${width}px`);
  }, [shownStatus?.id]);

  // --- the timer: shown in the pill (with a draining ring) while it runs, and
  // controlled from the open island. It lives in lib/timer.ts, so it keeps
  // counting as you move between pages.
  const timer = useTimer();
  const timerActive = timer.phase !== 'idle';
  const showingTimer = timerActive && !expanded && !showingStatus;
  // The badge counts whole minutes still to come after the current one, and
  // the ring is how much of the current minute is left.
  const wholeMinutes = Math.ceil(timer.remainingMs / 60000);
  const badgeMinutes = Math.max(0, wholeMinutes - 1);
  const minuteFraction = wholeMinutes <= 0 ? 0 : (timer.remainingMs - badgeMinutes * 60000) / 60000;

  // "Custom" swaps the settings rows for a scrubbable minutes dial.
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(15);
  useEffect(() => {
    if (!expanded) setCustomOpen(false);
  }, [expanded]);

  // The countdown also rides in the browser tab's title, so you can watch it
  // from another tab.
  const baseTitle = useRef<string | null>(null);
  useEffect(() => {
    if (timerActive) {
      if (baseTitle.current === null) baseTitle.current = document.title;
      document.title = `${formatCountdown(timer.remainingMs)} · ${baseTitle.current}`;
    } else if (baseTitle.current !== null) {
      document.title = baseTitle.current;
      baseTitle.current = null;
    }
  }, [timerActive, timer.remainingMs]);
  useEffect(
    () => () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    },
    [],
  );

  function beginTimer(minutes: number) {
    setCustomOpen(false);
    startTimer(minutes);
    showStatus(`Timer set · ${minutes} min`, 'bell', 1800);
    // Collapse, so the countdown is what you see.
    setExpanded(false);
  }

  // Whenever the island is bigger than its resting size (open, or showing a
  // message) it overlaps the calculator button, so it stays raised above it —
  // and stays raised through the shrink back, until it's really done.
  const bigger = expanded || showingStatus;
  const [raised, setRaised] = useState(false);
  useEffect(() => {
    if (bigger) {
      setRaised(true);
      return;
    }
    const timer = window.setTimeout(() => setRaised(false), 700);
    return () => window.clearTimeout(timer);
  }, [bigger]);

  // --- the first-visit hint
  const [hintVisible, setHintVisible] = useState(false);
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  useEffect(() => {
    const timer = window.setTimeout(() => setHintVisible(true), HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!hintVisible) return;
    const hide = () => setHintVisible(false);
    const timer = window.setTimeout(hide, HINT_VISIBLE_MS);
    window.addEventListener('pointerdown', hide, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', hide);
    };
  }, [hintVisible]);
  useEffect(() => {
    if (expanded || showingStatus) setHintVisible(false);
  }, [expanded, showingStatus]);

  const theme = useTheme();
  // What the switch shows. It's set on its own, in the same instant as the
  // click, rather than derived from the theme — the theme change is a
  // full-screen capture and repaint, and the switch shouldn't wait for it.
  const [checked, setChecked] = useState(theme === 'dark');
  useEffect(() => {
    setChecked(theme === 'dark');
  }, [theme]);

  // Same idea for the accent swatches: the ring moves to the chosen swatch at
  // once, and the recolor ripples out from it.
  const accent = useAccent();
  const [selectedAccent, setSelectedAccent] = useState<Accent>(accent);
  useEffect(() => {
    setSelectedAccent(accent);
  }, [accent]);

  function chooseAccent(next: Accent, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    document.documentElement.dataset.themeSwitching = 'true';
    flushSync(() => setSelectedAccent(next));
    setAccent(next, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  function toggleTheme(e: React.MouseEvent<HTMLButtonElement>) {
    const next = !checked;
    const rect = e.currentTarget.querySelector('.island-switch')?.getBoundingClientRect();
    const origin = rect && {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
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

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

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
      className={`dynamic-island-link${expanded ? ' dynamic-island-link-expanded' : ''}${pressed ? ' dynamic-island-link-pressed' : ''}${showingStatus ? ' dynamic-island-link-status' : ''}${showingTimer ? ' dynamic-island-link-timer' : ''}${raised ? ' dynamic-island-link-raised' : ''}${hintVisible ? ' dynamic-island-link-hinting' : ''}`}
      style={{ '--status-w': `${statusWidth}px` } as React.CSSProperties}
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
          <span ref={statusRef} className="island-status" role="status">
            {shownStatus && (
              <>
                <span className="island-status-icon">
                  <StatusGlyph icon={shownStatus.icon} />
                </span>
                <span className="island-status-text">{shownStatus.text}</span>
                {shownStatus.actions?.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="island-status-action"
                    tabIndex={showingStatus ? 0 : -1}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={action.run}
                  >
                    {action.label}
                  </button>
                ))}
              </>
            )}
          </span>
          {timerActive && (
            <TimerBadge minutes={badgeMinutes} fraction={minuteFraction} paused={timer.phase === 'paused'} />
          )}
          <span className="island-top">
            <span className="island-side island-side-left" aria-hidden="true">
              {dayLabel(now)}
            </span>
            <Link
              to="/"
              className="island-digits"
              aria-label={`Home. Current time ${label}${timerActive ? `. Timer ${formatCountdown(timer.remainingMs)} remaining${timer.phase === 'paused' ? ', paused' : ''}` : ''}`}
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
            {customOpen && !timerActive ? (
              <TimerDial
                minutes={customMinutes}
                onChange={setCustomMinutes}
                onStart={() => beginTimer(Math.round(customMinutes))}
                onBack={() => setCustomOpen(false)}
                focusable={expanded}
              />
            ) : (
              <>
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
                <span className="island-accent" role="radiogroup" aria-label="Accent color">
                  <span className="island-accent-label">Color</span>
                  <span className="island-swatches">
                    {ACCENTS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="island-swatch"
                        role="radio"
                        aria-checked={selectedAccent === a.id}
                        aria-label={a.label}
                        title={a.label}
                        tabIndex={expanded ? 0 : -1}
                        style={{ '--from': a.from, '--to': a.to } as React.CSSProperties}
                        onClick={(e) => chooseAccent(a.id, e)}
                      />
                    ))}
                  </span>
                </span>
                <span className="island-timer-row" role="group" aria-label="Timer">
                  {timerActive ? (
                    <>
                      <span className="island-timer-info">
                        <span className="island-timer-readout">{formatCountdown(timer.remainingMs)}</span>
                        <span className="island-timer-caption">
                          {timer.phase === 'paused' ? 'Paused' : 'Remaining'}
                        </span>
                      </span>
                      <span className="island-timer-buttons">
                        <button
                          type="button"
                          className="island-timer-btn"
                          aria-label={timer.phase === 'paused' ? 'Resume timer' : 'Pause timer'}
                          tabIndex={expanded ? 0 : -1}
                          onClick={() => (timer.phase === 'paused' ? resumeTimer() : pauseTimer())}
                        >
                          {timer.phase === 'paused' ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                              <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          className="island-timer-btn"
                          aria-label="Cancel timer"
                          tabIndex={expanded ? 0 : -1}
                          onClick={() => cancelTimer()}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M7 7l10 10M17 7L7 17"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="island-timer-label">Timer</span>
                      <span className="island-timer-presets">
                        {TIMER_PRESETS.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            className="island-timer-preset"
                            aria-label={`${minutes} minute timer`}
                            tabIndex={expanded ? 0 : -1}
                            onClick={() => beginTimer(minutes)}
                          >
                            {minutes}m
                          </button>
                        ))}
                        <button
                          type="button"
                          className="island-timer-preset"
                          aria-label="Custom timer"
                          tabIndex={expanded ? 0 : -1}
                          onClick={() => setCustomOpen(true)}
                        >
                          Custom
                        </button>
                      </span>
                    </>
                  )}
                </span>
              </>
            )}
          </span>
        </motion.div>
        <AnimatePresence>
          {hintVisible && (
            <span className="island-hint-slot" aria-hidden="true">
              <motion.span
                className="island-hint"
                initial={{ opacity: 0, y: -6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              >
                {coarsePointer ? 'Press and hold the clock for settings' : 'Hold the clock for settings'}
              </motion.span>
            </span>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
}
