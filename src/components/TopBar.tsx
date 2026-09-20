import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CalculatorIcon } from './CalculatorIcon';
import { DynamicIsland } from './DynamicIsland';

// Deferred: pulls in mathjs, which is otherwise unused by everyone who
// never opens the calculator — no reason to make that part of the initial
// page load, on any page.
const CalculatorPanel = lazy(() => import('./CalculatorPanel').then((m) => ({ default: m.CalculatorPanel })));

// Mounted once at the app root (see App.tsx) rather than inside any one
// page, so the clock, the calculator button, and the calculator's own state
// are the same across every route instead of resetting on navigation. The
// island and the button sit side by side, centered as a group.
export function TopBar() {
  const [open, setOpen] = useState(false);
  // Once true, the panel component stays mounted (even while visually
  // closed) so its expression list survives being closed and reopened —
  // it's gated on first-open purely to defer the lazy import.
  const [loaded, setLoaded] = useState(false);
  // Separate from `open`: stays true for the whole time the panel is on
  // screen, including its shrink-back animation. The button turns white and
  // stays put underneath, so the panel grows out of a white circle and shrinks
  // back into it, and only then does the button fade back to black.
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The button never unmounts, so its rect can be re-measured if the window
  // changes size while the calculator is open — the panel shrinks back into
  // wherever the button really is by then.
  useEffect(() => {
    if (!open) return;
    function measure() {
      if (buttonRef.current) setOrigin(buttonRef.current.getBoundingClientRect());
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  function openCalculator() {
    if (buttonRef.current) setOrigin(buttonRef.current.getBoundingClientRect());
    setActive(true);
    setLoaded(true);
    setOpen(true);
  }

  return (
    <>
      <div className="top-bar">
        <DynamicIsland />
        {/* Same pop-in from above as the island, a beat later. It's a wrapper
            that animates so the button's own hover transform is untouched. */}
        <motion.div
          className="top-bar-button-slot"
          initial={{ y: -24, opacity: 0, scale: 0.6 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260, delay: 0.08 }}
        >
          <button
            ref={buttonRef}
            type="button"
            className={`calculator-pull-tab${active ? ' calculator-pull-tab-active' : ''}`}
            aria-label="Open calculator"
            aria-hidden={active}
            tabIndex={active ? -1 : 0}
            onClick={openCalculator}
          >
            <CalculatorIcon />
          </button>
        </motion.div>
      </div>
      {loaded && (
        <Suspense fallback={null}>
          <CalculatorPanel
            open={open}
            onClose={() => setOpen(false)}
            originRect={origin}
            onExited={() => setActive(false)}
          />
        </Suspense>
      )}
    </>
  );
}
