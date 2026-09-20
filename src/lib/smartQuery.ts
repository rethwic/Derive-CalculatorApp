// Understands a sentence like "formula for velocity when I know kinetic
// energy and mass" or "I know mass = 5 kg and kinetic energy = 100 J" well
// enough to either jump straight to the one formula that explains it, or —
// when every other variable came with a number — solve it outright.
//
// This is deliberately a pattern-matcher over the formula data that's
// already here (each variable's plain-English `meaning`, plus the numeric
// `calc.residual` solver every formula already has for "solve for any
// blank variable"), not a general NLP system. It only engages for
// sentence-shaped queries (see `looksLikeNaturalQuery`); a plain keyword
// search like "kinetic energy" never reaches it and behaves exactly as
// before.
import type { CalcVar, Formula, FormulaCalc, Variable } from '../types';
import { formulas } from '../data/formulas';
import { solveForUnknown } from './solve';
import {
  dimForMeaning,
  fromSI,
  labelForDim,
  parseUnit,
  sameDim,
  toSI,
  unitForMeaning,
  type Dim,
  type UnitSystem,
} from './units';

export interface KnownValue {
  symbol: string;
  meaning: string;
  value: number;
  unit: string | null;
}

export interface SmartAnswer {
  kind: 'answer';
  formula: Formula;
  // Set when the answer comes from one shape of a multi-shape card (the
  // Sphere entry of "Volume Formulas"); title/latex describe that shape.
  variantIndex?: number;
  title: string;
  latex: string;
  targetSymbol: string;
  targetMeaning: string;
  targetUnit: string | null;
  value: number;
  knowns: KnownValue[];
  // The knowns, keyed by calc-var — left as-is (the target excluded) so
  // opening the formula's own calculator from here re-derives and shows
  // the same solved value the same way a manual "leave one blank" would.
  prefill: Record<string, number>;
}

export interface SmartFormulaMatch {
  kind: 'formula-match';
  formula: Formula;
  variantIndex?: number;
  title: string;
  latex: string;
  targetSymbol: string | null;
  targetMeaning: string | null;
  // calc-var key -> value, for whatever numbers the query did include, so
  // the detail panel's calculator can open pre-filled instead of blank.
  prefill: Record<string, number>;
}

export type SmartQueryResult = SmartAnswer | SmartFormulaMatch;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A handful of safe, common substitutions — not a general thesaurus. Each
// one is a case where two different words genuinely name the same physical
// quantity in the formulas here (speed and velocity are both just "v"),
// not merely related quantities (weight isn't mass, it's mg — aliasing
// them would have the calculator answer the wrong question).
const WORD_SYNONYMS: Record<string, string> = {
  speed: 'velocity',
};

function canonicalize(normalized: string): string {
  return normalized
    .split(' ')
    .map((w) => WORD_SYNONYMS[w] ?? w)
    .join(' ');
}

// Higher is a more confident match. Requires at least a short-word's worth
// of overlap so single-letter noise can't match everything.
function conceptScore(phrase: string, meaning: string): number {
  const a = canonicalize(normalize(phrase));
  const b = canonicalize(normalize(meaning));
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.length >= 3 && a.includes(b)) return 80 + b.length;
  if (a.length >= 3 && b.includes(a)) return 60 + a.length;
  return 0;
}

// A variable typed by its letter ("r = 6", "m1 = 2"). Exact-case only:
// "V" (volume/voltage) and "v" (velocity) are different quantities, and a
// case-insensitive match would let "r = 6" claim the gas constant "R".
const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

function normalizeSymbol(s: string): string {
  return s
    .replace(/[₀-₉]/g, (c) => String(SUBSCRIPTS.indexOf(c)))
    .replace(/[_{}\s]/g, '');
}

function symbolScore(phrase: string, symbol: string): number {
  const p = normalizeSymbol(phrase);
  return p !== '' && p === normalizeSymbol(symbol) ? 90 : 0;
}

function varScore(phrase: string, meta: { meaning: string; symbol: string }): number {
  return Math.max(conceptScore(phrase, meta.meaning), symbolScore(phrase, meta.symbol));
}

// calc.vars and the displayed variables list are two separate lists that
// happen to agree on symbols almost everywhere (a handful of formulas, e.g.
// gravitation's "m₁, m₂", combine two calc vars under one displayed
// variable) — matched by symbol containment rather than assuming a 1:1
// array correspondence.
function meaningForCalcVar(variables: Variable[], calcVar: CalcVar): string {
  const exact = variables.find((v) => v.symbol === calcVar.symbol);
  if (exact) return exact.meaning;
  const containing = variables.find((v) => v.symbol.includes(calcVar.symbol));
  return containing?.meaning ?? calcVar.symbol;
}

interface KnownClause {
  phrase: string;
  value?: number;
  unit?: string;
}

// A handful of adverbs that ask for a quantity without ever naming it —
// "how fast" means "find the velocity" as surely as if it said so, but
// there's no concept word in the sentence for a target pattern to capture.
// Rewriting these before any pattern runs turns an implicit ask into an
// explicit one instead of trying to special-case every phrasing that uses
// them.
const IDIOM_REWRITES: [RegExp, string][] = [
  [/\bhow fast\b/gi, 'find velocity'],
  [/\bhow far\b/gi, 'find distance'],
  [/\bhow long\b(?!\s+is\b)/gi, 'find time'],
];

function normalizeIdioms(query: string): string {
  return IDIOM_REWRITES.reduce((q, [pattern, replacement]) => q.replace(pattern, replacement), query);
}

// Many ways to ask for the same thing — this list is deliberately generous
// rather than a fixed phrasing, since the real gate against nonsense is the
// coverage check in findCandidates below (every other variable in the
// matched formula still has to be accounted for), not this pattern list.
const TARGET_PATTERNS = [
  /\bformula for\s+(?:the\s+)?(.+)/i,
  /\bsolve for\s+(?:the\s+)?(.+)/i,
  /\bcalculate\s+(?:the\s+)?(.+)/i,
  /\bcompute\s+(?:the\s+)?(.+)/i,
  /\bdetermine\s+(?:the\s+)?(.+)/i,
  /\bfind\s+(?:the\s+)?(.+)/i,
  // "'s"/"is" is optional — "what velocity" names the target exactly as
  // directly as "what is velocity" does, just without an explicit ask; if
  // this pattern required "is" like the other lead-ins do, that phrase
  // would fall through to being scored as a plain clause instead, which
  // works for a longer word (found via containment) but not a formula
  // whose only free variable resolves to a single bare symbol.
  // Covers "what is the value of X" too — "of" isn't a cut word, and
  // conceptScore's containment matching finds X inside the wider phrase
  // regardless of what else the sentence wraps around it.
  /\bwhat(?:'s|\s+is)?\s+(?:the\s+)?(.+)/i,
  /\bhow (?:do|can|would) (?:i|you|we)\s+(?:find|calculate|determine|get|compute)\s+(?:the\s+)?(.+)/i,
  // "how much/many X" genuinely names a concept afterward ("how much
  // energy"); "how fast/far/long" don't — the concept they imply
  // (velocity/distance/time) is the adverb itself, handled by
  // normalizeIdioms below before any of these patterns run.
  /\bhow (?:much|many)\s+(?:is|was)?\s*(?:the\s+)?(.+)/i,
  /\bi (?:need|want)(?:\s+to\s+(?:find|know|calculate))?\s+(?:the\s+)?(.+)/i,
  /\bgive me\s+(?:the\s+)?(.+)/i,
  /\bget\s+(?:the\s+)?(.+)/i,
  /\btell me\s+(?:the\s+)?(.+)/i,
  // No lead-in at all — just "<quantity> when <knowns>" ("volume when r = 6").
  // Only a plain-words prefix counts; anything with a digit or "=" before the
  // connector is a known value, not a target.
  /^\s*(?:the\s+)?([a-zA-Z][a-zA-Z\s]*?\s+(?:when|if|given|knowing|where|for|with)\b.*)$/i,
];

// Where a target phrase captured above should stop — right before whatever
// starts describing the *known* values, regardless of which connector word
// (if any) introduces them.
// A digit right after a letter or "_" ("m1", "q_2") is a subscript, and one
// after "^" is an exponent ("m/s^2") — neither is a value.
const NUM = String.raw`(?<![a-zA-Z_^])-?\d+(?:\.\d+)?`;
const NUMBER_RE_SRC = NUM;
const UNIT_WORD = String.raw`[a-zA-Zµμ°%Ω][a-zA-Zµμ°%/²³Ω·^\d*-]*`;
// A unit is one word ("cm", "feet") or a short phrase ("square meters",
// "meters per second", "meters squared").
const UNIT_TOKEN = String.raw`(?:(?:square|sq|cubic)\s+)?${UNIT_WORD}(?:\s+per\s+${UNIT_WORD})?(?:\s+(?:squared|cubed))?`;
const TARGET_CUT_RE = /[,;]|\b(when|if|given|knowing|since|because|and|know|with)\b|(?<![a-zA-Z_^])\d/i;
// The connector between a quantity's name and its value is optional — a
// bare space ("mass 5 kg") works exactly like "mass = 5 kg" or "mass is
// 5 kg". Matched with backtracking so a value clause containing an
// incidental "of"/"is" elsewhere (e.g. "speed of light") still resolves to
// the rightmost number, not the first stray keyword.
const VALUE_CLAUSE_RE = new RegExp(
  String.raw`^(.+?)(?:=|:|\bis\b|\bwas\b|\bequals\b|\bequal to\b|\bof\b)?\s*(${NUM})\s*(${UNIT_TOKEN})?\s*$`,
  'i',
);
// The number can just as easily come first ("5 kg mass", "12 V of
// voltage") — VALUE_CLAUSE_RE anchors the number+unit at the very end of
// the clause, so this handles the mirror image instead of trying to cram
// both directions into one pattern.
const VALUE_CLAUSE_REVERSED_RE = new RegExp(
  String.raw`^\s*(${NUM})\s*(${UNIT_TOKEN})?\s+(?:of\s+)?(.+?)\s*$`,
  'i',
);

// A unit only counts if it actually parses ("kg", "cm", "m/s^2"); anything
// else ("fast") was never a unit and is ignored, as it always was.
function validUnit(unit: string | undefined): string | undefined {
  return unit && parseUnit(unit) ? unit : undefined;
}

function matchValueClause(text: string): { phrase: string; value: number; unit?: string } | null {
  const forward = text.match(VALUE_CLAUSE_RE);
  if (forward) {
    const value = Number(forward[2]);
    const phrase = forward[1].trim();
    if (Number.isFinite(value) && phrase) return { phrase, value, unit: validUnit(forward[3]) };
  }
  const reversed = text.match(VALUE_CLAUSE_REVERSED_RE);
  if (reversed) {
    const value = Number(reversed[1]);
    const unit = validUnit(reversed[2]);
    // "6 radius": the word after the number wasn't a unit, it was the name.
    const phrase = (unit || !reversed[2] ? reversed[3] : `${reversed[2]} ${reversed[3]}`).trim();
    if (Number.isFinite(value) && phrase) return { phrase, value, unit };
  }
  return null;
}

interface TargetMatch {
  phrase: string;
  // The query with the target's own lead-in ("formula for"), its phrase,
  // and the connector word that introduced the knowns (if any — "when",
  // a comma, ...) all removed. Value clauses are scanned from this rather
  // than the raw query so a short symbol like "P₁" — which, being a single
  // letter once its subscript is stripped for comparison, needs an *exact*
  // normalized match — doesn't fail just because "when" or the target
  // phrase itself is still glued to the front of the next clause.
  remainder: string;
}

function extractTargetPhrase(query: string): TargetMatch | null {
  for (const pattern of TARGET_PATTERNS) {
    const m = query.match(pattern);
    if (!m || m.index === undefined) continue;
    const restStart = m.index + (m[0].length - m[1].length);
    const rest = m[1];
    const cutMatch = rest.match(TARGET_CUT_RE);
    const cutEnd = cutMatch?.index !== undefined ? cutMatch.index + cutMatch[0].length : rest.length;
    const phrase = rest.slice(0, cutMatch?.index ?? rest.length).trim();
    if (!phrase) continue;
    const remainder = query.slice(0, m.index) + ' ' + query.slice(restStart + cutEnd);
    return { phrase, remainder };
  }
  // A short trailing "...velocity?" with no number in it — asking a direct
  // question without any of the lead-in phrases above.
  const q = query.match(/([a-zA-Z][a-zA-Z\s]{1,40})\?\s*$/);
  if (q && q.index !== undefined && !/\d/.test(q[1])) {
    return { phrase: q[1].trim(), remainder: query.slice(0, q.index) + query.slice(q.index + q[0].length) };
  }
  return null;
}

// A chunk that itself contains two or more numbers wasn't actually one
// clause — it's several quantities run together with no separating word at
// all ("mass 5kg velocity 3m/s"). Re-splits it at each number, using
// whatever text sits between the previous number and this one as that
// quantity's name.
function splitByEmbeddedNumbers(chunk: string): KnownClause[] {
  const positions: { start: number; end: number }[] = [];
  const re = new RegExp(NUMBER_RE_SRC, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) positions.push({ start: m.index, end: m.index + m[0].length });
  if (positions.length < 2) return [];

  const clauses: KnownClause[] = [];
  let cursor = 0;
  positions.forEach((pos) => {
    const phrase = chunk
      .slice(cursor, pos.start)
      .replace(/(?:=|:|\bis\b|\bwas\b|\bequals?\b|\bequal to\b|\bof\b)\s*$/i, '')
      .replace(/^\s*(and|,|;)\s*/i, '')
      .trim();
    // A unit sits right after its number ("6 cm", "3m/s") — unless what
    // follows is itself a variable being defined ("6 m = 5"), in which case
    // it's the next clause's name, not this one's unit.
    const after = chunk.slice(pos.end);
    let unit: string | undefined;
    let end = pos.end;
    for (const src of [UNIT_TOKEN, UNIT_WORD]) {
      const unitMatch = after.match(new RegExp(String.raw`^\s*(${src})`));
      if (unitMatch && !/^\s*[=:]/.test(after.slice(unitMatch[0].length)) && validUnit(unitMatch[1])) {
        unit = unitMatch[1];
        end = pos.end + unitMatch[0].length;
        break;
      }
    }
    cursor = end;
    if (phrase) clauses.push({ phrase, value: Number(chunk.slice(pos.start, pos.end)), unit });
  });
  return clauses;
}

function parseKnownClauses(knownsText: string): KnownClause[] {
  if (!knownsText) return [];
  return knownsText
    .split(/\band\b|[,;]/i)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .flatMap((clause) => {
      const numberCount = (clause.match(new RegExp(NUMBER_RE_SRC, 'g')) ?? []).length;
      // Two-plus numbers means this "clause" is actually several quantities
      // run together with no and/,/; between them ("mass 5kg velocity
      // 3m/s") — split those apart first. Checked before the single-value
      // match below because that regex's lazy phrase group would otherwise
      // happily swallow an earlier number as if it were part of the name.
      if (numberCount >= 2) {
        const embedded = splitByEmbeddedNumbers(clause);
        if (embedded.length > 0) return embedded;
      } else if (numberCount === 1) {
        const match = matchValueClause(clause);
        if (match) return [{ phrase: match.phrase, value: match.value, unit: match.unit }];
      }
      return [{ phrase: clause }];
    });
}

// The real filter against nonsense is findCandidates's coverage check
// (every other variable in whatever formula it tries still has to be
// accounted for) — this gate only needs to rule out single bare keywords
// ("mass") so a plain substring search isn't slowed down for nothing.
export function looksLikeNaturalQuery(query: string): boolean {
  const s = query.trim();
  if (!s) return false;
  if (/\d/.test(s)) return true;
  return s.split(/\s+/).length >= 2;
}



interface VarMeta {
  key: string;
  symbol: string;
  meaning: string;
  dim: Dim | null;
  // A handful of constants (g, the gas constant, G, ...) already carry a
  // standard value in the formula data — FormulaCalculator pre-fills them
  // the same way, so a sentence that never mentions "gravity" at all
  // shouldn't be treated as missing information any more than leaving that
  // field untouched in the calculator itself would be.
  defaultValue?: number;
}

// One solvable equation: a formula's own calc, or one shape of a
// multi-shape card ("Area Formulas" -> Circle). Each is matched on its own,
// so "r = 6" can surface the circle's area *and* the sphere's volume.
interface Card {
  formula: Formula;
  variantIndex?: number;
  title: string;
  latex: string;
  calc: FormulaCalc;
  variables: Variable[];
}

let cachedCards: Card[] | null = null;

function getCards(): Card[] {
  if (cachedCards) return cachedCards;
  const cards: Card[] = [];
  for (const formula of formulas) {
    if (formula.calc) {
      cards.push({
        formula,
        title: formula.title,
        latex: formula.latex,
        calc: formula.calc,
        variables: formula.variables,
      });
    }
    formula.variants?.forEach((variant, variantIndex) => {
      if (!variant.calc) return;
      cards.push({
        formula,
        variantIndex,
        title: `${formula.title} — ${variant.label}`,
        latex: variant.latex,
        calc: variant.calc,
        variables: variant.variables,
      });
    });
  }
  cachedCards = cards;
  return cards;
}

function greedyMatch(vars: VarMeta[], clauses: KnownClause[]): Map<string, { meta: VarMeta; clause: KnownClause }> {
  const claimed = new Set<number>();
  const matched = new Map<string, { meta: VarMeta; clause: KnownClause }>();
  for (const meta of vars) {
    let bestIdx = -1;
    let bestScore = 0;
    clauses.forEach((clause, i) => {
      if (claimed.has(i)) return;
      const score = varScore(clause.phrase, meta);
      // A constant (c, g, R, ...) only takes a number when the sentence
      // names it outright — not because "velocity" happens to sit inside
      // "speed of light".
      if (meta.defaultValue !== undefined && score < 90) return;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      matched.set(meta.key, { meta, clause: clauses[bestIdx] });
      claimed.add(bestIdx);
    }
  }
  return matched;
}

interface Candidate {
  card: Card;
  target: VarMeta;
  allVars: VarMeta[];
  matched: Map<string, { meta: VarMeta; clause: KnownClause }>;
  score: number;
  // How well the asked-for quantity matched this equation's own variable
  // (0 when the target was inferred by elimination).
  targetScore: number;
}

// Every equation the sentence can be applied to, best first — not just the
// single best one, so a lone "r = 6" reaches the circle's circumference,
// area and the sphere's volume alike.
function findCandidates(targetPhrase: string | null, clauses: KnownClause[]): Candidate[] {
  const found: Candidate[] = [];

  for (const card of getCards()) {
    const allVars: VarMeta[] = card.calc.vars.map((v) => {
      const meaning = meaningForCalcVar(card.variables, v);
      return { key: v.key, symbol: v.symbol, meaning, dim: dimForMeaning(meaning), defaultValue: v.defaultValue };
    });

    let target: VarMeta | null = null;
    let targetScore = 0;
    if (targetPhrase) {
      for (const meta of allVars) {
        const score = varScore(targetPhrase, meta);
        if (score > targetScore) {
          targetScore = score;
          target = meta;
        }
      }
      if (!target) continue;
    }

    const pool = target ? allVars.filter((v) => v.key !== target!.key) : allVars;
    const matched = greedyMatch(pool, clauses);

    if (!target) {
      // A var with a default (g, R, ...) is never a sensible thing to
      // solve for by elimination — it's the one variable a sentence would
      // have no reason to omit on purpose, so it doesn't count as "the
      // one left over" the way a genuinely unmentioned quantity does.
      const unmatched = pool.filter((v) => !matched.has(v.key) && v.defaultValue === undefined);
      if (unmatched.length !== 1) continue;
      target = unmatched[0];
    }

    const required = allVars.filter((v) => v.key !== target!.key);
    const covered = required.every((v) => matched.has(v.key) || v.defaultValue !== undefined);
    if (!covered) continue;

    found.push({ card, target, allVars, matched, score: matched.size * 10 + (targetPhrase ? 5 : 0), targetScore });
  }

  // When the sentence names what it wants, only the equations whose variable
  // is the best match for that name count — "velocity" shouldn't also pull in
  // E = mc² just because "speed of light" contains the word.
  const bestTarget = Math.max(0, ...found.map((c) => c.targetScore));
  return found.filter((c) => c.targetScore === bestTarget).sort((a, b) => b.score - a.score);
}

const MAX_RESULTS = 6;

function buildResult(candidate: Candidate): SmartQueryResult | null {
  const { card, target, allVars, matched } = candidate;

  // Units the sentence spelled out ("6 cm", "3 km/h") define the system the
  // answer comes back in — first one named per dimension wins. Anything the
  // sentence left unit-less is read in that same system; nothing is pulled
  // over to SI unless no unit was given at all.
  const system: UnitSystem = {};
  for (const meta of allVars) {
    const unit = matched.get(meta.key)?.clause.unit;
    const parsed = unit ? parseUnit(unit) : null;
    if (!parsed) continue;
    for (const [axis, choice] of Object.entries(parsed.axes)) {
      if (!system[Number(axis)]) system[Number(axis)] = choice;
    }
  }

  const siValues: Record<string, number> = {};
  const prefill: Record<string, number> = {};
  const knowns: KnownValue[] = [];
  let allHaveValues = true;
  let anyMatched = false;

  for (const meta of allVars) {
    if (meta.key === target.key) continue;
    const found = matched.get(meta.key);
    if (found) anyMatched = true;
    const typed = found?.clause.value;
    const value = typed ?? meta.defaultValue;
    if (value === undefined) {
      allHaveValues = false;
      continue;
    }

    let si = value;
    let inSystem = value;
    // What the "Using ..." line shows: exactly what was typed when it came
    // with a unit, otherwise the value in the answer's unit system.
    let shown = value;
    let unitLabel: string | null;
    const siLabel = unitForMeaning(meta.meaning);
    const parsed = typed !== undefined && found?.clause.unit ? parseUnit(found.clause.unit) : null;

    if (parsed) {
      // A unit of the wrong kind ("radius = 6 s") means this equation isn't
      // what the sentence is about.
      if (meta.dim && !sameDim(parsed.dim, meta.dim)) return null;
      si = value * parsed.factor;
      inSystem = fromSI(si, parsed.dim, system);
      unitLabel = found!.clause.unit!;
    } else if (meta.dim) {
      if (typed !== undefined) {
        si = toSI(value, meta.dim, system);
      } else {
        si = value;
        inSystem = fromSI(value, meta.dim, system);
        shown = inSystem;
      }
      unitLabel = labelForDim(meta.dim, system, siLabel);
    } else {
      unitLabel = siLabel;
    }

    siValues[meta.key] = si;
    prefill[meta.key] = inSystem;
    knowns.push({ symbol: meta.symbol, meaning: meta.meaning, value: shown, unit: unitLabel });
  }

  const base = {
    formula: card.formula,
    variantIndex: card.variantIndex,
    title: card.title,
    latex: card.latex,
  };

  if (allHaveValues && anyMatched) {
    const si = solveForUnknown(card.calc.residual, siValues, target.key);
    if (si !== null) {
      const siLabel = unitForMeaning(target.meaning);
      return {
        kind: 'answer',
        ...base,
        targetSymbol: target.symbol,
        targetMeaning: target.meaning,
        targetUnit: target.dim ? labelForDim(target.dim, system, siLabel) : siLabel,
        value: target.dim ? fromSI(si, target.dim, system) : si,
        knowns,
        prefill,
      };
    }
  }

  return {
    kind: 'formula-match',
    ...base,
    targetSymbol: target.symbol,
    targetMeaning: target.meaning,
    prefill,
  };
}

export function parseSmartQuery(rawQuery: string): SmartQueryResult[] {
  const query = normalizeIdioms(rawQuery.trim());
  if (!looksLikeNaturalQuery(query)) return [];

  // Falling back to scanning the *whole* query when no target pattern
  // matched (rather than only ever using a carved-out remainder) means a
  // free-form list of quantities with no "solve for"/"when" structure at
  // all — "mass 5kg kinetic energy 100j", "r = 6" — still gets scanned in
  // full for elimination-based target inference to work with.
  const targetMatch = extractTargetPhrase(query);
  const clauses = parseKnownClauses(targetMatch?.remainder ?? query);
  // Without an explicit target phrase or any actual numbers, elimination
  // has nothing but concept-only clauses to go on — and a single bare
  // phrase ("kinetic energy") partial-matches virtually any formula that
  // mentions energy, at which point elimination will confidently "solve
  // for" whatever's left over purely by accident. Two or more distinct
  // concepts is the minimum that makes elimination meaningful; a lone
  // phrase is just a keyword search and should fall through to one.
  const hasValue = clauses.some((c) => c.value !== undefined);
  if (!targetMatch && !hasValue && clauses.length < 2) return [];

  const results = findCandidates(targetMatch?.phrase ?? null, clauses)
    .map(buildResult)
    .filter((r): r is SmartQueryResult => r !== null);

  // Worked answers first, then formulas that only matched.
  const answers = results.filter((r) => r.kind === 'answer');
  const matches = results.filter((r) => r.kind === 'formula-match');
  return [...answers, ...matches].slice(0, MAX_RESULTS);
}
