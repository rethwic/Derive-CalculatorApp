import { createContext, useContext } from 'react';
import type { Formula } from '../types';

export interface DetailContextValue {
  // `prefill` carries calc-var values the smart search already parsed out
  // of a sentence (e.g. "mass = 5 kg") so the calculator opens with those
  // filled in instead of blank.
  openDetail: (formula: Formula, rect: DOMRect | null, prefill?: Record<string, number>) => void;
}

export const DetailContext = createContext<DetailContextValue | null>(null);

export function useDetail(): DetailContextValue {
  const ctx = useContext(DetailContext);
  if (!ctx) throw new Error('useDetail must be used within DetailContext.Provider');
  return ctx;
}
