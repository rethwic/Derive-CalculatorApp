import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AnimatedRoutes } from './components/AnimatedRoutes';
import { TopBar } from './components/TopBar';
import { CommandPalette } from './components/CommandPalette';
import { FormulaDetail } from './components/FormulaDetail';
import { DetailContext } from './context/DetailContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { addRecent } from './lib/recent';
import type { Formula } from './types';

interface DetailState {
  formula: Formula;
  rect: DOMRect | null;
  prefill?: Record<string, number>;
  variantIndex?: number;
}

function App() {
  const [detail, setDetail] = useState<DetailState | null>(null);

  const openDetail = (
    formula: Formula,
    rect: DOMRect | null,
    prefill?: Record<string, number>,
    variantIndex?: number,
  ) => {
    addRecent({ id: formula.id, variantIndex });
    setDetail({ formula, rect, prefill, variantIndex });
  };

  return (
    <DetailContext.Provider value={{ openDetail }}>
      <WorkspaceProvider>
        <BrowserRouter>
          <div className="app-shell">
            <div className="aurora" aria-hidden="true" />

            <AnimatedRoutes />

            <TopBar />
            <CommandPalette />

            <AnimatePresence>
              {detail && (
                <FormulaDetail
                  formula={detail.formula}
                  originRect={detail.rect}
                  prefill={detail.prefill}
                  initialVariantIndex={detail.variantIndex}
                  onClose={() => setDetail(null)}
                  onJump={(formula) => {
                    addRecent({ id: formula.id });
                    setDetail({ formula, rect: null });
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </BrowserRouter>
      </WorkspaceProvider>
    </DetailContext.Provider>
  );
}

export default App;
