// The client side of the AI search route (api/search.ts). Mirrors
// parseSmartQuery's contract exactly — same SmartQueryResult shape, same
// null-means-"nothing confident enough to show" convention — so the search
// UI doesn't need to know which understanding path produced a result.
import { formulas } from '../data/formulas';
import { buildResult, type SmartQueryResult } from './smartQuery';

interface AiSearchResponse {
  matched: boolean;
  formulaId?: string;
  targetKey?: string;
  knownValues?: { key: string; value: number }[];
}

export async function askAI(query: string): Promise<SmartQueryResult | null> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as AiSearchResponse;
  if (!data.matched || !data.formulaId || !data.targetKey) return null;

  const formula = formulas.find((f) => f.id === data.formulaId);
  if (!formula) return null;

  const explicitValues: Record<string, number> = {};
  for (const kv of data.knownValues ?? []) explicitValues[kv.key] = kv.value;

  return buildResult(formula, data.targetKey, explicitValues);
}
