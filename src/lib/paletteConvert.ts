import { parseUnit, sameDim, type Dim } from './units';

// "5 km in miles", "72 f to c", "convert 100 lb to kg": a conversion typed into
// the palette. Runs synchronously (units.ts is already part of the page) and
// bails on a cheap pattern check before doing any work.

export interface ConvertAnswer {
  expression: string;
  display: string;
  copy: string;
}

interface Extra {
  factor: number;
  dim: Dim;
}

const d = (l = 0, m = 0, t = 0): Dim => [l, m, t, 0, 0, 0];

// Everyday units the physics-oriented table in units.ts doesn't carry.
const EXTRA: Record<string, Extra> = {
  day: { factor: 86400, dim: d(0, 0, 1) },
  week: { factor: 604800, dim: d(0, 0, 1) },
  year: { factor: 31557600, dim: d(0, 0, 1) },
  gallon: { factor: 0.003785411784, dim: d(3) },
  gal: { factor: 0.003785411784, dim: d(3) },
  quart: { factor: 0.000946352946, dim: d(3) },
  pint: { factor: 0.000473176473, dim: d(3) },
  cup: { factor: 0.0002365882365, dim: d(3) },
  tablespoon: { factor: 1.478676478125e-5, dim: d(3) },
  tbsp: { factor: 1.478676478125e-5, dim: d(3) },
  teaspoon: { factor: 4.92892159375e-6, dim: d(3) },
  tsp: { factor: 4.92892159375e-6, dim: d(3) },
  floz: { factor: 2.95735295625e-5, dim: d(3) },
  acre: { factor: 4046.8564224, dim: d(2) },
  hectare: { factor: 10000, dim: d(2) },
  ha: { factor: 10000, dim: d(2) },
  tonne: { factor: 1000, dim: d(0, 1) },
  ton: { factor: 907.18474, dim: d(0, 1) },
  stone: { factor: 6.35029318, dim: d(0, 1) },
  knot: { factor: 0.514444, dim: d(1, 0, -1) },
  kn: { factor: 0.514444, dim: d(1, 0, -1) },
  kph: { factor: 1 / 3.6, dim: d(1, 0, -1) },
  kmh: { factor: 1 / 3.6, dim: d(1, 0, -1) },
  cal: { factor: 4.184, dim: [2, 1, -2, 0, 0, 0] },
  kcal: { factor: 4184, dim: [2, 1, -2, 0, 0, 0] },
  calorie: { factor: 4.184, dim: [2, 1, -2, 0, 0, 0] },
  wh: { factor: 3600, dim: [2, 1, -2, 0, 0, 0] },
  kwh: { factor: 3.6e6, dim: [2, 1, -2, 0, 0, 0] },
  hp: { factor: 745.699872, dim: [2, 1, -3, 0, 0, 0] },
  horsepower: { factor: 745.699872, dim: [2, 1, -3, 0, 0, 0] },
};

const TEMPS: Record<string, 'c' | 'f' | 'k'> = {
  c: 'c', celsius: 'c', centigrade: 'c',
  f: 'f', fahrenheit: 'f',
  k: 'k', kelvin: 'k',
};

const PATTERN = /^(?:convert\s+)?(-?\d[\d,]*(?:\.\d+)?|-?\.\d+)\s*([^\d\s].*?)\s+(?:in|to|into|as|->|→)\s+([^\d].*)$/i;

function clean(unit: string): string {
  return unit.trim().toLowerCase().replace(/^°\s*/, '').replace(/^degrees?\s+/, '').replace(/°/g, '').trim();
}

function tempKey(unit: string): 'c' | 'f' | 'k' | null {
  return TEMPS[clean(unit)] ?? null;
}

function resolve(unit: string): Extra | null {
  const key = clean(unit).replace(/\s+/g, '');
  const singular = key.endsWith('s') ? key.slice(0, -1) : key;
  const extra = EXTRA[key] ?? EXTRA[singular];
  if (extra) return extra;
  // Multi-word ("fluid ounces") and compound ("m/s") units go through units.ts.
  const parsed = parseUnit(unit.trim());
  return parsed ? { factor: parsed.factor, dim: parsed.dim } : null;
}

function fmt(n: number, digits: number): string {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e15)) return Number(n.toPrecision(digits)).toExponential();
  return String(Number(n.toPrecision(digits)));
}

function withCommas(text: string): string {
  const [int, frac] = text.split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}

export function convertForPalette(raw: string): ConvertAnswer | null {
  const m = raw.trim().match(PATTERN);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const fromText = m[2].trim();
  const toText = m[3].trim();
  const toLabel = toText.replace(/\s+/g, ' ');

  const tf = tempKey(fromText);
  const tt = tempKey(toText);
  let result: number;
  if (tf && tt) {
    const kelvin = tf === 'c' ? value + 273.15 : tf === 'f' ? ((value - 32) * 5) / 9 + 273.15 : value;
    result = tt === 'c' ? kelvin - 273.15 : tt === 'f' ? ((kelvin - 273.15) * 9) / 5 + 32 : kelvin;
  } else if (tf || tt) {
    return null;
  } else {
    const from = resolve(fromText);
    const to = resolve(toText);
    if (!from || !to || !sameDim(from.dim, to.dim)) return null;
    result = (value * from.factor) / to.factor;
  }
  if (!Number.isFinite(result)) return null;

  const shown = withCommas(fmt(result, 6));
  return {
    expression: `${m[1]} ${fromText} → ${toText}`,
    display: tt ? (tt === 'k' ? shown + ' K' : shown + '°' + tt.toUpperCase()) : shown + ' ' + toLabel,
    copy: `${fmt(result, 8)} ${toLabel}`,
  };
}
