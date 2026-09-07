import { useEffect, useRef } from 'react';
import { proximityBoost, clamp } from '../lib/proximity';

// A "polka dot" background where the dots are tiny math symbols: a uniform,
// mostly-static grid at rest (so it reads as a quiet texture), which lights
// up — in the single brand color, not a rainbow — into a little spotlight
// cluster around the cursor.
const SYMBOL_SET = ['∫', 'π', 'Σ', '√', '∞', 'θ', 'Δ', 'λ', '±', '%', 'x²', '÷', '×', '∂', '∇', '≈'];
const COLS = 24;
const ROWS = 15;
const REVEAL_RADIUS = 140;
const MAX_SCALE = 1.7;

const NEUTRAL_RGB = { r: 146, g: 149, b: 166 };
const BRAND_RGB = { r: 79, g: 70, b: 229 };

function mixColor(t: number): string {
  const r = Math.round(NEUTRAL_RGB.r + (BRAND_RGB.r - NEUTRAL_RGB.r) * t);
  const g = Math.round(NEUTRAL_RGB.g + (BRAND_RGB.g - NEUTRAL_RGB.g) * t);
  const b = Math.round(NEUTRAL_RGB.b + (BRAND_RGB.b - NEUTRAL_RGB.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

interface Cell {
  leftPct: number;
  topPct: number;
  symbol: string;
}

function buildGrid(): Cell[] {
  const cells: Cell[] = [];
  let i = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      cells.push({
        leftPct: ((col + 0.5) / COLS) * 100,
        topPct: ((row + 0.5) / ROWS) * 100,
        symbol: SYMBOL_SET[i % SYMBOL_SET.length],
      });
      i++;
    }
  }
  return cells;
}

const GRID = buildGrid();

export function SymbolGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const positions = useRef<{ x: number; y: number }[]>([]);
  const focal = useRef<{ x: number; y: number } | null>(null);
  const rafScheduled = useRef(false);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const recomputePositions = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      positions.current = GRID.map((cell) => ({
        x: (cell.leftPct / 100) * w,
        y: (cell.topPct / 100) * h,
      }));
    };

    recomputePositions();
    window.addEventListener('resize', recomputePositions);
    return () => window.removeEventListener('resize', recomputePositions);
  }, []);

  function update() {
    const f = focal.current;
    cellRefs.current.forEach((el, i) => {
      if (!el) return;
      if (!f || prefersReducedMotion.current) {
        el.style.transform = 'translate(-50%, -50%) scale(1)';
        el.style.opacity = '';
        el.style.color = '';
        el.style.zIndex = '0';
        return;
      }
      const pos = positions.current[i];
      if (!pos) return;
      const dist = Math.hypot(pos.x - f.x, pos.y - f.y);
      const boost = proximityBoost(dist, REVEAL_RADIUS);
      const scale = 1 + (MAX_SCALE - 1) * boost;
      const opacity = clamp(0.14 + boost * 0.86, 0, 1);
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
      el.style.opacity = String(opacity);
      el.style.color = mixColor(boost);
      el.style.zIndex = String(Math.round(boost * 50));
    });
  }

  function scheduleUpdate() {
    if (rafScheduled.current) return;
    rafScheduled.current = true;
    requestAnimationFrame(() => {
      rafScheduled.current = false;
      update();
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    focal.current = { x: e.clientX, y: e.clientY };
    scheduleUpdate();
  }

  function handlePointerLeave() {
    focal.current = null;
    scheduleUpdate();
  }

  return (
    <div
      ref={containerRef}
      className="symbol-grid"
      aria-hidden="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {GRID.map((cell, i) => (
        <span
          key={i}
          ref={(el) => {
            cellRefs.current[i] = el;
          }}
          className="symbol-grid-dot"
          style={{ left: `${cell.leftPct}%`, top: `${cell.topPct}%` }}
        >
          {cell.symbol}
        </span>
      ))}
    </div>
  );
}
