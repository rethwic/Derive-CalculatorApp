import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Formula } from '../types';

const STORAGE_KEY = 'derive-workspace-v1';
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2.5;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export interface OpenCard {
  uid: string;
  formulaId: string;
  x: number;
  y: number;
  z: number;
}

export interface WorkspaceView {
  x: number;
  y: number;
  scale: number;
}

interface WorkspaceState {
  view: WorkspaceView;
  cards: OpenCard[];
}

const DEFAULT_STATE: WorkspaceState = { view: { x: 0, y: 0, scale: 1 }, cards: [] };

function loadState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) return DEFAULT_STATE;
    const view = parsed.view;
    // A corrupted view (e.g. a stray NaN/Infinity that once slipped into
    // state) would otherwise persist forever, silently breaking pan/zoom on
    // every future load — falling back to the default view is safer than
    // trusting whatever was last written.
    if (!view || !Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.scale)) {
      return { ...DEFAULT_STATE, cards: parsed.cards };
    }
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

interface WorkspaceContextValue {
  view: WorkspaceView;
  cards: OpenCard[];
  addFormula: (formula: Formula) => void;
  closeCard: (uid: string) => void;
  focusCard: (uid: string) => void;
  moveCard: (uid: string, x: number, y: number) => void;
  panBy: (dx: number, dy: number) => void;
  panTo: (x: number, y: number) => void;
  zoomBy: (cx: number, cy: number, factor: number) => void;
  setScaleCentered: (viewportW: number, viewportH: number, newScale: number) => void;
  fitToBox: (boxCx: number, boxCy: number, boxW: number, boxH: number, viewportW: number, viewportH: number) => void;
  resetView: () => void;
  clearAll: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(loadState);
  const nextZRef = useRef(1 + state.cards.reduce((max, c) => Math.max(max, c.z), 0));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Reused by both the workspace's own search and the "+" button on
  // formula cards elsewhere in the app, so both paths behave identically:
  // re-adding a formula that's already pinned just brings it to front
  // instead of piling up a duplicate card.
  function addFormula(formula: Formula) {
    setState((s) => {
      const existing = s.cards.find((c) => c.formulaId === formula.id);
      if (existing) {
        const z = nextZRef.current++;
        return { ...s, cards: s.cards.map((c) => (c.uid === existing.uid ? { ...c, z } : c)) };
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = (vw / 2 - s.view.x) / s.view.scale;
      const cy = (vh / 2 - s.view.y) / s.view.scale;
      const jitter = () => (Math.random() - 0.5) * 90;
      const uid = `${formula.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const z = nextZRef.current++;
      return {
        ...s,
        cards: [...s.cards, { uid, formulaId: formula.id, x: cx + jitter(), y: cy + jitter(), z }],
      };
    });
  }

  function closeCard(uid: string) {
    setState((s) => ({ ...s, cards: s.cards.filter((c) => c.uid !== uid) }));
  }

  function focusCard(uid: string) {
    const z = nextZRef.current++;
    setState((s) => ({ ...s, cards: s.cards.map((c) => (c.uid === uid ? { ...c, z } : c)) }));
  }

  function moveCard(uid: string, x: number, y: number) {
    setState((s) => ({ ...s, cards: s.cards.map((c) => (c.uid === uid ? { ...c, x, y } : c)) }));
  }

  function panBy(dx: number, dy: number) {
    setState((s) => ({ ...s, view: { ...s.view, x: s.view.x + dx, y: s.view.y + dy } }));
  }

  function panTo(x: number, y: number) {
    setState((s) => ({ ...s, view: { ...s.view, x, y } }));
  }

  function zoomBy(cx: number, cy: number, factor: number) {
    setState((s) => {
      const newScale = clamp(s.view.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = newScale / s.view.scale;
      return { ...s, view: { x: cx - (cx - s.view.x) * ratio, y: cy - (cy - s.view.y) * ratio, scale: newScale } };
    });
  }

  // Zooms around the viewport's own center rather than a cursor position —
  // used by the manual zoom slider, where there's no meaningful pointer
  // location over the canvas to anchor to.
  function setScaleCentered(viewportW: number, viewportH: number, newScale: number) {
    setState((s) => {
      const clamped = clamp(newScale, MIN_SCALE, MAX_SCALE);
      const ratio = clamped / s.view.scale;
      const cx = viewportW / 2;
      const cy = viewportH / 2;
      return { ...s, view: { x: cx - (cx - s.view.x) * ratio, y: cy - (cy - s.view.y) * ratio, scale: clamped } };
    });
  }

  // Frames a given canvas-space box (e.g. the bounding box of a cluster of
  // pinned cards) centered in the viewport, scaled to fit with some padding.
  function fitToBox(boxCx: number, boxCy: number, boxW: number, boxH: number, viewportW: number, viewportH: number) {
    setState((s) => {
      const PADDING = 120;
      const scaleX = (viewportW - PADDING * 2) / boxW;
      const scaleY = (viewportH - PADDING * 2) / boxH;
      // Cap growth at 1.5x even for a single tiny card — fitting isn't
      // meant to zoom in absurdly far, just bring the content comfortably
      // into view.
      const newScale = clamp(Math.min(scaleX, scaleY, 1.5), MIN_SCALE, MAX_SCALE);
      return {
        ...s,
        view: { x: viewportW / 2 - boxCx * newScale, y: viewportH / 2 - boxCy * newScale, scale: newScale },
      };
    });
  }

  function resetView() {
    setState((s) => ({ ...s, view: { x: 0, y: 0, scale: 1 } }));
  }

  function clearAll() {
    setState((s) => ({ ...s, cards: [] }));
  }

  return (
    <WorkspaceContext.Provider
      value={{
        view: state.view,
        cards: state.cards,
        addFormula,
        closeCard,
        focusCard,
        moveCard,
        panBy,
        panTo,
        zoomBy,
        setScaleCentered,
        fitToBox,
        resetView,
        clearAll,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
