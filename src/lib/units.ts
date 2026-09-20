// The SI unit for a variable's meaning. Used to label a smart-search answer
// ("v ≈ 6.32 m/s") and, when the query names its own units ("r = 6 cm"), to
// know each variable's dimension so the answer can be given in those same
// units instead of being converted. A meaning with no entry here just
// renders without a unit suffix rather than guessing.
const UNIT_BY_MEANING: Record<string, string> = {
  area: 'm²',
  circumference: 'm',
  width: 'm',
  'base length': 'm',
  'side length': 'm',
  'parallel sides (bases)': 'm',
  'base length and width': 'm',
  mass: 'kg',
  velocity: 'm/s',
  speed: 'm/s',
  'wave speed': 'm/s',
  'speed of light': 'm/s',
  acceleration: 'm/s²',
  'angular acceleration': 'rad/s²',
  'gravitational acceleration': 'm/s²',
  'net force': 'N',
  'applied force': 'N',
  'friction force': 'N',
  'normal force': 'N',
  'centripetal force': 'N',
  'gravitational force': 'N',
  'electrostatic force': 'N',
  'buoyant force': 'N',
  'restoring force exerted by the spring': 'N',
  'kinetic energy': 'J',
  'gravitational potential energy': 'J',
  'elastic potential energy stored in the spring': 'J',
  'photon energy': 'J',
  'work done': 'J',
  energy: 'J',
  'change in gibbs free energy': 'J',
  'change in enthalpy': 'J',
  'change in entropy': 'J/K',
  power: 'W',
  torque: 'N·m',
  momentum: 'kg·m/s',
  'impulse (also equals δp, the change in momentum)': 'N·s',
  displacement: 'm',
  'displacement from equilibrium': 'm',
  height: 'm',
  length: 'm',
  radius: 'm',
  'radius of the circular path': 'm',
  'radius of base': 'm',
  'distance between centers': 'm',
  'distance between charges': 'm',
  'distance between the two points': 'm',
  wavelength: 'm',
  'pendulum length': 'm',
  'lever arm (distance from pivot)': 'm',
  time: 's',
  'time interval': 's',
  'elapsed time': 's',
  'period of oscillation': 's',
  'half-life': 's',
  frequency: 'Hz',
  'sampling frequency': 'Hz',
  'highest frequency in the signal': 'Hz',
  voltage: 'V',
  current: 'A',
  resistance: 'Ω',
  'electric charges': 'C',
  'spring constant': 'N/m',
  density: 'kg/m³',
  'fluid density': 'kg/m³',
  pressure: 'Pa',
  'total pressure': 'Pa',
  'partial pressure of gas i': 'Pa',
  volume: 'm³',
  'displaced fluid volume': 'm³',
  'moles of gas': 'mol',
  'molar concentration': 'mol/L',
  'hydrogen ion concentration': 'mol/L',
  'temperature (k)': 'K',
};

export function unitForMeaning(meaning: string): string | null {
  return UNIT_BY_MEANING[meaning.trim().toLowerCase()] ?? null;
}

// Dimension exponents: length, mass, time, current, temperature, amount.
export type Dim = [number, number, number, number, number, number];
const AXIS_SI_LABEL = ['m', 'kg', 's', 'A', 'K', 'mol'] as const;

interface Atom {
  factor: number;
  dim: Dim;
  prefixable?: boolean;
}

const d = (l = 0, m = 0, t = 0, i = 0, k = 0, n = 0): Dim => [l, m, t, i, k, n];

const ATOMS: Record<string, Atom> = {
  m: { factor: 1, dim: d(1), prefixable: true },
  g: { factor: 1e-3, dim: d(0, 1), prefixable: true },
  s: { factor: 1, dim: d(0, 0, 1), prefixable: true },
  A: { factor: 1, dim: d(0, 0, 0, 1), prefixable: true },
  K: { factor: 1, dim: d(0, 0, 0, 0, 1) },
  mol: { factor: 1, dim: d(0, 0, 0, 0, 0, 1), prefixable: true },
  min: { factor: 60, dim: d(0, 0, 1) },
  h: { factor: 3600, dim: d(0, 0, 1) },
  hr: { factor: 3600, dim: d(0, 0, 1) },
  Hz: { factor: 1, dim: d(0, 0, -1), prefixable: true },
  N: { factor: 1, dim: d(1, 1, -2), prefixable: true },
  J: { factor: 1, dim: d(2, 1, -2), prefixable: true },
  W: { factor: 1, dim: d(2, 1, -3), prefixable: true },
  Pa: { factor: 1, dim: d(-1, 1, -2), prefixable: true },
  V: { factor: 1, dim: d(2, 1, -3, -1), prefixable: true },
  Ω: { factor: 1, dim: d(2, 1, -3, -2), prefixable: true },
  ohm: { factor: 1, dim: d(2, 1, -3, -2), prefixable: true },
  C: { factor: 1, dim: d(0, 0, 1, 1), prefixable: true },
  L: { factor: 1e-3, dim: d(3), prefixable: true },
  eV: { factor: 1.602176634e-19, dim: d(2, 1, -2), prefixable: true },
  atm: { factor: 101325, dim: d(-1, 1, -2) },
  bar: { factor: 1e5, dim: d(-1, 1, -2), prefixable: true },
  psi: { factor: 6894.757, dim: d(-1, 1, -2) },
  mmHg: { factor: 133.322, dim: d(-1, 1, -2) },
  in: { factor: 0.0254, dim: d(1) },
  ft: { factor: 0.3048, dim: d(1) },
  yd: { factor: 0.9144, dim: d(1) },
  mi: { factor: 1609.344, dim: d(1) },
  lb: { factor: 0.45359237, dim: d(0, 1) },
  oz: { factor: 0.028349523125, dim: d(0, 1) },
  mph: { factor: 0.44704, dim: d(1, 0, -1) },
  rad: { factor: 1, dim: d() },
  deg: { factor: Math.PI / 180, dim: d() },
};

const PREFIXES: Record<string, number> = {
  T: 1e12, G: 1e9, M: 1e6, k: 1e3, c: 1e-2, m: 1e-3, µ: 1e-6, μ: 1e-6, u: 1e-6, n: 1e-9, p: 1e-12,
};

// People type "100j" or "5 kn"; accept an all-lowercase spelling only when
// it can't be confused with another unit.
const LOWER_ALIASES: Record<string, string> = {
  j: 'J', w: 'W', n: 'N', v: 'V', hz: 'Hz', pa: 'Pa', a: 'A', k: 'K', l: 'L', ev: 'eV', c: 'C',
};

// Full unit names -> their abbreviation. Plurals ("meters", "feet") are
// handled by trying the name with a trailing "s"/"es" removed, so only
// irregular ones need their own entry.
const FULL_NAMES: Record<string, string> = {
  meter: 'm', metre: 'm', gram: 'g', second: 's', ampere: 'A', amp: 'A', kelvin: 'K', mole: 'mol',
  minute: 'min', hour: 'h', hertz: 'Hz', newton: 'N', joule: 'J', watt: 'W', pascal: 'Pa', volt: 'V',
  ohm: 'ohm', coulomb: 'C', liter: 'L', litre: 'L', electronvolt: 'eV', atmosphere: 'atm', bar: 'bar',
  inch: 'in', inches: 'in', foot: 'ft', feet: 'ft', yard: 'yd', mile: 'mi', pound: 'lb', ounce: 'oz',
  radian: 'rad', degree: 'deg', psi: 'psi',
};

const PREFIX_NAMES: Record<string, string> = {
  tera: 'T', giga: 'G', mega: 'M', kilo: 'k', centi: 'c', milli: 'm', micro: 'µ', nano: 'n', pico: 'p',
};

interface ResolvedAtom {
  atom: Atom;
  factor: number;
  // The abbreviation this resolved to ("cm" for "centimeters"), used to
  // label an answer in the user's units.
  label: string;
}

function lookupAtom(token: string): Atom | undefined {
  return ATOMS[token] ?? (LOWER_ALIASES[token.toLowerCase()] ? ATOMS[LOWER_ALIASES[token.toLowerCase()]] : undefined);
}

function resolveName(word: string): ResolvedAtom | null {
  const lower = word.toLowerCase();
  const forms = [lower];
  if (lower.endsWith('es')) forms.push(lower.slice(0, -2));
  if (lower.endsWith('s')) forms.push(lower.slice(0, -1));
  for (const form of forms) {
    const abbr = FULL_NAMES[form];
    if (abbr) return { atom: ATOMS[abbr], factor: ATOMS[abbr].factor, label: abbr };
    for (const [prefixName, prefixAbbr] of Object.entries(PREFIX_NAMES)) {
      if (!form.startsWith(prefixName)) continue;
      const baseAbbr = FULL_NAMES[form.slice(prefixName.length)];
      const base = baseAbbr ? ATOMS[baseAbbr] : undefined;
      if (base?.prefixable) {
        return { atom: base, factor: base.factor * PREFIXES[prefixAbbr], label: prefixAbbr + baseAbbr };
      }
    }
  }
  return null;
}

function resolveAtom(token: string): ResolvedAtom | null {
  const direct = lookupAtom(token);
  if (direct) return { atom: direct, factor: direct.factor, label: token };
  const prefix = PREFIXES[token[0]];
  const base = token.length > 1 ? lookupAtom(token.slice(1)) : undefined;
  if (prefix !== undefined && base?.prefixable) return { atom: base, factor: base.factor * prefix, label: token };
  return resolveName(token);
}

export interface UnitAxisChoice {
  label: string;
  factor: number;
}

export type UnitSystem = Partial<Record<number, UnitAxisChoice>>;

export interface ParsedUnit {
  // Multiply a value in this unit by `factor` to get SI.
  factor: number;
  dim: Dim;
  // Pure single-axis atoms in the unit ("km/h" -> length: km, time: h),
  // which is what defines the unit system an answer should come back in.
  axes: UnitSystem;
}

export function parseUnit(raw: string): ParsedUnit | null {
  const text = raw
    .trim()
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\b(?:square|sq)\s+(\S+)/gi, '$1^2')
    .replace(/\bcubic\s+(\S+)/gi, '$1^3')
    .replace(/\s+squared\b/gi, '^2')
    .replace(/\s+cubed\b/gi, '^3')
    .replace(/\s+per\s+/gi, '/')
    .replace(/[·*]/g, ' ');
  if (!text) return null;
  const [numeratorText, ...denominatorParts] = text.split('/');

  let factor = 1;
  const dim: Dim = [0, 0, 0, 0, 0, 0];
  const axes: UnitSystem = {};

  const apply = (part: string, sign: 1 | -1): boolean => {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    for (const t of tokens) {
      const m = t.match(/^([^^]+?)(?:\^(-?\d+))?$/);
      if (!m) return false;
      const exp = (m[2] ? Number(m[2]) : 1) * sign;
      const resolved = resolveAtom(m[1]);
      if (!resolved) return false;
      factor *= resolved.factor ** exp;
      resolved.atom.dim.forEach((e, i) => {
        dim[i] += e * exp;
      });
      const nonZero = resolved.atom.dim.map((e, i) => (e !== 0 ? i : -1)).filter((i) => i >= 0);
      if (nonZero.length === 1 && resolved.atom.dim[nonZero[0]] === 1 && !axes[nonZero[0]]) {
        axes[nonZero[0]] = { label: resolved.label, factor: resolved.factor };
      }
    }
    return true;
  };

  if (!apply(numeratorText, 1)) return null;
  for (const part of denominatorParts) if (!apply(part, -1)) return null;
  return { factor, dim, axes };
}

export function dimForMeaning(meaning: string): Dim | null {
  const unit = unitForMeaning(meaning);
  return unit ? (parseUnit(unit)?.dim ?? null) : null;
}

export function sameDim(a: Dim, b: Dim): boolean {
  return a.every((e, i) => e === b[i]);
}

function axisFactor(system: UnitSystem, axis: number): number {
  return system[axis]?.factor ?? 1;
}

// SI value -> the number of that quantity in the system's own units.
export function fromSI(value: number, dim: Dim, system: UnitSystem): number {
  return dim.reduce((v, e, i) => v / axisFactor(system, i) ** e, value);
}

// A value written in the system's own units -> SI.
export function toSI(value: number, dim: Dim, system: UnitSystem): number {
  return dim.reduce((v, e, i) => v * axisFactor(system, i) ** e, value);
}

const SUPER_DIGITS: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

function withExponent(label: string, exp: number): string {
  if (exp === 1) return label;
  return label + String(exp).replace(/./g, (c) => SUPER_DIGITS[c] ?? c);
}

// A label for a quantity of the given dimension written in the system's
// units ("cm²", "g·cm/s²"). When the system doesn't override any axis this
// dimension actually uses, the plain SI name ("N", "J") is kept instead.
export function labelForDim(dim: Dim, system: UnitSystem, siLabel: string | null): string | null {
  const used = dim.map((e, i) => (e !== 0 ? i : -1)).filter((i) => i >= 0);
  if (used.length === 0) return siLabel;
  const overridden = used.some((i) => system[i] && (system[i]!.factor !== 1 || system[i]!.label !== AXIS_SI_LABEL[i]));
  if (!overridden && siLabel) return siLabel;
  const num: string[] = [];
  const den: string[] = [];
  used.forEach((i) => {
    const label = system[i]?.label ?? AXIS_SI_LABEL[i];
    if (dim[i] > 0) num.push(withExponent(label, dim[i]));
    else den.push(withExponent(label, -dim[i]));
  });
  const top = num.length ? num.join('·') : '1';
  return den.length === 0 ? top : `${top}/${den.join('·')}`;
}
