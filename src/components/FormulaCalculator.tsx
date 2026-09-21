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

export interface CalculatorState {
  values: Record<string, string>;
  onChange: (key: string, raw: string) => void;
  onReset: () => void;
  solved: { key: string; value: number } | null;
}

// Owns everything about a calculator's live state — the field values, and
// the solve-for-the-one-blank-field computation — independent of how it's
// rendered. Pulled out of the component itself so FormulaDetail can also
// read `solved`/`values` to show the same numbers substituted into the
// formula box above, without a second, separately-typed copy of this
// state drifting out of sync with what the calculator grid shows.
export function useCalculatorState(calc: FormulaCalc, initialValues?: Record<string, number>): CalculatorState {
  const [values, setValues] = useState<Record<string, string>>(() => initialCalcValues(calc, initialValues));

  const solved = useMemo(() => {
    const blankKeys = calc.vars.filter((v) => (values[v.key] ?? '').trim() === '').map((v) => v.key);
    if (blankKeys.length !== 1) return null;
    const unknownKey = blankKeys[0];
    const known: Record<string, number> = {};
    for (const v of calc.vars) {
      if (v.key === unknownKey) continue;
      const raw = values[v.key] ?? '';
      const num = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(num)) return null;
      known[v.key] = num;
    }
    const result = solveForUnknown(calc.residual, known, unknownKey);
    if (result === null) return null;
    return { key: unknownKey, value: result };
  }, [calc, values]);

  function onChange(key: string, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw }));
  }

  function onReset() {
    setValues(initialCalcValues(calc, initialValues));
  }

  return { values, onChange, onReset, solved };
}

// Mount this with a `key` unique to the formula/variant it belongs to (via
// whatever owns the `state` passed in) — a fresh key remounts with clean
// state instead of carrying over another formula's leftover input values.
export function FormulaCalculator({ calc, state }: { calc: FormulaCalc; state: CalculatorState }) {
  const { values, onChange, onReset, solved } = state;

  return (
    <div className="detail-section">
      <div className="calc-header">
        <h3>Calculator</h3>
        <button type="button" className="calc-reset" onClick={onReset}>
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
                value={isSolved ? formatSolved(solved.value) : values[v.key] ?? ''}
                placeholder="—"
                readOnly={isSolved}
                onChange={(e) => onChange(v.key, e.target.value)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
