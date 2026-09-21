// Solves residual(values) = 0 for a single unknown key, holding every other
// key at its known value. We use numeric Newton-Raphson (with a numerical
// derivative) instead of per-formula symbolic algebra: every formula only
// needs one "LHS - RHS" residual function, and the same solver then inverts
// it for whichever variable the user leaves blank, regardless of which side
// of the equation that variable started on.

const GUESSES = [1, 10, 0.1, -1, -10, 100, 0.001, 5, -5, 50, 1000, -0.1];

function newtonRaphson(
  residual: (values: Record<string, number>) => number,
  known: Record<string, number>,
  unknownKey: string,
  initialGuess: number,
  maxIter = 100,
  tol = 1e-9,
): number | null {
  let x = initialGuess;
  for (let i = 0; i < maxIter; i++) {
    const fx = residual({ ...known, [unknownKey]: x });
    if (!Number.isFinite(fx)) return null;

    // Scaled by |fx| as well as |x| — mass-energy equivalence (E = mc²)
    // starts the unknown E at a guess like 1 while the residual is already
    // off by ~5e17 (dominated by c² alone), so a step sized only off of
    // |x| perturbs E by a fraction of a unit that a subtraction against a
    // 5e17-magnitude term can't register at all (it's smaller than that
    // magnitude's own floating-point precision floor). fPlus and fMinus
    // then round to the identical double, the derivative estimate comes
    // out exactly zero, and Newton's method never gets to take its first
    // step. Sizing h off |fx| too keeps the probe big enough to survive
    // that rounding even before x has grown anywhere near its target.
    const h = Math.max(1e-6, Math.abs(x) * 1e-6, Math.abs(fx) * 1e-9);
    const fPlus = residual({ ...known, [unknownKey]: x + h });
    const fMinus = residual({ ...known, [unknownKey]: x - h });
    const derivative = (fPlus - fMinus) / (2 * h);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) return null;

    const nextX = x - fx / derivative;
    if (!Number.isFinite(nextX)) return null;
    // Relative, not absolute: mass-energy equivalence alone puts the
    // answer around 1e17 (E = mc², c² ≈ 9e16), where floating-point
    // precision can't land a step within an absolute 1e-9 of the true
    // root even once truly converged — the fixed-size step check would
    // burn through every iteration and return null despite x already
    // being correct to fifteen-odd significant digits.
    if (Math.abs(nextX - x) < tol * Math.max(1, Math.abs(x))) return nextX;
    x = nextX;
  }
  return null;
}

export function solveForUnknown(
  residual: (values: Record<string, number>) => number,
  known: Record<string, number>,
  unknownKey: string,
): number | null {
  for (const guess of GUESSES) {
    const result = newtonRaphson(residual, known, unknownKey, guess);
    if (result !== null && Number.isFinite(result)) {
      const check = residual({ ...known, [unknownKey]: result });
      // Same reasoning as above: the residual's own natural scale tracks
      // the magnitude of the numbers actually in play, not a fixed unit —
      // a "perfect" answer at the 1e17 scale still leaves a residual of
      // tens just from float rounding, which a flat 1e-6 would reject.
      const scale = Math.max(1, Math.abs(result), ...Object.values(known).map(Math.abs));
      if (Math.abs(check) < 1e-6 * scale) return result;
    }
  }
  return null;
}
