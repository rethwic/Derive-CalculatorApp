// Turns a formula's own LaTeX template into a "worked" version with known
// values plugged in — e.g. "x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}" with
// a=1, b=-3, c=2 known becomes "x = \frac{-(-3) \pm \sqrt{(-3)^2-4(1)(2)}}{2(1)}".
// This only ever operates on this app's own formula data, not arbitrary
// LaTeX — it leans on two conventions that hold across every formula here:
// every function/Greek letter is backslash-escaped (\sin, \theta, ...) and
// every bare (non-backslash) letter run is variables written with implicit
// multiplication (4ac, mv, kt), never a second unescaped word. That's what
// makes it safe to treat any backslash-command as one opaque token and any
// bare letter as a candidate variable, without a full LaTeX parser.

const GREEK_TO_LATEX: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  Γ: 'Gamma',
  δ: 'delta',
  Δ: 'Delta',
  ε: 'epsilon',
  θ: 'theta',
  λ: 'lambda',
  μ: 'mu',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  Σ: 'Sigma',
  τ: 'tau',
  φ: 'phi',
  Φ: 'Phi',
  χ: 'chi',
  ψ: 'psi',
  Ψ: 'Psi',
  ω: 'omega',
  Ω: 'Omega',
};

// Unicode subscript digits and the handful of subscript letters this
// dataset actually uses (aₙ, PEₛ, fₛ, Sₙ, ...) — not the full Unicode
// subscript-letter block, just what's needed here.
const SUBSCRIPT_CHAR: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  'ₙ': 'n',
  'ₛ': 's',
};

// A display symbol like "x₀" or "θ" needs translating to however it's
// actually spelled in this formula's LaTeX ("x_0", "\theta") before it can
// be searched for. Exported too, for rendering a plain "symbol ≈ value"
// final line in the same LaTeX spelling as the substituted formula above it.
export function symbolToLatex(symbol: string): string {
  // A descriptive annotation like "C (deg)" or "θ (deg)" names the same
  // variable the LaTeX itself uses ("C", "\theta") — the unit hint is for
  // the Variables list and calculator label, not part of the symbol's own
  // spelling. The mandatory leading space is what tells this apart from a
  // function-value symbol like "f(x)", which has no space before its
  // parenthesis and must be left alone.
  let base = symbol.replace(/ \([a-zA-Z]+\)$/, '');

  // The one vulgar-fraction subscript this dataset uses — "t½" (half-life)
  // is spelled "t_{1/2}" in LaTeX, not a simple single-character subscript
  // like the others below.
  if (base.endsWith('½')) return `${base.slice(0, -1)}_{1/2}`;

  let subscript = '';
  while (base.length > 0 && SUBSCRIPT_CHAR[base[base.length - 1]] !== undefined) {
    subscript = SUBSCRIPT_CHAR[base[base.length - 1]] + subscript;
    base = base.slice(0, -1);
  }
  if (GREEK_TO_LATEX[base]) base = `\\${GREEK_TO_LATEX[base]}`;
  return subscript ? `${base}_${subscript}` : base;
}

export function formatSubstituted(n: number): string {
  if (n !== 0 && (Math.abs(n) < 1e-4 || Math.abs(n) >= 1e9)) return n.toExponential(3);
  return String(Number(n.toPrecision(6)));
}

interface LatexToken {
  token: string;
  value: number;
}

function buildTokens(entries: { symbol: string; value: number }[]): LatexToken[] {
  const tokens: LatexToken[] = [];
  for (const { symbol, value } of entries) {
    tokens.push({ token: symbolToLatex(symbol), value });
    // A handful of symbols (e.g. calc key "Fc" for centripetal force) are
    // written plainly in the variable list but still get a LaTeX subscript
    // in the formula itself ("F_c") — tried as a fallback token alongside
    // the literal one, not instead of it, since most symbols need no such
    // translation at all.
    const compact = symbol.match(/^([A-Za-z])([a-z])$/);
    if (compact) tokens.push({ token: `${compact[1]}_${compact[2]}`, value });
  }
  // Longest token first, so a multi-letter identifier like "KE" is matched
  // whole before its individual letters could be considered separately.
  return tokens.sort((a, b) => b.token.length - a.token.length);
}

// Substitutes every entry's value into `latex`, wrapped in parentheses
// (safe for signs either way — "-(-3)" reads correctly, "-(3)" is just a
// touch more verbose than "-3" would be) — anything not recognized,
// including the still-unknown target variable itself, is left exactly as
// written.
export function substituteLatex(latex: string, entries: { symbol: string; value: number }[]): string {
  if (entries.length === 0) return latex;
  const tokens = buildTokens(entries);

  let out = '';
  let i = 0;
  while (i < latex.length) {
    // LaTeX only auto-groups a single following character for a subscript
    // or superscript ("\log_b" subscripts just "b") — substituting a
    // multi-character "(2)" right after a bare _/^ with nothing braced
    // around it would silently subscript only the "(" and leave "2)" at
    // normal size. Wrapping in {} here is what "\log_b" already implicitly
    // has (a single character needs no braces to begin with), so this only
    // ever adds the grouping a longer replacement newly requires.
    const afterSubOrSup = i > 0 && (latex[i - 1] === '_' || latex[i - 1] === '^');

    if (latex[i] === '\\') {
      // The optional trailing _0 / _{0} matters here: a subscripted Greek
      // variable's token was built as one unit ("\theta_0"), so matching
      // must consume the subscript together with the command name too, or
      // this would only ever isolate the bare "\theta" and never find it.
      const command = latex.slice(i).match(/^\\[a-zA-Z]+(?:_\{?\d+\}?)?/)?.[0];
      if (command) {
        const hit = tokens.find((t) => t.token === command);
        const replacement = hit ? `(${formatSubstituted(hit.value)})` : command;
        out += hit && afterSubOrSup ? `{${replacement}}` : replacement;
        i += command.length;
        continue;
      }
      out += latex[i];
      i += 1;
      continue;
    }

    const hit = tokens.find((t) => latex.startsWith(t.token, i));
    if (hit) {
      const replacement = `(${formatSubstituted(hit.value)})`;
      out += afterSubOrSup ? `{${replacement}}` : replacement;
      i += hit.token.length;
      continue;
    }

    out += latex[i];
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------
// Algebraic rearrangement: "move it to the other side" when the variable
// being solved for isn't already alone on one side of the equation.
//
// This walks the formula's own LaTeX template as an expression tree deep
// enough for our purposes — top-level +/- terms, then top-level product/
// quotient factors (flattening exactly one level of \frac per factor),
// then a handful of recognized wrappers (\sqrt{}, parens) — and, given the
// target appears exactly once in it, repeatedly identifies the outermost
// operation still standing between the target and full isolation and
// applies its inverse to the accumulated "other side", the same way you'd
// do it by hand: peel off addition/subtraction first (lowest precedence,
// so it was applied last), then multiplication/division, then a wrapping
// sqrt or exponent. Every case it doesn't recognize (the target inside a
// \log/\sin/e^{...}, a variable exponent, appearing more than once, a
// second equation joined by another "=", ...) returns null rather than
// guessing, and the caller falls back to showing the original equation
// with knowns substituted in place instead.
// ---------------------------------------------------------------------

function allTokensFor(symbols: string[]): string[] {
  const tokens = new Set<string>();
  for (const symbol of symbols) {
    tokens.add(symbolToLatex(symbol));
    const compact = symbol.match(/^([A-Za-z])([a-z])$/);
    if (compact) tokens.add(`${compact[1]}_${compact[2]}`);
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

function findTopLevelEquals(s: string): number[] {
  const indices: number[] = [];
  let brace = 0;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '=' && brace === 0 && paren === 0) indices.push(i);
  }
  return indices;
}

function readBraceGroup(s: string, start: number): [string, number] | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return [s.slice(start + 1, i), i + 1];
    }
  }
  return null;
}

function readParenGroup(s: string, start: number): [string, number] | null {
  if (s[start] !== '(') return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return [s.slice(start + 1, i), i + 1];
    }
  }
  return null;
}

interface Term {
  sign: 1 | -1;
  text: string;
}

// Splits on top-level +/- only (respecting brace/paren depth), always
// returning at least one term — a plain expression with no top-level
// operator comes back as a single positive term covering the whole string.
function splitTopLevelTerms(expr: string): Term[] {
  const s = expr.trim();
  if (!s) return [];
  const terms: Term[] = [];
  let depth = 0;
  let sign: 1 | -1 = 1;
  let start = 0;
  let i = 0;
  if (s[0] === '+') {
    i = 1;
    start = 1;
  } else if (s[0] === '-') {
    sign = -1;
    i = 1;
    start = 1;
  }
  for (; i <= s.length; i++) {
    const ch = s[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    if (i === s.length) {
      terms.push({ sign, text: s.slice(start, i).trim() });
    } else if (depth === 0 && (ch === '+' || ch === '-')) {
      terms.push({ sign, text: s.slice(start, i).trim() });
      sign = ch === '-' ? -1 : 1;
      start = i + 1;
    }
  }
  return terms.filter((t) => t.text.length > 0);
}

interface Factor {
  text: string;
  exponent: number;
  inDenominator: boolean;
}

// Flattens a single term (no top-level +/-) into its multiplicative
// factors, expanding exactly one level of \frac{N}{D} into N's factors
// (numerator) and D's factors (denominator) rather than keeping the whole
// fraction as one opaque unit — that's what lets the target be found (and
// removed) even when it's sitting inside a \frac, like m₁ in
// G\frac{m_1 m_2}{r^2}. Returns null the moment it meets something it
// doesn't recognize (an explicit \times/\cdot aside — those are just
// skipped, this dataset's formulas never actually need them since
// implicit juxtaposition is the norm) rather than guessing at structure.
function flattenProduct(expr: string, knownTokens: string[]): Factor[] | null {
  const s = expr.trim();
  const factors: Factor[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (s.startsWith('\\times', i)) {
      i += 6;
      continue;
    }
    if (s.startsWith('\\cdot', i)) {
      i += 5;
      continue;
    }

    if (s[i] === '\\') {
      const cmdName = s.slice(i).match(/^\\[a-zA-Z]+/)?.[0];
      if (!cmdName) return null;

      if (cmdName === '\\frac') {
        const numRes = readBraceGroup(s, i + cmdName.length);
        if (!numRes) return null;
        const denRes = readBraceGroup(s, numRes[1]);
        if (!denRes) return null;
        const numFactors = flattenProduct(numRes[0], knownTokens);
        const denFactors = flattenProduct(denRes[0], knownTokens);
        if (!numFactors || !denFactors) return null;
        factors.push(...numFactors);
        for (const f of denFactors) factors.push({ ...f, inDenominator: !f.inDenominator });
        i = denRes[1];
        continue;
      }

      if (cmdName === '\\sqrt') {
        const argRes = readBraceGroup(s, i + cmdName.length);
        if (!argRes) return null;
        const rest = s.slice(argRes[1]);
        const expMatch = rest.match(/^\^\{?(-?\d+)\}?/);
        factors.push({
          text: `\\sqrt{${argRes[0]}}`,
          exponent: expMatch ? Number(expMatch[1]) : 1,
          inDenominator: false,
        });
        i = argRes[1] + (expMatch ? expMatch[0].length : 0);
        continue;
      }

      // A known variable's command form (a Greek letter, optionally with a
      // digit subscript already folded into its token) is a removable
      // factor on its own. Anything else backslash-escaped that's
      // immediately followed by ( — \sin(\theta), \cos(\theta), any
      // function this dataset doesn't otherwise name as a variable — has
      // to be kept together with that argument as one opaque, unremovable
      // factor. Splitting it into a bare "\sin" factor plus a separate
      // "(\theta)" factor would let \sin get mistaken for a plain
      // multiplicative coefficient and "moved to the other side" as if
      // dividing by it meant anything — there's no inverse-trig isolation
      // implemented here, so the target sitting inside is what must stay
      // unreachable, correctly forcing isolate() to bail instead.
      const withSub = knownTokens.find((t) => t.startsWith(cmdName) && s.startsWith(t, i));
      if (!withSub) {
        const afterCmd = s.slice(i + cmdName.length);
        const parenAfter = afterCmd.match(/^\s*\(/);
        if (parenAfter) {
          const parenStart = i + cmdName.length + parenAfter[0].length - 1;
          const res = readParenGroup(s, parenStart);
          if (!res) return null;
          const [, after] = res;
          factors.push({ text: s.slice(i, after), exponent: 1, inDenominator: false });
          i = after;
          continue;
        }
      }
      const consumed = withSub ?? cmdName;
      const rest = s.slice(i + consumed.length);
      const expMatch = rest.match(/^\^\{?(-?\d+)\}?/);
      factors.push({ text: consumed, exponent: expMatch ? Number(expMatch[1]) : 1, inDenominator: false });
      i += consumed.length + (expMatch ? expMatch[0].length : 0);
      continue;
    }

    if (s[i] === '(') {
      const res = readParenGroup(s, i);
      if (!res) return null;
      const [inner, after] = res;
      const rest = s.slice(after);
      const expMatch = rest.match(/^\^\{?(-?\d+)\}?/);
      factors.push({ text: `(${inner})`, exponent: expMatch ? Number(expMatch[1]) : 1, inDenominator: false });
      i = after + (expMatch ? expMatch[0].length : 0);
      continue;
    }

    const tokenHit = knownTokens.find((t) => /^[a-zA-Z]/.test(t) && s.startsWith(t, i));
    const numHit = !tokenHit ? s.slice(i).match(/^\d+(?:\.\d+)?/)?.[0] : undefined;
    const matched = tokenHit ?? numHit;
    if (matched) {
      const rest = s.slice(i + matched.length);
      const expMatch = rest.match(/^\^\{?(-?\d+)\}?/);
      factors.push({ text: matched, exponent: expMatch ? Number(expMatch[1]) : 1, inDenominator: false });
      i += matched.length + (expMatch ? expMatch[0].length : 0);
      continue;
    }

    // An unrecognized character (stray punctuation, an operator this
    // dataset doesn't use, ...) — can't confidently continue.
    return null;
  }
  return factors;
}

function factorContainsToken(factor: Factor, token: string, knownTokens: string[]): boolean {
  if (factor.text === token) return true;
  const sqrtMatch = factor.text.match(/^\\sqrt\{([\s\S]*)\}$/);
  if (sqrtMatch) return containsToken(sqrtMatch[1], token, knownTokens);
  const parenMatch = factor.text.match(/^\(([\s\S]*)\)$/);
  if (parenMatch) return containsToken(parenMatch[1], token, knownTokens);
  return false;
}

function containsToken(expr: string, token: string, knownTokens: string[]): boolean {
  for (const term of splitTopLevelTerms(expr)) {
    const factors = flattenProduct(term.text, knownTokens);
    if (!factors) {
      if (term.text.includes(token)) return true;
      continue;
    }
    if (factors.some((f) => factorContainsToken(f, token, knownTokens))) return true;
  }
  return false;
}

// Joining parts with a bare space is implicit multiplication in this
// dataset's LaTeX — correct for two atomic factors, but silently wrong if
// either part is itself a sum: "x - y 2" reads as "x - (y·2)", not
// "(x - y)·2". The accumulated "other side" passed in here is the one
// value that can actually be a multi-term sum by the time it reaches this
// function (every other part is a single already-atomic factor), so it's
// the one that needs guarding — wrapping every part on the (rare) chance
// one is a sum, rather than trusting each call site to remember to.
function wrapIfSum(part: string): string {
  return splitTopLevelTerms(part).length > 1 ? `\\left(${part}\\right)` : part;
}

function buildFraction(numParts: string[], denParts: string[]): string {
  const num = numParts.filter(Boolean).map(wrapIfSum).join(' ') || '1';
  const den = denParts.filter(Boolean).map(wrapIfSum).join(' ');
  return den ? `\\frac{${num}}{${den}}` : num;
}

function factorText(f: Factor): string {
  return f.exponent === 1 ? f.text : `${f.text}^{${f.exponent}}`;
}

// The recursive step: `expr` is known to contain `token` exactly once;
// `rhsAcc` is the LaTeX text of whatever it currently must equal. Peels
// exactly one operation off `expr` (whichever is outermost) and recurses
// with the inverse applied to `rhsAcc`, until `expr` reduces to the bare
// token itself.
function isolate(expr: string, rhsAcc: string, token: string, knownTokens: string[]): string | null {
  const trimmed = expr.trim();

  if (trimmed === token) return rhsAcc;

  const terms = splitTopLevelTerms(trimmed);
  if (terms.length > 1) {
    const containingIdx = terms.reduce<number[]>(
      (acc, t, i) => (containsToken(t.text, token, knownTokens) ? [...acc, i] : acc),
      [],
    );
    if (containingIdx.length !== 1) return null;
    const targetTerm = terms[containingIdx[0]];
    const others = terms.filter((_, i) => i !== containingIdx[0]);
    const movedParts = others.map((o) => (o.sign === 1 ? `- ${o.text}` : `+ ${o.text}`));
    const combinedRhs = [rhsAcc, ...movedParts].join(' ');
    const nextRhs = targetTerm.sign === -1 ? `-\\left(${combinedRhs}\\right)` : combinedRhs;
    return isolate(targetTerm.text, nextRhs, token, knownTokens);
  }

  const factors = flattenProduct(trimmed, knownTokens);
  if (factors && factors.length > 0) {
    if (factors.length === 1) {
      const only = factors[0];
      if (only.text === token) {
        if (only.exponent === 1) return rhsAcc;
        const root = only.exponent === 2 ? `\\sqrt{${rhsAcc}}` : `\\sqrt[${only.exponent}]{${rhsAcc}}`;
        return isolate(token, root, token, knownTokens);
      }
      const sqrtMatch = only.text.match(/^\\sqrt\{([\s\S]*)\}$/);
      if (sqrtMatch && only.exponent === 1) {
        return isolate(sqrtMatch[1], `\\left(${rhsAcc}\\right)^2`, token, knownTokens);
      }
      const innerParen = only.text.match(/^\(([\s\S]*)\)$/);
      if (innerParen) return isolate(innerParen[1], rhsAcc, token, knownTokens);
      return null;
    }

    const containing = factors.filter((f) => factorContainsToken(f, token, knownTokens));
    if (containing.length !== 1) return null;
    const target = containing[0];
    const others = factors.filter((f) => f !== target);
    const otherNum = others.filter((f) => !f.inDenominator).map(factorText);
    const otherDen = others.filter((f) => f.inDenominator).map(factorText);

    const nextRhs = target.inDenominator
      ? buildFraction(otherNum, [rhsAcc, ...otherDen])
      : buildFraction([rhsAcc, ...otherDen], otherNum);

    if (target.text === token) {
      if (target.exponent === 1) return nextRhs;
      const root = target.exponent === 2 ? `\\sqrt{${nextRhs}}` : `\\sqrt[${target.exponent}]{${nextRhs}}`;
      return isolate(token, root, token, knownTokens);
    }
    // The target-bearing factor is itself compound (a sqrt or a
    // parenthesized sub-expression) — recurse one more level into it with
    // the coefficient already peeled off.
    const sqrtMatch = target.text.match(/^\\sqrt\{([\s\S]*)\}$/);
    if (sqrtMatch) {
      const afterSqrt = target.exponent === 1 ? nextRhs : null; // an exponent on a compound sqrt factor is rare enough to just bail on
      if (afterSqrt === null) return null;
      return isolate(sqrtMatch[1], `\\left(${afterSqrt}\\right)^2`, token, knownTokens);
    }
    const innerParen = target.text.match(/^\(([\s\S]*)\)$/);
    if (innerParen && target.exponent === 1) return isolate(innerParen[1], nextRhs, token, knownTokens);
    return null;
  }

  return null;
}

// Given a formula's own LaTeX and the symbol being solved for, returns the
// fully rearranged "target = ..." template (still containing every other
// symbol, unsubstituted — substituteLatex handles plugging numbers in
// afterward) — or null when the target is already alone on one side (no
// rearrangement needed) or when this couldn't confidently isolate it, in
// which case the caller falls back to showing the original equation with
// knowns substituted in place.
export function rearrangeForTarget(latex: string, targetSymbol: string, allSymbols: string[]): string | null {
  const eqIndices = findTopLevelEquals(latex);
  if (eqIndices.length !== 1) return null;

  const lhs = latex.slice(0, eqIndices[0]).trim().replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
  const rhs = latex
    .slice(eqIndices[0] + 1)
    .trim()
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')');
  const token = symbolToLatex(targetSymbol);
  const knownTokens = allTokensFor(allSymbols);

  if (lhs === token || rhs === token) return null;

  const lhsHas = containsToken(lhs, token, knownTokens);
  const rhsHas = containsToken(rhs, token, knownTokens);
  if (lhsHas === rhsHas) return null;

  const result = lhsHas ? isolate(lhs, rhs, token, knownTokens) : isolate(rhs, lhs, token, knownTokens);
  return result === null ? null : `${token} = ${result}`;
}
