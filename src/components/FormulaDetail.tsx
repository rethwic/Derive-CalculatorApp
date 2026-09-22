import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FormulaBox } from './FormulaBox';
import { FormulaBoxWithCalculator } from './FormulaBoxWithCalculator';
import { VariantPicker } from './VariantPicker';
import type { Formula, FormulaAbout, Variable } from '../types';
import { categoryMap } from '../data/categories';
import { formulas } from '../data/formulas';
import { formulaAbout } from '../data/about';
import { showStatus } from '../lib/islandStatus';
import { copyText } from '../lib/clipboard';

function VariablesList({ variables }: { variables: Variable[] }) {
  if (variables.length === 0) return null;
  return (
    <div className="detail-section">
      <h3>Variables</h3>
      <ul className="detail-variables">
        {variables.map((v) => (
          <li key={v.symbol}>
            <span className="var-symbol">{v.symbol}</span>
            <span className="var-meaning">{v.meaning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The "About this formula" disclosure: what it's for is always shown above;
// this holds when to reach for it, the traps, and a worked line.
function AboutSection({ about, resetKey }: { about: FormulaAbout; resetKey: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [resetKey]);
  return (
    <div className="detail-section detail-about">
      <button
        type="button"
        className="detail-about-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>About this formula</span>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={open ? 'detail-about-chevron-open' : undefined}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="detail-about-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="detail-about-inner">
              <h4>Use it when</h4>
              <ul>
                {about.when.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h4>Watch out for</h4>
              <ul>
                {about.watch.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {about.notThis && (
                <>
                  <h4>Or maybe not</h4>
                  <p>{about.notThis}</p>
                </>
              )}
              {about.example && (
                <>
                  <h4>Example</h4>
                  <p className="detail-about-example">{about.example}</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FormulaDetailProps {
  formula: Formula;
  originRect: DOMRect | null;
  // Calc-var values a smart search already parsed out of a sentence, so
  // the calculator below opens with those filled in instead of blank.
  // Only ever meant for the formula's own top-level `calc` — a variant
  // card (picked after the fact via the dropdown) always opens blank.
  prefill?: Record<string, number>;
  // Which shape of a multi-shape card to open on; `prefill` then applies to
  // that shape rather than the card's (nonexistent) top-level calculator.
  initialVariantIndex?: number;
  onClose: () => void;
  onJump: (formula: Formula) => void;
}

function panelTarget() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(560, vw - 48);
  const height = Math.min(640, vh - 64);
  return {
    left: (vw - width) / 2,
    top: (vh - height) / 2,
    width,
    height,
    borderRadius: 32,
  };
}

export function FormulaDetail({
  formula,
  originRect,
  prefill,
  initialVariantIndex,
  onClose,
  onJump,
}: FormulaDetailProps) {
  const [target] = useState(panelTarget);

  // While a formula is open, the top bar rises above its blurred backdrop so
  // the island's messages ("LaTeX copied") stay readable (see index.css).
  useEffect(() => {
    document.documentElement.dataset.detailOpen = 'true';
    return () => {
      delete document.documentElement.dataset.detailOpen;
    };
  }, []);
  const cat = categoryMap[formula.category];
  const panelRef = useRef<HTMLDivElement>(null);

  // Jumping between related formulas re-renders this same panel instance in
  // place (no remount, no exit/enter transition) — so without this, jumping
  // away while scrolled down on a tall (calculator-equipped) formula would
  // land the next formula's content at that same stale scroll offset.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [formula.id]);

  // For a multi-shape card (e.g. "Area Formulas"), only one variant is shown
  // at a time via the dropdown below, picked by index — reset back to the
  // first shape whenever the panel switches to a different formula card.
  const [variantIndex, setVariantIndex] = useState(initialVariantIndex ?? 0);
  useEffect(() => {
    setVariantIndex(initialVariantIndex ?? 0);
  }, [formula.id, initialVariantIndex]);
  const activeVariant = formula.variants?.[variantIndex];

  const initial = originRect
    ? {
        left: originRect.left,
        top: originRect.top,
        width: originRect.width,
        height: originRect.height,
        borderRadius: originRect.width / 2,
        opacity: 1,
      }
    : { ...target, opacity: 0 };

  const exit = originRect
    ? {
        left: originRect.left,
        top: originRect.top,
        width: originRect.width,
        height: originRect.height,
        borderRadius: originRect.width / 2,
        opacity: 0,
      }
    : { ...target, opacity: 0 };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const about = formulaAbout[formula.id];

  const relatedFormulas = useMemo(
    () => (formula.related ?? []).map((id) => formulas.find((f) => f.id === id)).filter(Boolean),
    [formula.related],
  );

  return (
    <div className="detail-scrim" onClick={onClose}>
      <motion.div
        ref={panelRef}
        className="detail-panel"
        initial={initial}
        animate={{ ...target, opacity: 1 }}
        exit={exit}
        transition={{ type: 'spring', damping: 28, stiffness: 260, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="detail-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <button
          type="button"
          className="detail-copy"
          aria-label="Copy LaTeX"
          title="Copy LaTeX"
          onClick={async () => {
            const copied = await copyText(activeVariant?.latex ?? formula.latex);
            if (copied) showStatus('LaTeX copied', 'copy');
            else showStatus("Couldn't copy", 'info');
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V6.5A2.5 2.5 0 017.5 4H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="detail-category">{cat.name}</span>
        <h2 className="detail-title">{formula.title}</h2>
        {about && <p className="detail-purpose">{about.purpose}</p>}

        {formula.variants && formula.variants.length > 0 && activeVariant ? (
          <>
            <VariantPicker variants={formula.variants} index={variantIndex} onChange={setVariantIndex} />

            {activeVariant.calc ? (
              <FormulaBoxWithCalculator
                key={`calc-${formula.id}-${activeVariant.label}`}
                latex={activeVariant.latex}
                calc={activeVariant.calc}
                initialValues={variantIndex === initialVariantIndex ? prefill : undefined}
              >
                <VariablesList variables={activeVariant.variables} />
              </FormulaBoxWithCalculator>
            ) : (
              <>
                <FormulaBox key={`box-${formula.id}-${activeVariant.label}`} latex={activeVariant.latex} />
                <VariablesList variables={activeVariant.variables} />
              </>
            )}
          </>
        ) : (
          <>
            {formula.calc ? (
              <FormulaBoxWithCalculator
                key={`calc-${formula.id}`}
                latex={formula.latex}
                calc={formula.calc}
                initialValues={prefill}
              >
                <VariablesList variables={formula.variables} />
              </FormulaBoxWithCalculator>
            ) : (
              <>
                <FormulaBox key={`box-${formula.id}`} latex={formula.latex} />
                <VariablesList variables={formula.variables} />
              </>
            )}
          </>
        )}

        {about && <AboutSection about={about} resetKey={formula.id} />}

        {relatedFormulas.length > 0 && (
          <div className="detail-section">
            <h3>Related formulas</h3>
            <div className="detail-related">
              {relatedFormulas.map((f) => {
                if (!f) return null;
                return (
                  <button key={f.id} type="button" className="related-chip" onClick={() => onJump(f)}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
