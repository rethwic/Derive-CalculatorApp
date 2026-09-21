// A cheap yes/no check — no math library involved — for "does this search text
// look like arithmetic rather than a formula search?". It decides whether the
// command palette bothers to load the math engine at all.
//
// Everything typed must be made of digits, operators, and words from the list
// below; any other word ("radius", "cm", "x", "kinetic") means it's a search,
// not a sum. So "2^10", "sqrt(144)" and "15% of 240" pass, while "r = 6 cm",
// "a^2 + b^2" and "kinetic energy" don't.

const MATH_WORDS = new Set([
  'sqrt', 'cbrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'log', 'log2', 'log10', 'ln', 'abs', 'exp', 'floor', 'ceil', 'round', 'trunc',
  'min', 'max', 'pow', 'mod', 'gcd', 'lcm', 'hypot', 'factorial',
  'pi', 'tau', 'phi', 'e',
  'of', 'off', 'percent', 'plus', 'minus', 'times', 'over', 'squared', 'cubed',
  'what', 'is', 'whats', 'calculate', 'calc', 'compute',
]);

// Words that, on their own, make it a calculation (as opposed to "e", "is"...).
const OPERATIVE_WORDS = /\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|log|log2|log10|ln|abs|exp|floor|ceil|round|trunc|min|max|pow|mod|gcd|lcm|hypot|factorial|of|off|percent|plus|minus|times|over|squared|cubed)\b/;

export function looksLikeMath(raw: string): boolean {
  const s = raw.toLowerCase().trim();
  if (!s || s.length > 120) return false;
  if (!/[0-9]|\bpi\b|π/.test(s)) return false;
  // 2026-09-21 and the like are dates, not subtraction
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return false;

  const words = s.match(/[a-z][a-z0-9]*/g) ?? [];
  // "1e5" leaves a stray "e5"; treat a digit-bearing e-token as scientific notation
  const unknown = words.filter((w) => !MATH_WORDS.has(w) && !/^e[0-9]+$/.test(w));
  if (unknown.length > 0) return false;

  // Needs to actually *do* something: an operator, a function, or a percent phrase.
  return /[+\-*/^%×÷√!()]/.test(s) || OPERATIVE_WORDS.test(s);
}
