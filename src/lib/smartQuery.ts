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

const TARGET_PATTERNS = [
  /\bformula for\s+(.+)/i,
  /\bsolve for\s+(.+)/i,
  /\bcalculate\s+(.+)/i,
  /\bfind\s+(.+)/i,
  /\bwhat(?:'s| is)\s+(.+)/i,
];

const CONNECTOR_RE = /\b(when|if|given|knowing|since|because)\b/i;
const LEADING_FILLER_RE = /^\s*(i know that|i know|given that|given|knowing|if)\b\s*/i;
const VALUE_CLAUSE_RE = /^(.+?)(?:=|is|equals|of)\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Zµμ°%/²Ω·]*)\s*$/i;

function splitTargetAndKnowns(query: string): { targetPhrase: string | null; knownsText: string } {
  for (const pattern of TARGET_PATTERNS) {
    const m = query.match(pattern);
    if (!m) continue;
    const rest = m[1].trim();
    const connectorMatch = rest.match(CONNECTOR_RE);
    if (connectorMatch && connectorMatch.index !== undefined) {
      return {
        targetPhrase: rest.slice(0, connectorMatch.index).trim(),
        knownsText: rest.slice(connectorMatch.index + connectorMatch[0].length).trim(),
      };
    }
    return { targetPhrase: rest, knownsText: '' };
  }
  return { targetPhrase: null, knownsText: query.replace(LEADING_FILLER_RE, '').trim() };
}

function parseKnownClauses(knownsText: string): KnownClause[] {
  if (!knownsText) return [];
  return knownsText
    .split(/\band\b|[,;]/i)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((clause) => {
      const m = clause.match(VALUE_CLAUSE_RE);
      if (m) {
        const value = Number(m[2]);
        if (Number.isFinite(value)) return { phrase: m[1].trim(), value, unit: m[3] || undefined };
      }
      return { phrase: clause };
    });
}

export function looksLikeNaturalQuery(query: string): boolean {
  const s = query.trim();
  if (s.split(/\s+/).length < 3) return false;
  const lower = s.toLowerCase();
  if (TARGET_PATTERNS.some((p) => p.test(lower))) return true;
  if (/\bknow\b/.test(lower)) return true;
  if (/\d/.test(s)) return true;
  return false;
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
  const query = rawQuery.trim();
  if (!looksLikeNaturalQuery(query)) return null;

  const { targetPhrase, knownsText } = splitTargetAndKnowns(query);
  const clauses = parseKnownClauses(knownsText || query);
  if (!targetPhrase && clauses.length === 0) return null;

  const candidate = findBestCandidate(targetPhrase, clauses);
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
