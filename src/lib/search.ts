import type { Formula } from '../types';

export interface SearchHit {
  formula: Formula;
  // Set when the hit is one specific shape inside a multi-shape card (e.g.
  // the Sphere entry of "Volume Formulas"), so opening it lands on that shape.
  variantIndex?: number;
  title: string;
  latex: string;
}

const STOPWORDS = new Set(['of', 'a', 'an', 'the', 'for', 'in', 'on', 'to', 'and', 'is', 'what', 'how']);

function tokenize(query: string): string[] {
  const all = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : all;
}

// "areas" should find "area"; a substring test in either direction covers
// plurals without a stemmer.
function hasToken(hay: string, token: string): boolean {
  if (hay.includes(token)) return true;
  return token.length > 3 && token.endsWith('s') && hay.includes(token.slice(0, -1));
}

function baseText(formula: Formula): string {
  return [formula.title, formula.label, formula.category, ...(formula.keywords ?? [])].join(' ').toLowerCase();
}

export function searchFormulas(formulas: Formula[], query: string): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: { hit: SearchHit; score: number; order: number }[] = [];
  let order = 0;

  for (const formula of formulas) {
    const base = baseText(formula);
    const own = [
      base,
      ...formula.variables.map((v) => `${v.symbol} ${v.meaning}`),
    ]
      .join(' ')
      .toLowerCase();

    if (tokens.every((t) => hasToken(own, t))) {
      const titleHits = tokens.filter((t) => hasToken(`${formula.title} ${formula.label}`.toLowerCase(), t)).length;
      scored.push({
        hit: { formula, title: formula.title, latex: formula.latex },
        score: titleHits * 3 + (tokens.length - titleHits) + 1,
        order: order++,
      });
    }

    formula.variants?.forEach((variant, variantIndex) => {
      const label = variant.label.toLowerCase();
      const variantText = [
        base,
        label,
        ...variant.variables.map((v) => `${v.symbol} ${v.meaning}`),
      ]
        .join(' ')
        .toLowerCase();
      if (!tokens.every((t) => hasToken(variantText, t))) return;
      const labelHits = tokens.filter((t) => hasToken(label, t)).length;
      const titleHits = tokens.filter((t) => hasToken(`${formula.title} ${formula.label}`.toLowerCase(), t)).length;
      scored.push({
        hit: { formula, variantIndex, title: `${formula.title} — ${variant.label}`, latex: variant.latex },
        score: labelHits * 4 + titleHits * 3 + (tokens.length - labelHits - titleHits),
        order: order++,
      });
    });
  }

  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.hit);
}
