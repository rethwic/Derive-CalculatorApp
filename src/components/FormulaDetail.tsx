import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FormulaBox } from './FormulaBox';
import { FormulaBoxWithCalculator } from './FormulaBoxWithCalculator';
import { VariantPicker } from './VariantPicker';
import type { Formula, Variable } from '../types';
import { categoryMap } from '../data/categories';
import { formulas } from '../data/formulas';

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

interface FormulaDetailProps {
  formula: Formula;
  originRect: DOMRect | null;
  // Calc-var values a smart search already parsed out of a sentence, so
  // the calculator below opens with those filled in instead of blank.
  // Only ever meant for the formula's own top-level `calc` — a variant
  // card (picked after the fact via the dropdown) always opens blank.
  prefill?: Record<string, number>;
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

export function FormulaDetail({ formula, originRect, prefill, onClose, onJump }: FormulaDetailProps) {
  const [target] = useState(panelTarget);
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
  const [variantIndex, setVariantIndex] = useState(0);
  useEffect(() => {
    setVariantIndex(0);
  }, [formula.id]);
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

  const relatedFormulas = useMemo(
    () => (formula.related ?? []).map((id) => formulas.find((f) => f.id === id)).filter(Boolean),
    [formula.related],
  );

  return (
    <div className="detail-scrim" onClick={onClose}>
      <motion.div
        ref={panelRef}
        className="detail-panel glass"
        initial={initial}
        animate={{ ...target, opacity: 1 }}
        exit={exit}
        transition={{ type: 'spring', damping: 28, stiffness: 260, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="detail-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <span className="detail-category">{cat.name}</span>
        <h2 className="detail-title">{formula.title}</h2>

        {formula.variants && formula.variants.length > 0 && activeVariant ? (
          <>
            <VariantPicker variants={formula.variants} index={variantIndex} onChange={setVariantIndex} />

            {activeVariant.calc ? (
              <FormulaBoxWithCalculator
                key={`calc-${formula.id}-${activeVariant.label}`}
                latex={activeVariant.latex}
                calc={activeVariant.calc}
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
