import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';
export type Accent = 'iris' | 'ember' | 'forest' | 'rose';

// The swatches shown in the picker. The colors are fixed (they describe the
// accent itself, so they don't change with whichever one is active); the
// palettes the site actually uses live in index.css under [data-accent].
export const ACCENTS: { id: Accent; label: string; from: string; to: string }[] = [
  { id: 'iris', label: 'Iris', from: '#60a5fa', to: '#4f46e5' },
  { id: 'ember', label: 'Ember', from: '#ff9a3c', to: '#e4472b' },
  { id: 'forest', label: 'Forest', from: '#34d399', to: '#178a4a' },
  { id: 'rose', label: 'Rose', from: '#f472b6', to: '#db2777' },
];

const THEME_KEY = 'derive-theme';
const ACCENT_KEY = 'derive-accent';

function readSavedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readSavedAccent(): Accent {
  try {
    const saved = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.some((a) => a.id === saved) ? (saved as Accent) : 'iris';
  } catch {
    return 'iris';
  }
}

let currentTheme: Theme = readSavedTheme();
let currentAccent: Accent = readSavedAccent();
const listeners = new Set<() => void>();

function applyAll() {
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.dataset.accent = currentAccent;
}

// index.html sets both attributes before first paint (so a saved choice never
// flashes the default); this keeps them in step from here on.
applyAll();

export function getTheme(): Theme {
  return currentTheme;
}

export function getAccent(): Accent {
  return currentAccent;
}

interface Point {
  x: number;
  y: number;
}

const REVEAL_MS = 1250;
// Starts moving the instant it begins (a slow ease-in made the ripple feel like
// it hadn't started — the circle is tiny at first, so any delay in the curve
// reads as lag), but softer than a hard ease-out: it covers ground quickly,
// then decelerates for a long, gentle finish.
const REVEAL_EASING = 'cubic-bezier(0.25, 0.6, 0.3, 1)';
// The reveal's edge is a soft gradient rather than a hard line: this fraction
// of the mask's radius is solid, and the rest fades out.
const SOLID = 0.8;

function notify() {
  // Flushed synchronously so the page is fully repainted by the time a view
  // transition takes its "after" picture.
  flushSync(() => listeners.forEach((listener) => listener()));
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode etc.: the choice still applies for this visit.
  }
}

// Runs `update` (which changes the theme or the accent) so that the change
// ripples outward from `origin` (the control you used): the new look is
// revealed inside a circle that grows until it covers the screen, over a still
// picture of the old one. Browsers without view transitions, and anyone who
// prefers reduced motion, just get the instant swap.
function runWithRipple(update: () => void, origin?: Point) {
  const root = document.documentElement;
  const viewTransitions = (document as Document & {
    startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
  }).startViewTransition?.bind(document);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!viewTransitions || reduceMotion) {
    update();
    delete root.dataset.themeSwitching;
    return;
  }

  const transition = viewTransitions(update);

  transition.ready
    .then(() => {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      // The solid part of the mask has to reach the farthest corner.
      const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const size = (2 * reach) / SOLID;
      // Grow the mask's size while sliding its position so it stays centered on
      // the control the whole way.
      root.animate(
        {
          maskSize: ['0px 0px', `${size}px ${size}px`],
          maskPosition: [`${x}px ${y}px`, `${x - size / 2}px ${y - size / 2}px`],
          webkitMaskSize: ['0px 0px', `${size}px ${size}px`],
          webkitMaskPosition: [`${x}px ${y}px`, `${x - size / 2}px ${y - size / 2}px`],
        },
        {
          duration: REVEAL_MS,
          easing: REVEAL_EASING,
          fill: 'forwards',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {});

  transition.finished.finally(() => {
    delete root.dataset.themeSwitching;
  });
}

export function setTheme(theme: Theme, origin?: Point) {
  if (theme === currentTheme) {
    delete document.documentElement.dataset.themeSwitching;
    return;
  }
  runWithRipple(() => {
    currentTheme = theme;
    save(THEME_KEY, theme);
    applyAll();
    notify();
  }, origin);
}

export function setAccent(accent: Accent, origin?: Point) {
  if (accent === currentAccent) {
    delete document.documentElement.dataset.themeSwitching;
    return;
  }
  runWithRipple(() => {
    currentAccent = accent;
    save(ACCENT_KEY, accent);
    applyAll();
    notify();
  }, origin);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'light');
}

export function useAccent(): Accent {
  return useSyncExternalStore(subscribe, getAccent, () => 'iris');
}
