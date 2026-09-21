import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'derive-theme';

function readSaved(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let current: Theme = readSaved();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

// index.html sets the attribute before first paint (so a saved dark theme
// never flashes light); this keeps it in step from here on.
apply(current);

export function getTheme(): Theme {
  return current;
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

function commit(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode etc.: the choice still applies for this visit.
  }
  apply(theme);
  // Flushed synchronously so the page is fully repainted in the new theme by
  // the time a view transition takes its "after" picture.
  flushSync(() => listeners.forEach((listener) => listener()));
}

// Switching themes ripples outward from `origin` (the switch you flipped): the
// new theme is revealed inside a circle that grows until it covers the screen,
// over a still picture of the old one. Browsers without view transitions, and
// anyone who prefers reduced motion, just get the instant swap.
export function setTheme(theme: Theme, origin?: Point) {
  const root = document.documentElement;
  if (theme === current) {
    delete root.dataset.themeSwitching;
    return;
  }

  const viewTransitions = (document as Document & {
    startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
  }).startViewTransition?.bind(document);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!viewTransitions || reduceMotion) {
    commit(theme);
    delete root.dataset.themeSwitching;
    return;
  }

  const transition = viewTransitions(() => commit(theme));

  transition.ready
    .then(() => {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      // The solid part of the mask has to reach the farthest corner.
      const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const size = (2 * reach) / SOLID;
      // Grow the mask's size while sliding its position so it stays centered on
      // the switch the whole way.
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

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'light');
}
