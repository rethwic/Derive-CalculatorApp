import { evaluate as mjsEvaluate, parse as mjsParse } from 'mathjs/number';
import type { MathNode } from 'mathjs/number';

// The lighter "number" build of mathjs (plain JS numbers only, no
// BigNumber/Fraction/Complex/Matrix machinery) is enough for a calculator
// that only ever plots real-valued functions, and keeps the bundle much
// smaller than the full library.

export interface PlotDef {
  /** The free variable name this curve is sampled over, e.g. "x" for
   *  "y = x^2" but "t" for "f(t) = sin(t)". */
  paramName: string;
  // Takes the current scope explicitly (rather than closing over it) so a
  // slider's live value is picked up on every sample without recompiling
  // the expression on every drag tick.
  evaluate: (paramValue: number, scope: Record<string, number>) => number;
}

export type RowResult =
  | { kind: 'empty' }
  | { kind: 'value'; value: number }
  | { kind: 'definition'; name: string; value: number }
  | { kind: 'vertical'; x: number }
  | { kind: 'plot'; plot: PlotDef }
  | { kind: 'point'; x: number; y: number }
  | { kind: 'needs-sliders'; variables: string[] }
  | { kind: 'error'; message: string };

const FUNCTION_DEF_RE = /^([a-zA-Z][a-zA-Z0-9]*)\s*\(\s*([a-zA-Z][a-zA-Z0-9]*)\s*\)\s*=\s*(.+)$/;
const DEFINITION_RE = /^([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(.+)$/;

// Splits "a, b" into ["a", "b"] on the first comma that isn't nested inside
// its own parentheses — so "1+2, 3*4" splits correctly, and a coordinate
// whose own component happens to contain a function call like "(sin(1),2)"
// doesn't get cut at the comma inside "sin(1)".
function splitTopLevelPair(inner: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) return [inner.slice(0, i), inner.slice(i + 1)];
  }
  return null;
}

// Named constants mathjs recognizes out of the box — referencing these
// isn't "an undefined variable", so they never trigger a slider suggestion.
const RESERVED_SYMBOLS = new Set([
  'e',
  'pi',
  'i',
  'tau',
  'phi',
  'Infinity',
  'NaN',
  'true',
  'false',
  'null',
  'undefined',
  'LN2',
  'LN10',
  'LOG2E',
  'LOG10E',
  'SQRT1_2',
  'SQRT2',
]);

// "x" and "y" have fixed meaning throughout the calculator — the swept
// input and the plotted output — regardless of what's being classified.
// "x" already happens to dodge slider suggestions whenever it's the
// current paramName (the common case), but that's only incidental: it
// still isn't excluded when it turns up somewhere else (a custom
// function's body referencing "x" while its own parameter is named
// something else) or in "y"'s case at all, since "y" is never anyone's
// paramName — a bare "y" typed on its own was being offered a slider for
// "y" itself, which makes no sense for the reserved output axis.
const AXIS_SYMBOLS = new Set(['x', 'y']);

// Trig functions — also exported so MathInput can auto-insert "()" the
// moment one is finished typing (otherwise "sin" typed without a paren yet
// is just a bare undefined symbol to mathjs, and gets offered as a slider).
export const TRIG_FUNCTION_NAMES = [
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan', 'atan2', 'asec', 'acsc', 'acot',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
];

// Root functions get their own radical *symbol* in MathInput rather than
// auto-inserted parens, so they're tracked separately.
export const ROOT_FUNCTION_NAMES = ['sqrt', 'cbrt', 'nthRoot', 'nthroot'];

// Everything else worth auto-parenthesizing the same way as the trig
// functions above.
export const OTHER_FUNCTION_NAMES = [
  'exp', 'log', 'log2', 'log10', 'log1p', 'abs', 'sign', 'ceil', 'floor', 'round', 'trunc',
  'min', 'max', 'pow', 'mod', 'gcd', 'lcm', 'factorial', 'gamma', 'random', 'hypot', 'mean', 'median',
];

const CONSTANT_NAMES = ['pi', 'tau', 'phi', 'Infinity', 'NaN', 'true', 'false'];

// Multi-letter names left as a single token instead of being split into
// individual-letter multiplication — mathjs's built-in functions plus the
// named constants a basic calculator is likely to reference.
const KNOWN_MULTI_LETTER_NAMES = new Set([
  ...TRIG_FUNCTION_NAMES,
  ...ROOT_FUNCTION_NAMES,
  ...OTHER_FUNCTION_NAMES,
  ...CONSTANT_NAMES,
]);

// The trig functions where "the number I typed" is ambiguous between
// degrees and radians — sin/cos/tan and their reciprocals share the exact
// same issue.
const DEGREE_AWARE_TRIG = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot'];

const LONGEST_KNOWN_NAME = Math.max(...Array.from(KNOWN_MULTI_LETTER_NAMES, (name) => name.length));

// mathjs's parser treats a run of letters as one identifier — "dfgx" is a
// single symbol named "dfgx" to it. This calculator instead follows the
// usual math-notebook convention (and Desmos' own): adjacent single-letter
// variables multiply, so "dfgx" means d*f*g*x and offers four separate
// sliders rather than one variable confusingly named "dfgx".
//
// The same is true for a letter directly followed by digits — mathjs
// treats "d1" as one identifier too, exactly like "dfgx", so it got the
// same "d1" combined-slider treatment. This matches it against the run
// itself (not just [a-zA-Z]+): "d1" reads as "d*1" (the variable "d" times
// the plain number 1), "d12" as "d*12", and "x2" as "x*2" — which, now
// that "x" splits out on its own, correctly stops needing a slider at all
// once the reserved axis check below excludes it, rather than offering
// one for the meaningless combined name "x2".
//
// Recognized names are kept intact, and — since editing can leave one
// bumped up against other letters with no operator between (e.g. "sind" if
// "d" gets typed right after an abandoned, un-parenthesized "sin") —
// they're also recognized as a prefix within a longer run: "sind" reads as
// "sin*d", not as four unrelated single-letter variables. This prefix
// search runs before the digit fallback so a known name that itself
// contains digits (log2, log10, log1p, atan2) still matches as one piece
// even glued against other letters, e.g. "dlog2" reads as "d*log2".
function expandImplicitMultiplication(body: string): string {
  return body.replace(/[a-zA-Z][a-zA-Z0-9]*/g, (run, offset: number, full: string) => {
    if (run.length === 1 || KNOWN_MULTI_LETTER_NAMES.has(run)) return run;

    // "1e5", "2.5e10": mathjs's own scientific-notation syntax, not an
    // identifier — a bare "e" directly gluing digits together only reads
    // this way when a digit precedes it too (a bare leading "e5" with
    // nothing before it has no number to be the exponent of, and is
    // exactly the "letter+digits" case this function otherwise splits).
    if (/^[eE][0-9]+$/.test(run) && offset > 0 && /[0-9]/.test(full[offset - 1])) return run;

    const tokens: string[] = [];
    let i = 0;
    while (i < run.length) {
      let matched = false;
      for (let len = Math.min(LONGEST_KNOWN_NAME, run.length - i); len >= 2; len--) {
        const candidate = run.slice(i, i + len);
        if (KNOWN_MULTI_LETTER_NAMES.has(candidate)) {
          tokens.push(candidate);
          i += len;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if (/[0-9]/.test(run[i])) {
        let j = i + 1;
        while (j < run.length && /[0-9]/.test(run[j])) j += 1;
        tokens.push(run.slice(i, j));
        i = j;
      } else {
        tokens.push(run[i]);
        i += 1;
      }
    }
    return tokens.join('*');
  });
}

// mathjs's trig functions (like JS's Math.sin) always take radians. A
// calculator has no explicit degree/radian mode toggle, so this infers it
// per call instead: an argument that itself mentions pi/tau is clearly
// already in radians and is left alone; anything else — a plain number, a
// slider, an arbitrary expression — is assumed to be degrees and converted.
// Written as a small hand-rolled scanner (rather than an AST transform) so
// it can run on the raw text before implicit-multiplication expansion.
//
// The one other case treated as "already radians": the argument mentions
// the variable being swept over a plot (paramName, e.g. "x" in "y=sin(x)"
// or "t" in "f(t)=sin(t)"). Graphing conventions — Desmos included — always
// read a plotted trig curve in radians; converting degrees only makes sense
// for a literal angle like "sin(90)", not for a continuously-varying curve
// argument, where treating "x" as degrees would squash the entire wave into
// a barely-visible sliver over any normal graphing range.
function applyDegreeMode(body: string, paramName?: string): string {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const nameMatch = DEGREE_AWARE_TRIG.find((name) => body.startsWith(name, i));
    const prevChar = i > 0 ? body[i - 1] : '';
    if (!nameMatch || /[a-zA-Z0-9_]/.test(prevChar)) {
      out += body[i];
      i += 1;
      continue;
    }
    let j = i + nameMatch.length;
    while (j < body.length && /\s/.test(body[j])) j += 1;
    if (body[j] !== '(') {
      out += body[i];
      i += 1;
      continue;
    }
    let depth = 1;
    let k = j + 1;
    while (k < body.length && depth > 0) {
      if (body[k] === '(') depth += 1;
      else if (body[k] === ')') depth -= 1;
      k += 1;
    }
    if (depth !== 0) {
      out += body[i];
      i += 1;
      continue;
    }
    const arg = body.slice(j + 1, k - 1);
    const mentionsParam = paramName !== undefined && new RegExp(`\\b${paramName}\\b`).test(arg);
    const isRadians = /\bpi\b|\btau\b|π/.test(arg) || mentionsParam;
    const processedArg = applyDegreeMode(arg, paramName);
    out += isRadians ? `${nameMatch}(${processedArg})` : `${nameMatch}((${processedArg})*pi/180)`;
    i = k;
  }
  return out;
}

// A single pass applied to every expression before it reaches mathjs:
// normalize the lowercase "nthroot" spelling some might type to mathjs's
// own "nthRoot", resolve degrees vs. radians for trig calls, then expand
// any remaining multi-letter runs into implicit multiplication. `paramName`
// is only passed by the plotting path (compilePlot) — plain constant
// evaluation has no swept variable, so degree mode always applies there.
function preprocessExpression(body: string, paramName?: string): string {
  const normalized = body.replace(/\bnthroot\b/g, 'nthRoot');
  const expanded = expandImplicitMultiplication(applyDegreeMode(normalized, paramName));
  // "trunc" is the name people actually reach for (Math.trunc, most other
  // languages), but mathjs's own truncate-toward-zero function is called
  // "fix" — the rename has to happen last, after implicit-multiplication
  // expansion above: "fix" isn't itself in KNOWN_MULTI_LETTER_NAMES, so
  // renaming any earlier would leave the *result* looking like an
  // unrecognized name and get it shredded right back into "f*i*x".
  return expanded.replace(/\btrunc\b/g, 'fix');
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function evaluateConstant(body: string, scope: Record<string, number>): number | null {
  try {
    return safeNumber(mjsEvaluate(preprocessExpression(body), { ...scope }));
  } catch {
    return null;
  }
}

// Every symbol the expression references that isn't a function name (the
// "sin" in "sin(x)"), the plotting variable itself, a built-in constant, or
// already defined by an earlier row — i.e. exactly the set Desmos offers to
// turn into sliders for you.
//
// The `functionNames` set only catches a name used as an actual call —
// "sin" in "sin(x)". A name used bare, with no parens, is just a
// SymbolNode as far as mathjs is concerned, so "sin" in "sin*d" (reachable
// by typing "sin", backspacing its auto-inserted "()", then typing "d"
// right after it) wouldn't be caught that way and would get offered as a
// slider — a nonsensical name for one. KNOWN_MULTI_LETTER_NAMES excludes
// every function/constant name this calculator recognizes regardless of
// whether it's actually being called, closing that gap.
function findFreeVariables(node: MathNode, paramName: string, scope: Record<string, number>): string[] {
  const functionNames = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type === 'FunctionNode') {
      const fn = (n as unknown as { fn?: { name?: string } }).fn;
      if (fn?.name) functionNames.add(fn.name);
    }
  });
  const found = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type !== 'SymbolNode') return;
    const name = (n as unknown as { name: string }).name;
    if (
      functionNames.has(name) ||
      name === paramName ||
      RESERVED_SYMBOLS.has(name) ||
      AXIS_SYMBOLS.has(name) ||
      KNOWN_MULTI_LETTER_NAMES.has(name) ||
      name in scope
    )
      return;
    found.add(name);
  });
  return Array.from(found);
}

// True if the parsed expression references `name` as an actual variable
// (not as some function's own name, e.g. the "x" in a hypothetical
// function called "x(...)" wouldn't count — though nothing in this
// calculator defines functions that way).
function containsVariable(node: MathNode, name: string): boolean {
  const functionNames = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type === 'FunctionNode') {
      const fn = (n as unknown as { fn?: { name?: string } }).fn;
      if (fn?.name) functionNames.add(fn.name);
    }
  });
  let found = false;
  node.traverse((n: MathNode) => {
    if (n.type !== 'SymbolNode') return;
    const symName = (n as unknown as { name: string }).name;
    if (symName === name && !functionNames.has(symName)) found = true;
  });
  return found;
}

// A bare/definition expression that doesn't reference the plotting
// variable at all was never meant to become a curve — if it also failed
// to evaluate to a real number (sqrt(-1), log(-1), asin(2), 1/0, 0/0, ...),
// that's a genuine math error, not a flat invisible line, so it should say
// so instead of silently falling through to compilePlot.
function checkUndefinedConstant(body: string, scope: Record<string, number>): RowResult | null {
  try {
    const parsed = mjsParse(preprocessExpression(body));
    if (containsVariable(parsed, 'x')) return null;
    if (findFreeVariables(parsed, 'x', scope).length > 0) return null;
    return { kind: 'error', message: 'Undefined (not a real number)' };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Invalid expression' };
  }
}

function compilePlot(paramName: string, body: string, scope: Record<string, number>): RowResult {
  try {
    const parsed = mjsParse(preprocessExpression(body, paramName));
    const freeVariables = findFreeVariables(parsed, paramName, scope);
    if (freeVariables.length > 0) return { kind: 'needs-sliders', variables: freeVariables };

    const code = parsed.compile();
    return {
      kind: 'plot',
      plot: {
        paramName,
        evaluate: (paramValue: number, evalScope: Record<string, number>) => {
          try {
            const result = code.evaluate({ ...evalScope, [paramName]: paramValue });
            return typeof result === 'number' ? result : NaN;
          } catch {
            return NaN;
          }
        },
      },
    };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Invalid expression' };
  }
}

/**
 * Classifies one calculator row given the constants defined by rows above
 * it. Mirrors Desmos' own conventions closely enough to feel familiar:
 *  - "a = 3"        a slider-able constant, usable by later rows/plots
 *  - "x = 3"        a vertical line
 *  - "y = ..."      always plotted, even if the body happens to be a
 *                    constant (so "y = 5" draws a horizontal line, not a
 *                    scope entry named "y")
 *  - "f(t) = ..."   plotted, sampled over "t" instead of "x"
 *  - "2 + 2", "sqrt(16)", "5!", "sin(pi/4)", ...
 *                    plain arithmetic — evaluated straight to a number
 *                    (a normal calculator's whole job) rather than force-
 *                    plotted as a meaningless flat line
 *  - anything else  plotted as y = <expression>, or — if it parses as
 *                    "name = expression" but expression isn't a pure
 *                    constant — plotted as a named curve (e.g. "a = x^2"
 *                    behaves just like "y = x^2")
 */
export function classifyRow(text: string, scope: Record<string, number>): RowResult {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };

  // A coordinate typed as "(x, y)" — plain parens-and-comma syntax mathjs
  // itself has no notion of, so this has to be recognized before anything
  // reaches mjsParse/mjsEvaluate at all, not treated as a parse error.
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const pair = splitTopLevelPair(trimmed.slice(1, -1));
    if (pair) {
      const x = evaluateConstant(pair[0].trim(), scope);
      const y = evaluateConstant(pair[1].trim(), scope);
      if (x !== null && y !== null) return { kind: 'point', x, y };
    }
  }

  const funcMatch = trimmed.match(FUNCTION_DEF_RE);
  if (funcMatch) {
    const [, , paramName, body] = funcMatch;
    return compilePlot(paramName, body, scope);
  }

  const defMatch = trimmed.match(DEFINITION_RE);
  if (defMatch) {
    const [, name, body] = defMatch;
    if (name === 'x') {
      const value = evaluateConstant(body, scope);
      if (value !== null) return { kind: 'vertical', x: value };
      try {
        const freeVariables = findFreeVariables(mjsParse(preprocessExpression(body)), 'x', scope);
        if (freeVariables.length > 0) return { kind: 'needs-sliders', variables: freeVariables };
      } catch {
        // fall through to the generic error below
      }
      return { kind: 'error', message: 'Invalid expression' };
    }
    if (name !== 'y') {
      const value = evaluateConstant(body, scope);
      if (value !== null) return { kind: 'definition', name, value };
      const undefinedResult = checkUndefinedConstant(body, scope);
      if (undefinedResult) return undefinedResult;
    }
    return compilePlot('x', body, scope);
  }

  // No "name =" prefix — a bare expression. If it stands on its own as a
  // number (doesn't reference x), it's ordinary arithmetic: just evaluate
  // it. Only fall back to plotting a curve once it actually depends on x.
  const value = evaluateConstant(trimmed, scope);
  if (value !== null) return { kind: 'value', value };
  const undefinedResult = checkUndefinedConstant(trimmed, scope);
  if (undefinedResult) return undefinedResult;
  return compilePlot('x', trimmed, scope);
}

// A categorical palette for telling multiple plotted curves apart —
// distinct from the site's single-accent brand color, which is for UI
// chrome rather than for encoding data series.
export const PLOT_COLORS = ['#2d70b3', '#c74440', '#388c46', '#6042a6', '#fa7e19', '#0f9e91', '#e0499a', '#000000'];

export function colorForIndex(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length];
}
