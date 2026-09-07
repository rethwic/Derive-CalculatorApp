import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Katex } from './Katex';
import { categoryMap } from '../data/categories';
import { formulas } from '../data/formulas';
import { searchFormulas } from '../lib/search';
import type { Formula } from '../types';

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
  return { left: (vw - width) / 2, top: vh * 0.14, width };
}

// Same origin-rect-to-target-rect morph GlobalSearch uses, just starting
// from a small round icon button instead of a resting pill bar.
export function WorkspaceSearchLauncher({ onSelect }: { onSelect: (formula: Formula) => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [triggerHidden, setTriggerHidden] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const restRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => searchFormulas(formulas, query).slice(0, 8), [query]);
  const showResults = expanded && query.trim().length > 0;

  function openExpanded() {
    if (restRef.current) setOrigin(restRef.current.getBoundingClientRect());
    setTriggerHidden(true);
    setExpanded(true);
  }

  function closeExpanded() {
    setExpanded(false);
    setQuery('');
  }

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeExpanded();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const target = expandedTarget();

  return (
    <>
      <button
        ref={restRef}
        type="button"
        className="workspace-edge-icon glass"
        style={{ visibility: triggerHidden ? 'hidden' : 'visible' }}
        aria-label="Add a formula"
        onClick={openExpanded}
      >
        <SearchIcon />
      </button>

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

            <motion.div
              className="search-expand-panel glass"
              initial={{
                left: origin.left,
                top: origin.top,
                width: origin.width,
                height: origin.height,
                borderRadius: origin.width / 2,
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
                borderRadius: origin.width / 2,
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
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeExpanded();
                  }}
                  placeholder="Add a formula…"
                  spellCheck={false}
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    ×
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
            {results.length === 0 ? (
              <div className="search-empty">No formulas found</div>
            ) : (
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
                      onClick={() => {
                        onSelect(f);
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
