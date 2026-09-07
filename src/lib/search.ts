import type { Formula } from '../types';

function matchesQuery(formula: Formula, q: string): boolean {
  const hay = [
    formula.title,
    formula.label,
    formula.category,
    ...(formula.keywords ?? []),
    ...formula.variables.map((v) => `${v.symbol} ${v.meaning}`),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function searchFormulas(formulas: Formula[], query: string): Formula[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return formulas.filter((f) => matchesQuery(f, q));
}
