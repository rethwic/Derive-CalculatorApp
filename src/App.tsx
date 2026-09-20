import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { LandingPage } from './pages/LandingPage';
import { SubjectPage } from './pages/SubjectPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { ContactPage } from './pages/ContactPage';
import { CalculatorLauncher } from './components/CalculatorLauncher';
import { FormulaDetail } from './components/FormulaDetail';
import { DetailContext } from './context/DetailContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
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
  ) => setDetail({ formula, rect, prefill, variantIndex });

  return (
    <DetailContext.Provider value={{ openDetail }}>
      <WorkspaceProvider>
        <BrowserRouter>
          <div className="app-shell">
            <div className="aurora" aria-hidden="true" />

            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/:subjectId" element={<SubjectPage />} />
            </Routes>

            <CalculatorLauncher />

            <AnimatePresence>
              {detail && (
                <FormulaDetail
                  formula={detail.formula}
                  originRect={detail.rect}
                  prefill={detail.prefill}
                  initialVariantIndex={detail.variantIndex}
                  onClose={() => setDetail(null)}
                  onJump={(formula) => setDetail({ formula, rect: null })}
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
