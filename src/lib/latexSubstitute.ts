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

const SUBSCRIPT_DIGIT: Record<string, string> = {
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
};

// A display symbol like "x₀" or "θ" needs translating to however it's
// actually spelled in this formula's LaTeX ("x_0", "\theta") before it can
// be searched for. Exported too, for rendering a plain "symbol ≈ value"
// final line in the same LaTeX spelling as the substituted formula above it.
export function symbolToLatex(symbol: string): string {
  let base = symbol;
  let subscript = '';
  while (base.length > 0 && SUBSCRIPT_DIGIT[base[base.length - 1]] !== undefined) {
    subscript = SUBSCRIPT_DIGIT[base[base.length - 1]] + subscript;
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
