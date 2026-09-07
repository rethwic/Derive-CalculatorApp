import { lazy, Suspense, useState } from 'react';

// Deferred: pulls in mathjs, which is otherwise unused by everyone who
// never opens the calculator — no reason to make that part of the initial
// page load, on any page.
const CalculatorPanel = lazy(() => import('./CalculatorPanel').then((m) => ({ default: m.CalculatorPanel })));

// A left-pointing arrow — the panel itself slides in from the right, so
// the icon points the same direction as the thing it triggers.
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Mounted once at the app root (see App.tsx) rather than inside any one
// page, so the pull-tab and the calculator's own state are the same across
// every route instead of resetting whenever you navigate.
export function CalculatorLauncher() {
  const [open, setOpen] = useState(false);
  // Once true, the panel component stays mounted (even while visually
  // closed) so its expression list survives being closed and reopened —
  // it's gated on first-open purely to defer the lazy import.
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          className="calculator-pull-tab glass"
          aria-label="Open calculator"
          onClick={() => {
            setOpen(true);
            setLoaded(true);
          }}
        >
          <ArrowIcon />
        </button>
      )}
      {loaded && (
        <Suspense fallback={null}>
          <CalculatorPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
