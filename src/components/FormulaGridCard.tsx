import { Katex } from './Katex';
import { useWorkspace } from '../context/WorkspaceContext';
import type { Formula } from '../types';

interface FormulaGridCardProps {
  formula: Formula;
  onClick: (formula: Formula, rect: DOMRect) => void;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FormulaGridCard({ formula, onClick }: FormulaGridCardProps) {
  const { cards, addFormula, closeCard } = useWorkspace();
  const existingCard = cards.find((c) => c.formulaId === formula.id);
  const isAdded = !!existingCard;

  function handleToggle(e: React.MouseEvent) {
    // The card itself is also clickable (opens the detail view) — without
    // this, toggling the workspace would also open the formula.
    e.stopPropagation();
    if (existingCard) {
      closeCard(existingCard.uid);
    } else {
      addFormula(formula);
    }
  }

  return (
    <div
      className="fgc glass"
      role="button"
      tabIndex={0}
      onClick={(e) => onClick(formula, e.currentTarget.getBoundingClientRect())}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(formula, e.currentTarget.getBoundingClientRect());
        }
      }}
    >
      <button
        type="button"
        className={`fgc-add${isAdded ? ' fgc-add-done' : ''}`}
        aria-label={isAdded ? `Remove ${formula.title} from workspace` : `Add ${formula.title} to workspace`}
        aria-pressed={isAdded}
        onClick={handleToggle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isAdded ? <CheckIcon /> : <PlusIcon />}
      </button>

      {!formula.variants && (
        <span className="fgc-formula">
          <Katex math={formula.latex} />
        </span>
      )}
      <span className="fgc-title">{formula.title}</span>
    </div>
  );
}
