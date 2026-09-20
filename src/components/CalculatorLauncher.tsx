import { lazy, Suspense, useEffect, useRef, useState } from 'react';

// Deferred: pulls in mathjs, which is otherwise unused by everyone who
// never opens the calculator — no reason to make that part of the initial
// page load, on any page.
const CalculatorPanel = lazy(() => import('./CalculatorPanel').then((m) => ({ default: m.CalculatorPanel })));

// A left-pointing arrow — the panel itself grows out from the button's
// right-hand edge of the screen, so the icon points the way it opens.
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
  // Separate from `open`: the button stays hidden for the whole time the
  // panel is on screen, including its shrink-back animation, so it doesn't
  // pop back in while the panel is still flying into that same spot.
  const [tabHidden, setTabHidden] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const tabRef = useRef<HTMLButtonElement>(null);

  // The button never unmounts (just hides), so its rect can be re-measured
  // if the window changes size while the calculator is open — the panel
  // shrinks back into wherever the button really is by then.
  useEffect(() => {
    if (!open) return;
    function measure() {
      if (tabRef.current) setOrigin(tabRef.current.getBoundingClientRect());
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  function openCalculator() {
    if (tabRef.current) setOrigin(tabRef.current.getBoundingClientRect());
    setTabHidden(true);
    setLoaded(true);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        className="calculator-pull-tab glass"
        style={{ visibility: tabHidden ? 'hidden' : 'visible' }}
        aria-label="Open calculator"
        aria-hidden={tabHidden}
        tabIndex={tabHidden ? -1 : 0}
        onClick={openCalculator}
      >
        <ArrowIcon />
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <CalculatorPanel
            open={open}
            onClose={() => setOpen(false)}
            originRect={origin}
            onExited={() => setTabHidden(false)}
          />
        </Suspense>
      )}
    </>
  );
}
