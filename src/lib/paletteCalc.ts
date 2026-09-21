import { classifyRow } from './mathEngine';

// Kept in its own module and loaded on demand (see CommandPalette), so the
// math library only arrives the first time someone types a sum into the
// palette — never as part of the initial page load.

export interface CalcAnswer {
  // What was typed, tidied up.
  expression: string;
  // How it's shown: "1,024".
  display: string;
  // What gets copied: "1024" (no separators, so it pastes anywhere).
  copy: string;
}

// Turns the way people actually type ("15% of 240", "200 + 10%", "√144",
// "what is 6 × 7?") into plain syntax the math engine understands.
function normalize(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^(what\s+is|what's|whats|calculate|calc|compute)\s+/, '');
  s = s.replace(/[=?]+\s*$/, '').trim();
  // Thousands separators: "1,000 + 5"
  s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');

  s = s
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\btimes\b/g, '*')
    .replace(/\bover\b/g, '/')
    .replace(/\bsquared\b/g, '^2')
    .replace(/\bcubed\b/g, '^3');

  // "15% of 240" -> 15/100 * 240      "20% off 80" -> 80 * (1 - 20/100)
  s = s.replace(/(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s+(.+)$/, (_, a: string, b: string) => `((${a})/100)*(${b})`);
  s = s.replace(/(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s*off\s+(.+)$/, (_, a: string, b: string) => `(${b})*(1-(${a})/100)`);
  // "200 + 10%" -> 200 * 1.10 (add a percentage *of the first number*, as every
  // pocket calculator does), and likewise for minus.
  s = s.replace(
    /^(.+?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*(?:%|percent)$/,
    (_, base: string, op: string, pct: string) => `(${base})*(1${op}(${pct})/100)`,
  );
  // A bare "10%" (as in "200 + 10%" or just "15%") is a hundredth-scaled number,
  // not mathjs's modulo — but "10 % 3" (a digit follows) stays a modulo.
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:%|percent)(?!\s*[\d(a-z.])/g, '($1/100)');
  return s;
}

function format(n: number): { display: string; copy: string } {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e15)) {
    const exp = n.toExponential(8).replace(/\.?0+e/, 'e');
    return { display: exp, copy: exp };
  }
  const tidy = Number(n.toPrecision(12));
  return {
    copy: String(tidy),
    display: tidy.toLocaleString('en-US', { maximumFractionDigits: 10 }),
  };
}

export function evaluateForPalette(raw: string): CalcAnswer | null {
  const expression = normalize(raw);
  if (!expression) return null;
  // Only a plain number counts. Anything the engine would plot, define or
  // flag as an error isn't an answer for a search box.
  const result = classifyRow(expression, {});
  if (result.kind !== 'value') return null;
  // A bare literal ("42") isn't a calculation worth answering.
  if (/^[-+]?[0-9.]+$/.test(expression)) return null;
  return { expression: raw.trim(), ...format(result.value) };
}
