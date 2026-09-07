// A Vercel Function (not a Next.js route — this project is a plain Vite
// SPA, so Vercel's zero-config "other framework" convention applies: any
// file under /api exporting a default { fetch(request) } object becomes an
// endpoint at that path).
//
// This endpoint's only job is understanding the sentence: which formula is
// being asked about, which of its variables is the target, and what
// numeric values (if any) were given for the rest. It never does the
// arithmetic itself — the actual solve happens back on the client with the
// same deterministic Newton-Raphson solver the manual calculator uses
// (buildResult in src/lib/smartQuery.ts), so a language-model mistake can
// misidentify a formula but can never produce a wrong number for a
// correctly identified one.
import { GoogleGenAI, Type } from '@google/genai';
import { formulas } from '../src/data/formulas';
import { meaningForCalcVar } from '../src/lib/smartQuery';

const MODEL = 'gemini-2.5-flash';

// The full formula list, cut down to exactly what the model needs to pick
// one and name its variables — no LaTeX, no residual functions (those
// aren't serializable and the model has no use for them anyway).
const CATALOG = formulas
  .filter((f) => f.calc)
  .map((f) => ({
    id: f.id,
    title: f.title,
    variables: f.calc!.vars.map((v) => ({ key: v.key, meaning: meaningForCalcVar(f, v) })),
  }));

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    matched: {
      type: Type.BOOLEAN,
      description: 'True only if exactly one formula in the catalog answers the question.',
    },
    formulaId: {
      type: Type.STRING,
      nullable: true,
      description: 'The id of the matched formula from the catalog, or null if matched is false.',
    },
    targetKey: {
      type: Type.STRING,
      nullable: true,
      description: "The matched formula's variable key being solved for, or null if matched is false.",
    },
    knownValues: {
      type: Type.ARRAY,
      description: "Every variable key from the matched formula the question gave a numeric value for. Convert units to the formula's implied SI units first (e.g. grams to kilograms, minutes to seconds).",
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          value: { type: Type.NUMBER },
        },
        required: ['key', 'value'],
      },
    },
  },
  required: ['matched'],
};

function buildPrompt(query: string): string {
  return [
    'You are the search understanding layer for a physics/math/chemistry formula reference site.',
    "Given a person's question and a catalog of formulas (each with an id and its variables' keys and meanings), decide which single formula (if any) answers the question, which variable they want solved for, and what numeric values they already gave for the others.",
    '',
    'Rules:',
    '- Only set matched=true if exactly one formula in the catalog is clearly what they mean. If the question is too vague, mentions no formula in the catalog, or could equally mean several different formulas, set matched=false and leave the other fields null.',
    '- targetKey must be one of that formula\'s own variable keys.',
    '- knownValues must only include variables from that same formula, using its exact key strings — never invent a key that is not listed for that formula.',
    '- If a value is given in different units than the formula would naturally use (e.g. grams instead of kilograms, minutes instead of seconds, km/h instead of m/s), convert it to the base SI unit before reporting the number.',
    '- Never guess a numeric value that was not stated or clearly implied.',
    '',
    `Formula catalog (JSON): ${JSON.stringify(CATALOG)}`,
    '',
    `Question: ${query}`,
  ].join('\n');
}

interface AiResult {
  matched: boolean;
  formulaId?: string | null;
  targetKey?: string | null;
  knownValues?: { key: string; value: number }[];
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI search is not configured' }), { status: 500 });
    }

    let query: unknown;
    try {
      const body = await request.json();
      query = (body as { query?: unknown }).query;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
    }
    if (typeof query !== 'string' || !query.trim()) {
      return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400 });
    }

    let result: AiResult;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: buildPrompt(query),
        config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      });
      result = JSON.parse(response.text ?? '{}') as AiResult;
    } catch (err) {
      console.error('AI search failed', err);
      return new Response(JSON.stringify({ error: 'AI search is temporarily unavailable' }), { status: 502 });
    }

    // Trust nothing from the model beyond "which formula, which key" — the
    // catalog above only tells it what those keys *should* be, it doesn't
    // stop a model from answering with one anyway.
    if (!result.matched || !result.formulaId) {
      return Response.json({ matched: false });
    }
    const formula = formulas.find((f) => f.id === result.formulaId);
    if (!formula?.calc) {
      return Response.json({ matched: false });
    }
    const validKeys = new Set(formula.calc.vars.map((v) => v.key));
    if (!result.targetKey || !validKeys.has(result.targetKey)) {
      return Response.json({ matched: false });
    }
    const knownValues = (result.knownValues ?? []).filter(
      (kv) => validKeys.has(kv.key) && kv.key !== result.targetKey && Number.isFinite(kv.value),
    );

    return Response.json({ matched: true, formulaId: formula.id, targetKey: result.targetKey, knownValues });
  },
};
