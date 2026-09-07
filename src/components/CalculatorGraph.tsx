import { useEffect, useRef, useState } from 'react';

export interface GraphCurve {
  id: string;
  color: string;
  // A plain numeric function — the panel has already bound whatever scope
  // (slider values, the row's own parameter name) it needs into this
  // closure, so the graph itself doesn't need to know anything about
  // mathjs or expression scopes at all.
  evaluate: (x: number) => number;
}

export interface GraphVertical {
  id: string;
  color: string;
  x: number;
}

export interface GraphPoint {
  id: string;
  x: number;
  y: number;
  color: string;
}

interface CalculatorGraphProps {
  curves: GraphCurve[];
  verticals: GraphVertical[];
  points: GraphPoint[];
  onClose: () => void;
}

interface View {
  cx: number;
  cy: number;
  /** World units represented by one CSS pixel — smaller means more zoomed in. */
  unitsPerPx: number;
}

const MIN_UNITS_PER_PX = 0.0004;
const MAX_UNITS_PER_PX = 60;
const DEFAULT_VIEW: View = { cx: 0, cy: 0, unitsPerPx: 0.045 };
const FONT = '11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
const POINT_RADIUS = 4.5;
const HIT_RADIUS = 12;
const CLICK_MOVE_THRESHOLD = 5;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Rounds a raw "world units per grid line" value to a clean 1/2/5 * 10^n
// step so grid lines land on nice numbers at any zoom level.
function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep));
  const base = rawStep / 10 ** exponent;
  const niceBase = base < 1.5 ? 1 : base < 3 ? 2 : base < 7 ? 5 : 10;
  return niceBase * 10 ** exponent;
}

function formatTick(value: number, step: number): string {
  if (Math.abs(value) < step / 1000) return '0';
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}

// Coordinate labels use a fixed, coarser precision than tick labels — an
// x-intercept found by bisection carries a dozen meaningless digits of
// float noise that a rounded-to-scale tick value never accumulates.
function formatCoord(n: number): string {
  return Number(n.toPrecision(5)).toString();
}

function draw(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  view: View,
  curves: GraphCurve[],
  verticals: GraphVertical[],
  points: GraphPoint[],
) {
  ctx.clearRect(0, 0, cssW, cssH);

  const { cx, cy, unitsPerPx } = view;
  const toScreenX = (wx: number) => cssW / 2 + (wx - cx) / unitsPerPx;
  const toScreenY = (wy: number) => cssH / 2 - (wy - cy) / unitsPerPx;
  const toWorldX = (sx: number) => cx + (sx - cssW / 2) * unitsPerPx;
  const toWorldY = (sy: number) => cy - (sy - cssH / 2) * unitsPerPx;

  const step = niceStep(70 * unitsPerPx);
  const minX = toWorldX(0);
  const maxX = toWorldX(cssW);
  const minY = toWorldY(cssH);
  const maxY = toWorldY(0);

  // Grid
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(28, 28, 30, 0.08)';
  ctx.beginPath();
  for (let i = Math.ceil(minX / step); i * step <= maxX; i++) {
    const sx = Math.round(toScreenX(i * step)) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, cssH);
  }
  for (let j = Math.ceil(minY / step); j * step <= maxY; j++) {
    const sy = Math.round(toScreenY(j * step)) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(cssW, sy);
  }
  ctx.stroke();

  // Axes
  const axisX = toScreenX(0);
  const axisY = toScreenY(0);
  ctx.strokeStyle = 'rgba(28, 28, 30, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (axisX >= 0 && axisX <= cssW) {
    ctx.moveTo(Math.round(axisX) + 0.5, 0);
    ctx.lineTo(Math.round(axisX) + 0.5, cssH);
  }
  if (axisY >= 0 && axisY <= cssH) {
    ctx.moveTo(0, Math.round(axisY) + 0.5);
    ctx.lineTo(cssW, Math.round(axisY) + 0.5);
  }
  ctx.stroke();

  // Tick labels — pinned to whichever screen edge is closer when the axis
  // itself has been panned out of view, so numbers stay legible.
  ctx.font = FONT;
  ctx.fillStyle = 'rgba(28, 28, 30, 0.55)';
  const labelY = clamp(axisY, 12, cssH - 6);
  const labelX = clamp(axisX, 4, cssW - 28);
  ctx.textBaseline = 'top';
  for (let i = Math.ceil(minX / step); i * step <= maxX; i++) {
    if (i === 0) continue;
    const sx = toScreenX(i * step);
    ctx.fillText(formatTick(i * step, step), sx + 3, labelY + 3);
  }
  ctx.textBaseline = 'bottom';
  for (let j = Math.ceil(minY / step); j * step <= maxY; j++) {
    if (j === 0) continue;
    const sy = toScreenY(j * step);
    ctx.fillText(formatTick(j * step, step), labelX + 3, sy - 2);
  }

  // Vertical lines (x = constant rows)
  for (const v of verticals) {
    const sx = toScreenX(v.x);
    if (sx < -1 || sx > cssW + 1) continue;
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, cssH);
    ctx.stroke();
  }

  // Curves — sampled one world-x per device pixel column, breaking the
  // path on non-finite results or on a huge jump (an asymptote, e.g.
  // tan(x)) so branches don't get connected by a stray near-vertical line.
  for (const curve of curves) {
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let drawing = false;
    let prevSy: number | null = null;
    for (let sx = 0; sx <= cssW; sx++) {
      const wx = toWorldX(sx);
      const wy = curve.evaluate(wx);
      if (!Number.isFinite(wy)) {
        drawing = false;
        prevSy = null;
        continue;
      }
      const sy = toScreenY(wy);
      if (!drawing || (prevSy !== null && Math.abs(sy - prevSy) > cssH * 4)) {
        ctx.moveTo(sx, sy);
        drawing = true;
      } else {
        ctx.lineTo(sx, sy);
      }
      prevSy = sy;
    }
    ctx.stroke();
  }

  // Points — intercepts and explicit "(x, y)" rows alike, drawn as a small
  // filled dot in the owning curve/row's color with a light halo so it
  // reads clearly against a same-colored curve passing right through it.
  for (const p of points) {
    const sx = toScreenX(p.x);
    const sy = toScreenY(p.y);
    if (sx < -20 || sx > cssW + 20 || sy < -20 || sy > cssH + 20) continue;
    ctx.beginPath();
    ctx.arc(sx, sy, POINT_RADIUS + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
}

export function CalculatorGraph({ curves, verticals, points, onClose }: CalculatorGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ ...DEFAULT_VIEW });
  const dataRef = useRef({ curves, verticals, points });
  dataRef.current = { curves, verticals, points };
  const dragRef = useRef<{ startX: number; startY: number; origin: View; hitId: string | null; moved: boolean } | null>(
    null,
  );
  const sizeRef = useRef({ w: 0, h: 0 });
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const pinnedIdsRef = useRef(pinnedIds);
  pinnedIdsRef.current = pinnedIds;
  const hoveredIdRef = useRef<string | null>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { curves, verticals, points } = dataRef.current;
    draw(ctx, w, h, viewRef.current, curves, verticals, points);
    updateLabelPositions();
  }

  // Repositions (and shows/hides) every point's coordinate label. Labels
  // are plain HTML overlays rather than canvas text — a canvas-drawn label
  // can't easily wrap a rounded background or be individually shown/hidden
  // without redrawing everything else, and there are at most a handful of
  // these on screen at once. Called on every redraw (pan/zoom/data change)
  // and, separately, on hover changes that don't otherwise touch the view.
  function updateLabelPositions() {
    const { w, h } = sizeRef.current;
    const view = viewRef.current;
    const toScreenX = (wx: number) => w / 2 + (wx - view.cx) / view.unitsPerPx;
    const toScreenY = (wy: number) => h / 2 - (wy - view.cy) / view.unitsPerPx;
    for (const p of dataRef.current.points) {
      const el = labelRefs.current.get(p.id);
      if (!el) continue;
      const show = pinnedIdsRef.current.has(p.id) || hoveredIdRef.current === p.id;
      if (!show) {
        el.style.display = 'none';
        continue;
      }
      const sx = toScreenX(p.x);
      const sy = toScreenY(p.y);
      el.style.display = sx < -60 || sx > w + 60 || sy < -40 || sy > h + 40 ? 'none' : 'block';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
    }
  }

  function hitTestPoint(sx: number, sy: number): string | null {
    const { w, h } = sizeRef.current;
    const view = viewRef.current;
    const toScreenX = (wx: number) => w / 2 + (wx - view.cx) / view.unitsPerPx;
    const toScreenY = (wy: number) => h / 2 - (wy - view.cy) / view.unitsPerPx;
    let bestId: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const p of dataRef.current.points) {
      const d = Math.hypot(toScreenX(p.x) - sx, toScreenY(p.y) - sy);
      if (d <= bestDist) {
        bestDist = d;
        bestId = p.id;
      }
    }
    return bestId;
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves, verticals, points]);

  useEffect(() => {
    updateLabelPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedIds, points]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      sizeRef.current = { w: width, h: height };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      redraw();
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A manual, non-passive wheel listener — React's default passive
  // listener silently ignores preventDefault(), which would otherwise let
  // scrolling over the graph also scroll/zoom the surrounding page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = container!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const view = viewRef.current;
      const worldX = view.cx + (sx - rect.width / 2) * view.unitsPerPx;
      const worldY = view.cy - (sy - rect.height / 2) * view.unitsPerPx;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newUnitsPerPx = clamp(view.unitsPerPx / factor, MIN_UNITS_PER_PX, MAX_UNITS_PER_PX);
      viewRef.current = {
        unitsPerPx: newUnitsPerPx,
        cx: worldX - (sx - rect.width / 2) * newUnitsPerPx,
        cy: worldY + (sy - rect.height / 2) * newUnitsPerPx,
      };
      redraw();
    }
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // A pointer id that isn't currently active can reject capture in some
      // browsers — harmless to skip, dragging still works via the regular
      // pointermove/pointerup below.
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const hitId = hitTestPoint(e.clientX - rect.left, e.clientY - rect.top);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: viewRef.current, hitId, moved: false };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (drag) {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (dist > CLICK_MOVE_THRESHOLD) drag.moved = true;
      const { unitsPerPx } = drag.origin;
      viewRef.current = {
        unitsPerPx,
        cx: drag.origin.cx - (e.clientX - drag.startX) * unitsPerPx,
        cy: drag.origin.cy + (e.clientY - drag.startY) * unitsPerPx,
      };
      redraw();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const hitId = hitTestPoint(e.clientX - rect.left, e.clientY - rect.top);
    if (hitId !== hoveredIdRef.current) {
      hoveredIdRef.current = hitId;
      updateLabelPositions();
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved || !drag.hitId) return;
    const id = drag.hitId;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePointerLeave() {
    dragRef.current = null;
    if (hoveredIdRef.current !== null) {
      hoveredIdRef.current = null;
      updateLabelPositions();
    }
  }

  function resetView() {
    viewRef.current = { ...DEFAULT_VIEW };
    redraw();
  }

  // Zooms around the view's own center (rather than a pointer position,
  // which these buttons don't have) — cx/cy stay put, only unitsPerPx
  // scales, clamped to the same range the wheel handler respects.
  function zoomBy(factor: number) {
    const view = viewRef.current;
    viewRef.current = { ...view, unitsPerPx: clamp(view.unitsPerPx / factor, MIN_UNITS_PER_PX, MAX_UNITS_PER_PX) };
    redraw();
  }

  return (
    <div ref={containerRef} className="calculator-graph">
      <canvas
        ref={canvasRef}
        className="calculator-graph-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />
      {points.map((p) => (
        <div
          key={p.id}
          ref={(el) => {
            if (el) labelRefs.current.set(p.id, el);
            else labelRefs.current.delete(p.id);
          }}
          className="calculator-graph-point-label"
          style={{ display: 'none', borderColor: p.color }}
        >
          ({formatCoord(p.x)}, {formatCoord(p.y)})
        </div>
      ))}
      <button type="button" className="calculator-graph-close" aria-label="Close calculator" onClick={onClose}>
        ×
      </button>
      <div className="calculator-graph-controls">
        <button
          type="button"
          className="calculator-graph-control-btn"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.35)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="calculator-graph-control-btn"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.35)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="calculator-graph-control-btn" aria-label="Reset view" onClick={resetView}>
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
        </button>
      </div>
    </div>
  );
}
