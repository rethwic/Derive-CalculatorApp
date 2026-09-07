import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { WorkspaceCard } from '../components/WorkspaceCard';
import { WorkspaceSearchLauncher } from '../components/WorkspaceSearchLauncher';
import { WorkspaceZoomSlider } from '../components/WorkspaceZoomSlider';
import { useWorkspace } from '../context/WorkspaceContext';
import { formulas } from '../data/formulas';

const LONG_PRESS_MS = 450;
// Cards whose centers land within this many canvas-space pixels of each
// other are treated as one cluster to fit — keeps a couple of stray,
// far-off cards from forcing the whole view to zoom out to near-nothing.
const CLUSTER_THRESHOLD = 900;

interface CardBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function boundingArea(boxes: CardBox[]) {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return (maxX - minX) * (maxY - minY);
}

// Simple union-find clustering by proximity of card centers.
function clusterBoxes(boxes: CardBox[]): CardBox[][] {
  const parent = boxes.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (Math.hypot(boxes[i].cx - boxes[j].cx, boxes[i].cy - boxes[j].cy) < CLUSTER_THRESHOLD) {
        union(i, j);
      }
    }
  }
  const groups = new Map<number, CardBox[]>();
  boxes.forEach((b, i) => {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(b);
    groups.set(root, arr);
  });
  return Array.from(groups.values());
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5L12 4l8 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10v9a1 1 0 001 1h3v-6h4v6h3a1 1 0 001-1v-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M4 15v4a1 1 0 001 1h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m2 0v12a2 2 0 01-2 2H10a2 2 0 01-2-2V7h8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WorkspacePage() {
  const {
    view,
    cards,
    addFormula,
    closeCard,
    focusCard,
    moveCard,
    panTo,
    zoomBy,
    setScaleCentered,
    fitToBox,
    resetView,
    clearAll,
  } = useWorkspace();
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [zoomPopoverOpen, setZoomPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeShapeRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const cardElsRef = useRef(new Map<string, HTMLDivElement>());
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  // Closing the zoom slider by clicking elsewhere or pressing Escape — kept
  // here rather than inside the slider component since the slider itself
  // has no fixed lifetime of its own now (it's just one state of the
  // resize shape, not a separately-mounted popover).
  useEffect(() => {
    if (!zoomPopoverOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (resizeShapeRef.current && !resizeShapeRef.current.contains(e.target as Node)) {
        setZoomPopoverOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoomPopoverOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [zoomPopoverOpen]);

  // view/panTo/zoomBy all get new identities on every context update (very
  // frequent — every pan/zoom tick), so closing over them directly would
  // force this effect to tear down and reattach the native listener
  // constantly. Mirroring the latest values into a ref each render lets the
  // listener attach exactly once while still always acting on fresh state.
  const liveRef = useRef({ view, panTo, zoomBy });
  liveRef.current = { view, panTo, zoomBy };

  // React attaches wheel listeners passively by default, which silently
  // ignores preventDefault() — here that would let a trackpad pinch also
  // zoom the whole browser page. A manual, non-passive listener is the only
  // reliable way to fully own the gesture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { view: currentView, panTo: currentPanTo, zoomBy: currentZoomBy } = liveRef.current;
      if (e.ctrlKey) {
        const rect = el!.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // A standard mouse wheel notch reports deltaY around ±100; a
        // trackpad pinch reports many small deltas in quick succession.
        // 0.0015 keeps one notch to a gentle ~16% step while trackpad
        // pinches still accumulate smoothly over their many events.
        const factor = Math.exp(-e.deltaY * 0.0015);
        currentZoomBy(cx, cy, factor);
      } else {
        currentPanTo(currentView.x - e.deltaX, currentView.y - e.deltaY);
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('.workspace-card')) return;
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers reject capture for a pointer id that isn't currently
      // active (e.g. a stray/duplicate event) — harmless to skip, dragging
      // still works via the regular pointermove/pointerup below.
    }
    panRef.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pan = panRef.current;
    if (!pan) return;
    // Compute the new position from this snapshot now, rather than reading
    // panRef.current again inside a deferred updater — see the pan/zoom
    // page's history for why that reordering crashed the whole page.
    const newX = pan.originX + (e.clientX - pan.startX);
    const newY = pan.originY + (e.clientY - pan.startY);
    panTo(newX, newY);
  }

  function handlePointerUp() {
    panRef.current = null;
  }

  // A single click on the resize icon: reset if the canvas is empty,
  // otherwise fit the view to the pinned cards (the biggest/tightest
  // cluster of them, if they're spread out) rather than always snapping
  // back to wherever the view started.
  function fitOrReset() {
    if (cards.length === 0) {
      resetView();
      return;
    }

    const boxes: CardBox[] = cards.map((c) => {
      const el = cardElsRef.current.get(c.uid);
      const w = el?.offsetWidth ?? 340;
      const h = el?.offsetHeight ?? 260;
      return { x: c.x, y: c.y, w, h, cx: c.x + w / 2, cy: c.y + h / 2 };
    });

    let best: CardBox[] = [];
    let bestArea = Infinity;
    for (const group of clusterBoxes(boxes)) {
      const area = boundingArea(group);
      if (group.length > best.length || (group.length === best.length && area < bestArea)) {
        best = group;
        bestArea = area;
      }
    }

    const minX = Math.min(...best.map((b) => b.x));
    const minY = Math.min(...best.map((b) => b.y));
    const maxX = Math.max(...best.map((b) => b.x + b.w));
    const maxY = Math.max(...best.map((b) => b.y + b.h));
    const vw = containerRef.current?.clientWidth ?? window.innerWidth;
    const vh = containerRef.current?.clientHeight ?? window.innerHeight;
    fitToBox((minX + maxX) / 2, (minY + maxY) / 2, Math.max(maxX - minX, 1), Math.max(maxY - minY, 1), vw, vh);
  }

  // Press-and-hold the same icon instead opens a manual zoom slider —
  // detected by starting a timer on pointerdown and checking whether it
  // fired before pointerup arrives.
  function handleResizePointerDown() {
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setZoomPopoverOpen(true);
    }, LONG_PRESS_MS);
  }

  function cancelLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleResizePointerUp() {
    cancelLongPressTimer();
    if (!longPressFiredRef.current) fitOrReset();
  }

  function handleResizeSlider(newScale: number) {
    const vw = containerRef.current?.clientWidth ?? window.innerWidth;
    const vh = containerRef.current?.clientHeight ?? window.innerHeight;
    setScaleCentered(vw, vh, newScale);
  }

  return (
    <div className="workspace-page">
      <div
        className={`workspace-edge-zone${edgeOpen ? ' workspace-edge-zone-open' : ''}`}
        onMouseEnter={() => setEdgeOpen(true)}
        onMouseLeave={() => setEdgeOpen(false)}
      >
        <Link to="/" className="workspace-edge-icon glass" aria-label="Back to home">
          <HomeIcon />
        </Link>
        <WorkspaceSearchLauncher onSelect={addFormula} />
        <motion.div
          ref={resizeShapeRef}
          className="workspace-edge-icon workspace-resize-shape glass"
          animate={{ width: zoomPopoverOpen ? 220 : 48 }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        >
          <motion.button
            type="button"
            className="workspace-resize-icon-btn"
            animate={{ opacity: zoomPopoverOpen ? 0 : 1 }}
            transition={{ duration: 0.15 }}
            style={{ pointerEvents: zoomPopoverOpen ? 'none' : 'auto' }}
            aria-label={cards.length > 0 ? 'Fit view to pinned formulas' : 'Reset view'}
            onPointerDown={handleResizePointerDown}
            onPointerUp={handleResizePointerUp}
            onPointerLeave={cancelLongPressTimer}
          >
            <ResizeIcon />
          </motion.button>
          <AnimatePresence>
            {zoomPopoverOpen && (
              <motion.div
                key="zoom-slider"
                className="workspace-zoom-slider-wrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.12 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
              >
                <WorkspaceZoomSlider scale={view.scale} onChange={handleResizeSlider} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        {cards.length > 0 && (
          <button type="button" className="workspace-edge-icon glass" aria-label="Clear all" onClick={clearAll}>
            <ClearIcon />
          </button>
        )}
      </div>

      <div
        className="workspace-canvas"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          className="workspace-world"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <div className="workspace-grid" aria-hidden="true" />
          {cards.map((c) => {
            const formula = formulas.find((f) => f.id === c.formulaId);
            if (!formula) return null;
            return (
              <WorkspaceCard
                key={c.uid}
                formula={formula}
                x={c.x}
                y={c.y}
                z={c.z}
                scale={view.scale}
                onClose={() => closeCard(c.uid)}
                onFocus={() => focusCard(c.uid)}
                onMove={(x, y) => moveCard(c.uid, x, y)}
                cardRef={(el) => {
                  if (el) cardElsRef.current.set(c.uid, el);
                  else cardElsRef.current.delete(c.uid);
                }}
              />
            );
          })}
        </div>

        {cards.length === 0 && (
          <div className="workspace-empty">
            <p>Move your mouse to the left edge, then search to pin a formula here.</p>
            <p className="workspace-empty-hint">
              Drag cards by their title bar to arrange them. Scroll to pan, Ctrl/⌘ + scroll to zoom.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
