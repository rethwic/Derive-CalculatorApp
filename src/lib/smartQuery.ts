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
import type { CalcVar, Formula } from '../types';
import { formulas } from '../data/formulas';
import { solveForUnknown } from './solve';
import { unitForMeaning } from './units';

export interface KnownValue {
  symbol: string;
  meaning: string;
  value: number;
  unit: string | null;
}

export interface SmartAnswer {
  kind: 'answer';
  formula: Formula;
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

// calc.vars and formula.variables are two separate lists that happen to
// agree on symbols almost everywhere (a handful of formulas, e.g.
// gravitation's "m₁, m₂", combine two calc vars under one displayed
// variable) — matched by symbol containment rather than assuming a 1:1
// array correspondence.
function meaningForCalcVar(formula: Formula, calcVar: CalcVar): string {
  const exact = formula.variables.find((v) => v.symbol === calcVar.symbol);
  if (exact) return exact.meaning;
  const containing = formula.variables.find((v) => v.symbol.includes(calcVar.symbol));
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
// coverage check in findBestCandidate below (every other variable in the
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
];

// Where a target phrase captured above should stop — right before whatever
// starts describing the *known* values, regardless of which connector word
// (if any) introduces them.
const TARGET_CUT_RE = /[,;]|\b(when|if|given|knowing|since|because|and|know|with)\b|\d/i;
// The connector between a quantity's name and its value is optional — a
// bare space ("mass 5 kg") works exactly like "mass = 5 kg" or "mass is
// 5 kg". Matched with backtracking so a value clause containing an
// incidental "of"/"is" elsewhere (e.g. "speed of light") still resolves to
// the rightmost number, not the first stray keyword.
const VALUE_CLAUSE_RE =
  /^(.+?)(?:=|:|\bis\b|\bwas\b|\bequals\b|\bequal to\b|\bof\b)?\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Zµμ°%/²Ω·]*)\s*$/i;
// The number can just as easily come first ("5 kg mass", "12 V of
// voltage") — VALUE_CLAUSE_RE anchors the number+unit at the very end of
// the clause, so this handles the mirror image instead of trying to cram
// both directions into one pattern.
const VALUE_CLAUSE_REVERSED_RE = /^\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Zµμ°%/²Ω·]*)\s+(?:of\s+)?(.+?)\s*$/i;

function matchValueClause(text: string): { phrase: string; value: number; unit?: string } | null {
  const forward = text.match(VALUE_CLAUSE_RE);
  if (forward) {
    const value = Number(forward[2]);
    const phrase = forward[1].trim();
    if (Number.isFinite(value) && phrase) return { phrase, value, unit: forward[3] || undefined };
  }
  const reversed = text.match(VALUE_CLAUSE_REVERSED_RE);
  if (reversed) {
    const value = Number(reversed[1]);
    const phrase = reversed[3].trim();
    if (Number.isFinite(value) && phrase) return { phrase, value, unit: reversed[2] || undefined };
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
  const NUMBER_RE = /-?\d+(?:\.\d+)?/g;
  const positions: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = NUMBER_RE.exec(chunk))) positions.push({ start: m.index, end: m.index + m[0].length });
  if (positions.length < 2) return [];

  const clauses: KnownClause[] = [];
  positions.forEach((pos, i) => {
    const prevEnd = i === 0 ? 0 : positions[i - 1].end;
    const segment = chunk.slice(prevEnd, pos.end);
    const match = matchValueClause(segment);
    const phrase = match?.phrase.replace(/^\s*(and|,|;)\s*/i, '').trim();
    if (match && phrase) clauses.push({ phrase, value: match.value, unit: match.unit });
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
      const numberCount = (clause.match(/-?\d+(?:\.\d+)?/g) ?? []).length;
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

// The real filter against nonsense is findBestCandidate's coverage check
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
  // A handful of constants (g, the gas constant, G, ...) already carry a
  // standard value in the formula data — FormulaCalculator pre-fills them
  // the same way, so a sentence that never mentions "gravity" at all
  // shouldn't be treated as missing information any more than leaving that
  // field untouched in the calculator itself would be.
  defaultValue?: number;
}

function greedyMatch(vars: VarMeta[], clauses: KnownClause[]): Map<string, { meta: VarMeta; clause: KnownClause }> {
  const claimed = new Set<number>();
  const matched = new Map<string, { meta: VarMeta; clause: KnownClause }>();
  for (const meta of vars) {
    let bestIdx = -1;
    let bestScore = 0;
    clauses.forEach((clause, i) => {
      if (claimed.has(i)) return;
      const score = conceptScore(clause.phrase, meta.meaning);
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
  formula: Formula;
  target: VarMeta;
  allVars: VarMeta[];
  matched: Map<string, { meta: VarMeta; clause: KnownClause }>;
  score: number;
}

function findBestCandidate(targetPhrase: string | null, clauses: KnownClause[]): Candidate | null {
  let best: Candidate | null = null;

  for (const formula of formulas) {
    // Variant-only formulas (e.g. "Area Formulas") bundle several unrelated
    // shapes under one card with no single top-level variable set to match
    // a sentence against — out of scope here, the base `calc` case covers
    // every formula meant to be solved as one equation.
    if (!formula.calc) continue;
    const allVars: VarMeta[] = formula.calc.vars.map((v) => ({
      key: v.key,
      symbol: v.symbol,
      meaning: meaningForCalcVar(formula, v),
      defaultValue: v.defaultValue,
    }));

    let target: VarMeta | null = null;
    if (targetPhrase) {
      let bestScore = 0;
      for (const meta of allVars) {
        const score = conceptScore(targetPhrase, meta.meaning);
        if (score > bestScore) {
          bestScore = score;
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

    const score = matched.size * 10 + (targetPhrase ? 5 : 0);
    if (!best || score > best.score) {
      best = { formula, target, allVars, matched, score };
    }
  }

  return best;
}

export function parseSmartQuery(rawQuery: string): SmartQueryResult | null {
  const query = normalizeIdioms(rawQuery.trim());
  if (!looksLikeNaturalQuery(query)) return null;

  // Falling back to scanning the *whole* query when no target pattern
  // matched (rather than only ever using a carved-out remainder) means a
  // free-form list of quantities with no "solve for"/"when" structure at
  // all — "mass 5kg kinetic energy 100j" — still gets scanned in full for
  // findBestCandidate's elimination-based target inference to work with.
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
  if (!targetMatch && !hasValue && clauses.length < 2) return null;

  const candidate = findBestCandidate(targetMatch?.phrase ?? null, clauses);
  if (!candidate) return null;

  const { formula, target, allVars, matched } = candidate;
  const knownValues: Record<string, number> = {};
  const knowns: KnownValue[] = [];
  let allHaveValues = true;
  let anyMatched = false;
  for (const meta of allVars) {
    if (meta.key === target.key) continue;
    const found = matched.get(meta.key);
    const value = found?.clause.value ?? meta.defaultValue;
    if (found) anyMatched = true;
    if (value === undefined) {
      allHaveValues = false;
      continue;
    }
    knownValues[meta.key] = value;
    knowns.push({ symbol: meta.symbol, meaning: meta.meaning, value, unit: unitForMeaning(meta.meaning) });
  }

  if (allHaveValues && anyMatched) {
    const value = solveForUnknown(formula.calc!.residual, knownValues, target.key);
    if (value !== null) {
      return {
        kind: 'answer',
        formula,
        targetSymbol: target.symbol,
        targetMeaning: target.meaning,
        targetUnit: unitForMeaning(target.meaning),
        value,
        knowns,
        prefill: knownValues,
      };
    }
  }

  return {
    kind: 'formula-match',
    formula,
    targetSymbol: target.symbol,
    targetMeaning: target.meaning,
    prefill: knownValues,
  };
}
