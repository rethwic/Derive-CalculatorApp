import { useMemo, useState } from 'react';
import type { FormulaCalc } from '../types';
import { solveForUnknown } from '../lib/solve';

function initialCalcValues(calc: FormulaCalc, prefill?: Record<string, number>): Record<string, string> {
  const values: Record<string, string> = {};
  calc.vars.forEach((v) => {
    const known = prefill?.[v.key];
    values[v.key] = known !== undefined ? String(known) : v.defaultValue !== undefined ? String(v.defaultValue) : '';
  });
  return values;
}

function formatSolved(n: number): string {
  if (n !== 0 && (Math.abs(n) < 1e-4 || Math.abs(n) >= 1e9)) return n.toExponential(4);
  return String(Number(n.toPrecision(6)));
}

// Mount this with a `key` unique to the formula/variant it belongs to — a
// fresh key remounts it with clean state instead of carrying over another
// formula's leftover input values. `initialValues` pre-fills specific
// fields (calc-var key -> value) — e.g. numbers a smart search already
// parsed out of a sentence — rather than opening every field blank.
export function FormulaCalculator({ calc, initialValues }: { calc: FormulaCalc; initialValues?: Record<string, number> }) {
  const [calcValues, setCalcValues] = useState<Record<string, string>>(() => initialCalcValues(calc, initialValues));

  const solved = useMemo(() => {
    const blankKeys = calc.vars.filter((v) => (calcValues[v.key] ?? '').trim() === '').map((v) => v.key);
    if (blankKeys.length !== 1) return null;
    const unknownKey = blankKeys[0];
    const known: Record<string, number> = {};
    for (const v of calc.vars) {
      if (v.key === unknownKey) continue;
      const raw = calcValues[v.key] ?? '';
      const num = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(num)) return null;
      known[v.key] = num;
    }
    const result = solveForUnknown(calc.residual, known, unknownKey);
    if (result === null) return null;
    return { key: unknownKey, value: result };
  }, [calc, calcValues]);

  function handleChange(key: string, raw: string) {
    setCalcValues((prev) => ({ ...prev, [key]: raw }));
  }

  function handleReset() {
    setCalcValues(initialCalcValues(calc, initialValues));
  }

  return (
    <div className="detail-section">
      <div className="calc-header">
        <h3>Calculator</h3>
        <button type="button" className="calc-reset" onClick={handleReset}>
          Reset
        </button>
      </div>
      <p className="calc-hint">Leave exactly one field blank to solve for it.</p>
      <div className="calc-grid">
        {calc.vars.map((v) => {
          const isSolved = solved?.key === v.key;
          return (
            <label key={v.key} className={`calc-row${isSolved ? ' calc-row-solved' : ''}`}>
              <span className="calc-symbol">{v.symbol}</span>
              <input
                type="text"
                inputMode="decimal"
                className="calc-input"
                value={isSolved ? formatSolved(solved.value) : calcValues[v.key] ?? ''}
                placeholder="—"
                readOnly={isSolved}
                onChange={(e) => handleChange(v.key, e.target.value)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
