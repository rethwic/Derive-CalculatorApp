import { useRef, useState } from 'react';
import { FormulaBox } from './FormulaBox';
import { FormulaCalculator } from './FormulaCalculator';
import { VariantPicker } from './VariantPicker';
import type { Formula } from '../types';

interface WorkspaceCardProps {
  formula: Formula;
  x: number;
  y: number;
  z: number;
  scale: number;
  onClose: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  // Lets the page measure this card's actual rendered size (for "fit view
  // to pinned cards") without needing to guess a fixed height.
  cardRef?: (el: HTMLDivElement | null) => void;
}

export function WorkspaceCard({ formula, x, y, z, scale, onClose, onFocus, onMove, cardRef }: WorkspaceCardProps) {
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  const activeVariant = formula.variants?.[variantIndex];

  function handleHeaderPointerDown(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Some browsers reject capture for a pointer id that isn't currently
      // active — harmless to skip, dragging still works via the regular
      // pointermove/pointerup below.
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: x, originY: y };
  }

  function handleHeaderPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    // Screen-pixel mouse movement maps to a smaller canvas-space distance
    // once the workspace is zoomed in, and a larger one when zoomed out —
    // dividing by scale is what keeps the card glued to the cursor either way.
    const dx = (e.clientX - dragRef.current.startX) / scale;
    const dy = (e.clientY - dragRef.current.startY) / scale;
    onMove(dragRef.current.originX + dx, dragRef.current.originY + dy);
  }

  function handleHeaderPointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      ref={cardRef}
      className="workspace-card glass"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: z }}
      onPointerDownCapture={onFocus}
    >
      <div
        className="workspace-card-header"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
      >
        <span className="workspace-card-title">{formula.title}</span>
        <button
          type="button"
          className="workspace-card-close"
          aria-label="Close"
          onClick={onClose}
          // The pointerdown here would otherwise bubble up into the header's
          // own handler right above, which calls setPointerCapture — that
          // redirects the button's own click to fire on the header instead,
          // so the close button silently did nothing. Stopping it here keeps
          // this press from ever starting a drag.
          onPointerDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>

      <div className="workspace-card-body">
        {formula.variants && formula.variants.length > 0 && activeVariant ? (
          <>
            <VariantPicker variants={formula.variants} index={variantIndex} onChange={setVariantIndex} />
            <FormulaBox key={`box-${formula.id}-${activeVariant.label}`} latex={activeVariant.latex} />
            {activeVariant.calc && (
              <FormulaCalculator key={`calc-${formula.id}-${activeVariant.label}`} calc={activeVariant.calc} />
            )}
          </>
        ) : (
          <>
            <FormulaBox key={`box-${formula.id}`} latex={formula.latex} />
            {formula.calc && <FormulaCalculator key={`calc-${formula.id}`} calc={formula.calc} />}
          </>
        )}
      </div>
    </div>
  );
}
