import { useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { LandingPage } from '../pages/LandingPage';
import { SubjectPage } from '../pages/SubjectPage';
import { WorkspacePage } from '../pages/WorkspacePage';
import { ContactPage } from '../pages/ContactPage';
import { subjects } from '../data/subjects';

interface Move {
  from: string;
  to: string;
}

// Pages in "left to right" order, so moving between siblings (Math → Science)
// slides the way you'd expect and moving back slides the other way.
const ORDER = ['/', '/subject', '/workspace', '/contact'];

function orderOf(path: string) {
  const i = ORDER.indexOf(path);
  return i < 0 ? 0 : i;
}

// Three kinds of move, each with its own feel:
//  - leaving home: home rushes past toward you while the next page rises in
//  - returning home: the page drops away and home settles in from close up
//  - between sibling pages: a short horizontal slide, in the direction of travel
function describe(move: Move) {
  if (move.from === move.to) return { kind: 'none' as const, dir: 0 };
  if (move.from === '/') return { kind: 'deeper' as const, dir: 1 };
  if (move.to === '/') return { kind: 'home' as const, dir: -1 };
  return { kind: 'slide' as const, dir: Math.sign(orderOf(move.to) - orderOf(move.from)) || 1 };
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

const variants: Variants = {
  initial: (move: Move) => {
    const { kind, dir } = describe(move);
    if (kind === 'deeper') return { opacity: 0, y: 36, scale: 0.98 };
    if (kind === 'home') return { opacity: 0, scale: 1.07 };
    if (kind === 'slide') return { opacity: 0, x: dir * 56 };
    return { opacity: 0 };
  },
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: EASE_OUT },
  },
  exit: (move: Move) => {
    const { kind, dir } = describe(move);
    const transition = { duration: 0.26, ease: EASE_IN };
    if (kind === 'deeper') return { opacity: 0, scale: 1.08, transition };
    if (kind === 'home') return { opacity: 0, scale: 0.97, y: 18, transition };
    if (kind === 'slide') return { opacity: 0, x: -dir * 56, transition };
    return { opacity: 0, transition };
  },
};

// Plain fades for anyone who's asked their system for less motion.
const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// The subject pages are one "page" as far as the whole-page transition goes:
// SubjectPage animates its own content when you switch between them, leaving
// the header (tabs and search) untouched.
function pageKey(pathname: string) {
  return subjects.some((s) => pathname === `/${s.id}`) ? '/subject' : pathname;
}

export function AnimatedRoutes() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  // Where we just came from, held steady across re-renders so the exiting
  // page keeps the same direction for its whole exit.
  const moveRef = useRef<Move>({ from: pageKey(location.pathname), to: pageKey(location.pathname) });
  if (moveRef.current.to !== pageKey(location.pathname)) {
    moveRef.current = { from: moveRef.current.to, to: pageKey(location.pathname) };
  }
  const move = moveRef.current;

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      custom={move}
      // Each page starts at the top, even if the last one was scrolled.
      onExitComplete={() => window.scrollTo(0, 0)}
    >
      <motion.div
        key={pageKey(location.pathname)}
        className="route-shell"
        custom={move}
        variants={reduceMotion ? reducedVariants : variants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/:subjectId" element={<SubjectPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
