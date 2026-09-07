import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Katex } from './Katex';
import { searchFormulas } from '../lib/search';
import { parseSmartQuery, looksLikeNaturalQuery, type SmartQueryResult } from '../lib/smartQuery';
import { askAI } from '../lib/aiSearch';
import { formulas } from '../data/formulas';
import { categoryMap } from '../data/categories';
import { useDetail } from '../context/DetailContext';

// Mirrors FormulaCalculator's own number formatting so a smart-search
// answer and the same value found by hand in the calculator read
// identically.
function formatValue(n: number): string {
  if (n !== 0 && (Math.abs(n) < 1e-4 || Math.abs(n) >= 1e9)) return n.toExponential(4);
  return String(Number(n.toPrecision(6)));
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const RESULTS_GAP = 12;

function expandedTarget() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(600, vw - 48);
  return { left: (vw - width) / 2, top: vh * 0.32, width };
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Separate from `expanded`: stays true for the whole time the expanded bar
  // is visually present, including its exit animation. `expanded` alone
  // isn't enough — it flips false the instant you click out, which used to
  // make the resting trigger reappear immediately while the panel was still
  // sliding back to that exact spot, reading as two overlapping bars.
  const [triggerHidden, setTriggerHidden] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const { openDetail } = useDetail();

  // The local pattern-matcher runs instantly on every keystroke, same as
  // always. The AI only ever runs once, on Enter (see the input's
  // onKeyDown below) — its result, once it lands, takes over from the
  // local guess; a plain `null` (no confident match, or the request
  // failed) just leaves the local guess standing rather than blanking it.
  const [aiResult, setAiResult] = useState<SmartQueryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiRequestIdRef = useRef(0);

  const localSmart = useMemo<SmartQueryResult | null>(() => parseSmartQuery(query), [query]);
  const smart = aiResult ?? localSmart;
  const results = useMemo(
    () => searchFormulas(formulas, query)
      .filter((f) => f.id !== smart?.formula.id)
      .slice(0, 8),
    [query, smart],
  );
  const showResults = expanded && query.trim().length > 0;

  function updateQuery(next: string) {
    setQuery(next);
    aiRequestIdRef.current += 1;
    setAiResult(null);
    setAiLoading(false);
  }

  function askAIForCurrentQuery() {
    if (!looksLikeNaturalQuery(query)) return;
    const requestId = ++aiRequestIdRef.current;
    setAiLoading(true);
    askAI(query)
      .then((result) => {
        if (aiRequestIdRef.current !== requestId) return;
        setAiResult(result);
        setAiLoading(false);
      })
      .catch(() => {
        if (aiRequestIdRef.current !== requestId) return;
        setAiLoading(false);
      });
  }

  function openExpanded() {
    if (restRef.current) setOrigin(restRef.current.getBoundingClientRect());
    setTriggerHidden(true);
    setExpanded(true);
  }

  function closeExpanded() {
    setExpanded(false);
    setQuery('');
    // triggerHidden is cleared by AnimatePresence's onExitComplete below,
    // once the bar has actually finished animating back to origin.
  }

  const target = expandedTarget();

  return (
    <div className="global-search">
      {/* The resting trigger — not a real input, just what you click to
          physically expand the bar into place. Kept in the layout (just
          invisible) while expanded, so nothing else on the page shifts. */}
      <div
        ref={restRef}
        className="search-bar glass"
        style={{ visibility: triggerHidden ? 'hidden' : 'visible', cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        aria-label="Search formulas, symbols, topics"
        onClick={openExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openExpanded();
          }
        }}
      >
        <SearchIcon />
        <span className="search-bar-placeholder">Search formulas, symbols, topics…</span>
      </div>

      <AnimatePresence onExitComplete={() => setTriggerHidden(false)}>
        {expanded && origin && (
          <>
            <motion.div
              className="search-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeExpanded}
            />

            {/* The bar: only left/top/width/borderRadius are animated —
                height is fixed at origin.height throughout, matching the
                resting trigger's own font/padding exactly, so the box
                never grows taller than its content actually needs. That
                mismatch (an arbitrary taller target height than the
                content's real size) was what read as "out of shape". */}
            <motion.div
              className="search-expand-panel glass"
              initial={{
                left: origin.left,
                top: origin.top,
                width: origin.width,
                height: origin.height,
                borderRadius: 999,
              }}
              animate={{
                left: target.left,
                top: target.top,
                width: target.width,
                height: origin.height,
                borderRadius: 999,
              }}
              exit={{
                left: origin.left,
                top: origin.top,
                width: origin.width,
                height: origin.height,
                borderRadius: 999,
                transition: { duration: 0.22 },
              }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            >
              <div className="search-bar-inner">
                <SearchIcon />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => updateQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeExpanded();
                    if (e.key === 'Enter') askAIForCurrentQuery();
                  }}
                  placeholder="Search formulas, symbols, topics…"
                  spellCheck={false}
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Clear search"
                    onClick={() => updateQuery('')}
                  >
                    ×
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Results: a completely separate card, positioned just below the
          bar's fixed target spot. It grows/shrinks/fades on its own as the
          result count changes — fully decoupled from the bar above, so
          retyping never causes the bar itself to visibly reform. */}
      <AnimatePresence>
        {showResults && origin && (
          <motion.div
            className="search-results-card glass"
            layout
            style={{ left: target.left, top: target.top + origin.height + RESULTS_GAP, width: target.width }}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            {!smart && results.length === 0 && !aiLoading ? (
              <div className="search-empty">No formulas found</div>
            ) : (
              <>
                {aiLoading && <div className="search-ai-loading">Asking AI…</div>}
                {smart && smart.kind === 'answer' && (
                  <button
                    type="button"
                    className="search-smart-answer"
                    onClick={(e) => {
                      openDetail(smart.formula, e.currentTarget.getBoundingClientRect(), smart.prefill);
                      closeExpanded();
                    }}
                  >
                    <div className="search-smart-answer-value">
                      {smart.targetSymbol} ≈ {formatValue(smart.value)}
                      {smart.targetUnit ? ` ${smart.targetUnit}` : ''}
                    </div>
                    <div className="search-smart-answer-source">
                      <Katex math={smart.formula.latex} />
                      <span>{smart.formula.title}</span>
                    </div>
                    {smart.knowns.length > 0 && (
                      <div className="search-smart-answer-knowns">
                        Using{' '}
                        {smart.knowns.map((k, i) => (
                          <span key={k.symbol}>
                            {i > 0 ? ', ' : ''}
                            {k.symbol} = {formatValue(k.value)}
                            {k.unit ? ` ${k.unit}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                )}
                {smart && smart.kind === 'formula-match' && (
                  <button
                    type="button"
                    className="search-result search-result-smart"
                    onClick={(e) => {
                      openDetail(smart.formula, e.currentTarget.getBoundingClientRect(), smart.prefill);
                      closeExpanded();
                    }}
                  >
                    <span className="search-result-formula">
                      <Katex math={smart.formula.latex} />
                    </span>
                    <span className="search-result-meta">
                      <span className="search-result-title">{smart.formula.title}</span>
                      {smart.targetMeaning && (
                        <span className="search-result-badge">Solve for {smart.targetMeaning.toLowerCase()}</span>
                      )}
                    </span>
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {results.map((f) => {
                    const cat = categoryMap[f.category];
                    return (
                      <motion.button
                        key={f.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ layout: { duration: 0.18 }, opacity: { duration: 0.12 } }}
                        type="button"
                        className="search-result"
                        onClick={(e) => {
                          openDetail(f, e.currentTarget.getBoundingClientRect());
                          closeExpanded();
                        }}
                      >
                        <span className="search-result-formula">
                          <Katex math={f.latex} />
                        </span>
                        <span className="search-result-meta">
                          <span className="search-result-title">{f.title}</span>
                          <span className="search-result-category">{cat.name}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
