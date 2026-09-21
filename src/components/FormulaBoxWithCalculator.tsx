import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Katex } from './Katex';
import { FormulaBox } from './FormulaBox';
import { FormulaCalculator, useCalculatorState } from './FormulaCalculator';
import { substituteLatex, symbolToLatex, formatSubstituted, rearrangeForTarget } from '../lib/latexSubstitute';
import type { FormulaCalc } from '../types';

interface FormulaBoxWithCalculatorProps {
  latex: string;
  calc: FormulaCalc;
  initialValues?: Record<string, number>;
  // Content (FormulaDetail's Variables list) rendered between the worked
  // formula and the calculator grid — kept as a slot rather than hard-coded
  // here since WorkspaceCard's compact pinned-card view uses this same
  // component with nothing in between.
  children?: ReactNode;
}

// Bundles the static formula box together with the calculator that solves
// it, because showing the worked substitution requires both at once: the
// calculator already knows which field is blank and what the rest evaluate
// to (via useCalculatorState), and that same state is what turns the plain
// formula above it into "numbers plugged in" — a plain <FormulaBox> alone
// has nothing to substitute, and the calculator alone had nowhere to show
// the substituted line before this component gave them one shared state.
export function FormulaBoxWithCalculator({ latex, calc, initialValues, children }: FormulaBoxWithCalculatorProps) {
  const state = useCalculatorState(calc, initialValues);

  // Only the *other* variables ever have numbers to substitute — the
  // solved one stays as its own symbol in the "plugged in" line, exactly
  // like it would if you'd worked it out by hand, with the actual value
  // held back for a separate final line right below.
  //
  // When the target isn't already alone on one side of the formula (e.g.
  // solving Newton's second law for m rather than F), rearrangeForTarget
  // first moves it there algebraically — "to the other side of the
  // equation" — so the substituted line shown is the same one you'd get
  // solving it by hand, not the original equation with a variable still
  // tangled into both sides. If it can't confidently rearrange (or the
  // target is already isolated), this falls back to substituting straight
  // into the original latex, which is correct for the already-isolated case.
  const work = useMemo(() => {
    const solved = state.solved;
    if (!solved) return null;
    const target = calc.vars.find((v) => v.key === solved.key);
    if (!target) return null;
    const entries = calc.vars
      .filter((v) => v.key !== solved.key)
      .map((v) => ({ symbol: v.symbol, value: Number(state.values[v.key]) }))
      .filter((e) => Number.isFinite(e.value));

    const allSymbols = calc.vars.map((v) => v.symbol);
    const rearranged = rearrangeForTarget(latex, target.symbol, allSymbols);
    const equationToSubstitute = rearranged ?? latex;

    return {
      substituted: substituteLatex(equationToSubstitute, entries),
      answer: `${symbolToLatex(target.symbol)} = ${formatSubstituted(solved.value)}`,
    };
  }, [latex, calc.vars, state.values, state.solved]);

  return (
    <>
      <FormulaBox latex={latex}>
        {work && (
          <div className="detail-formula-work">
            <Katex math={work.substituted} block />
            <Katex math={work.answer} block />
          </div>
        )}
      </FormulaBox>
      {children}
      <FormulaCalculator calc={calc} state={state} />
    </>
  );
}
