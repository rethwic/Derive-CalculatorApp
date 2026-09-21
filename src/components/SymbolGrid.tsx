import { useEffect, useRef } from 'react';
import { proximityBoost, clamp } from '../lib/proximity';
import { useAccent, useTheme } from '../lib/theme';

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
type Rgb = { r: number; g: number; b: number };
const DEFAULT_BRAND: Rgb = { r: 79, g: 70, b: 229 };

// The current accent's color, read from the --brand-rgb channels in the CSS so
// the spotlight always matches whichever accent (and theme) is active.
function readBrandRgb(): Rgb {
  const parts = getComputedStyle(document.documentElement).getPropertyValue('--brand-rgb').trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? { r: parts[0], g: parts[1], b: parts[2] } : DEFAULT_BRAND;
}

function mixColor(t: number, brand: Rgb): string {
  const r = Math.round(NEUTRAL_RGB.r + (brand.r - NEUTRAL_RGB.r) * t);
  const g = Math.round(NEUTRAL_RGB.g + (brand.g - NEUTRAL_RGB.g) * t);
  const b = Math.round(NEUTRAL_RGB.b + (brand.b - NEUTRAL_RGB.b) * t);
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
  const brand = useRef<Rgb>(DEFAULT_BRAND);
  const theme = useTheme();
  const accent = useAccent();

  useEffect(() => {
    brand.current = readBrandRgb();
  }, [theme, accent]);

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

    // Tracked on the window rather than on the grid element: the grid sits
    // behind everything, so a listener on it stops hearing the mouse (and
    // even sees it "leave") the moment the cursor passes over anything in
    // front of it — the clock at the top, the search bar, the subject buttons.
    // The spotlight should follow the cursor no matter what it's over.
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      focal.current = { x: e.clientX, y: e.clientY };
      scheduleUpdate();
    };
    const onPointerLeave = () => {
      focal.current = null;
      scheduleUpdate();
    };
    window.addEventListener('pointermove', onPointerMove);
    document.documentElement.addEventListener('pointerleave', onPointerLeave);

    return () => {
      window.removeEventListener('resize', recomputePositions);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    };
    // scheduleUpdate/update only read refs, so the first render's copies stay valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      el.style.color = mixColor(boost, brand.current);
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

  return (
    <div ref={containerRef} className="symbol-grid" aria-hidden="true">
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
