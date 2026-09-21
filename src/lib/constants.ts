// Physical and mathematical constants, findable from the command palette:
// "speed of light", "planck", "avogadro", "g". Values are CODATA 2018 (the
// current set of SI-defining values), in SI units.

export interface ConstantHit {
  id: string;
  name: string;
  symbol: string;
  // "6.62607015 × 10⁻³⁴ J·s"
  display: string;
  // "6.62607015e-34" — pastes into any calculator or code
  copy: string;
}

interface Entry {
  name: string;
  symbol: string;
  value: number;
  unit: string;
  // Other ways to ask for it. Keys shorter than three letters must match
  // exactly; longer ones may also match the start of a word.
  keys: string[];
}

const CONSTANTS: Entry[] = [
  { name: 'Speed of light', symbol: 'c', value: 299792458, unit: 'm/s', keys: ['speed of light', 'light speed', 'lightspeed'] },
  { name: 'Standard gravity', symbol: 'g', value: 9.80665, unit: 'm/s²', keys: ['g', 'standard gravity', 'gravity', 'acceleration due to gravity', 'gravitational acceleration', 'free fall'] },
  { name: 'Gravitational constant', symbol: 'G', value: 6.6743e-11, unit: 'm³·kg⁻¹·s⁻²', keys: ['gravitational constant', 'newtons gravitational constant', 'big g', 'universal gravitation'] },
  { name: 'Planck constant', symbol: 'h', value: 6.62607015e-34, unit: 'J·s', keys: ['planck constant', "planck's constant", 'planck', 'plancks'] },
  { name: 'Reduced Planck constant', symbol: 'ħ', value: 1.054571817e-34, unit: 'J·s', keys: ['reduced planck constant', 'h bar', 'hbar', 'dirac constant'] },
  { name: 'Boltzmann constant', symbol: 'k_B', value: 1.380649e-23, unit: 'J/K', keys: ['boltzmann constant', 'boltzmann', "boltzmann's constant"] },
  { name: 'Avogadro constant', symbol: 'N_A', value: 6.02214076e23, unit: 'mol⁻¹', keys: ['avogadro constant', 'avogadro', "avogadro's number", 'avogadro number', 'mole'] },
  { name: 'Gas constant', symbol: 'R', value: 8.314462618, unit: 'J/(mol·K)', keys: ['gas constant', 'universal gas constant', 'ideal gas constant', 'molar gas constant'] },
  { name: 'Elementary charge', symbol: 'e', value: 1.602176634e-19, unit: 'C', keys: ['elementary charge', 'electron charge', 'charge of an electron', 'charge of electron', 'proton charge'] },
  { name: 'Electron mass', symbol: 'mₑ', value: 9.1093837015e-31, unit: 'kg', keys: ['electron mass', 'mass of an electron', 'mass of electron'] },
  { name: 'Proton mass', symbol: 'mₚ', value: 1.67262192369e-27, unit: 'kg', keys: ['proton mass', 'mass of a proton', 'mass of proton'] },
  { name: 'Neutron mass', symbol: 'mₙ', value: 1.67492749804e-27, unit: 'kg', keys: ['neutron mass', 'mass of a neutron', 'mass of neutron'] },
  { name: 'Atomic mass unit', symbol: 'u', value: 1.6605390666e-27, unit: 'kg', keys: ['atomic mass unit', 'amu', 'dalton', 'unified atomic mass unit'] },
  { name: 'Coulomb constant', symbol: 'kₑ', value: 8.9875517923e9, unit: 'N·m²/C²', keys: ['coulomb constant', "coulomb's constant", 'electric constant', 'electrostatic constant'] },
  { name: 'Vacuum permittivity', symbol: 'ε₀', value: 8.8541878128e-12, unit: 'F/m', keys: ['vacuum permittivity', 'permittivity of free space', 'epsilon 0', 'epsilon naught', 'permittivity'] },
  { name: 'Vacuum permeability', symbol: 'μ₀', value: 1.25663706212e-6, unit: 'N/A²', keys: ['vacuum permeability', 'permeability of free space', 'mu 0', 'mu naught', 'permeability'] },
  { name: 'Stefan–Boltzmann constant', symbol: 'σ', value: 5.670374419e-8, unit: 'W/(m²·K⁴)', keys: ['stefan boltzmann constant', 'stefan boltzmann', 'stefan-boltzmann', 'stefan'] },
  { name: 'Faraday constant', symbol: 'F', value: 96485.33212, unit: 'C/mol', keys: ['faraday constant', 'faraday'] },
  { name: 'Rydberg constant', symbol: 'R∞', value: 10973731.56816, unit: 'm⁻¹', keys: ['rydberg constant', 'rydberg'] },
  { name: 'Bohr radius', symbol: 'a₀', value: 5.29177210903e-11, unit: 'm', keys: ['bohr radius', 'bohr'] },
  { name: 'Wien displacement constant', symbol: 'b', value: 2.897771955e-3, unit: 'm·K', keys: ['wien displacement constant', 'wien constant', 'wien'] },
  { name: 'Standard atmosphere', symbol: 'atm', value: 101325, unit: 'Pa', keys: ['standard atmosphere', 'atmospheric pressure', 'atmosphere', 'sea level pressure'] },
  { name: 'Speed of sound in air (20 °C)', symbol: 'v', value: 343, unit: 'm/s', keys: ['speed of sound', 'sound speed', 'mach 1'] },
  { name: 'Astronomical unit', symbol: 'AU', value: 1.495978707e11, unit: 'm', keys: ['astronomical unit', 'au', 'earth sun distance'] },
  { name: 'Light-year', symbol: 'ly', value: 9.4607304725808e15, unit: 'm', keys: ['light year', 'lightyear', 'light-year'] },
  { name: 'Mass of the Earth', symbol: 'M⊕', value: 5.9722e24, unit: 'kg', keys: ['earth mass', 'mass of the earth', 'mass of earth'] },
  { name: 'Radius of the Earth', symbol: 'R⊕', value: 6.371e6, unit: 'm', keys: ['earth radius', 'radius of the earth', 'radius of earth'] },
  { name: 'Mass of the Sun', symbol: 'M☉', value: 1.98847e30, unit: 'kg', keys: ['sun mass', 'solar mass', 'mass of the sun', 'mass of sun'] },
  { name: 'Pi', symbol: 'π', value: Math.PI, unit: '', keys: ['pi', 'π'] },
  { name: "Euler's number", symbol: 'e', value: Math.E, unit: '', keys: ['euler', "euler's number", 'eulers number', 'euler number', 'napier'] },
  { name: 'Golden ratio', symbol: 'φ', value: (1 + Math.sqrt(5)) / 2, unit: '', keys: ['golden ratio', 'phi', 'golden'] },
  { name: 'Square root of 2', symbol: '√2', value: Math.SQRT2, unit: '', keys: ['root 2', 'sqrt 2', 'square root of 2', "pythagoras' constant"] },
];

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e6) {
    const [int, frac] = String(Number(value.toPrecision(12))).split('.');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
  }
  const [mantissa, exponent] = value.toExponential(11).split('e');
  const trimmed = mantissa.replace(/\.?0+$/, '');
  const exp = String(Number(exponent)).replace(/./g, (c) => SUPERSCRIPT[c] ?? c);
  return `${trimmed} × 10${exp}`;
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[?=]+$/, '')
    .replace(/^(what\s+is|what's|whats|value\s+of|the\s+value\s+of)\s+/, '')
    .replace(/^the\s+/, '')
    .replace(/\s+(value|in\s+si|constant\s+value)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(entry: Entry, q: string): number {
  let best = 0;
  for (const key of entry.keys) {
    if (key === q) return 3;
    // A shorter key ("c", "au") only ever matches exactly.
    if (key.length < 3 || q.length < 3) continue;
    if (key.startsWith(q)) best = Math.max(best, 2);
    else if (key.split(' ').some((word) => word.startsWith(q)) && q.length >= 4) best = Math.max(best, 1);
  }
  return best;
}

export function lookupConstants(raw: string): ConstantHit[] {
  const q = normalize(raw);
  if (q.length < 1 || q.length > 40) return [];
  const hits = CONSTANTS.map((entry) => ({ entry, s: score(entry, q) }))
    .filter((h) => h.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);
  return hits.map(({ entry }) => ({
    id: entry.name,
    name: entry.name,
    symbol: entry.symbol,
    display: `${formatValue(entry.value)}${entry.unit ? ' ' + entry.unit : ''}`,
    copy: String(Number(entry.value.toPrecision(12))),
  }));
}
