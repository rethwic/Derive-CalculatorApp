import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classifyRow, colorForIndex, type RowResult } from '../lib/mathEngine';
import { CalculatorExpressionRow, type SliderRange } from './CalculatorExpressionRow';
import { CalculatorGraph, type GraphCurve, type GraphPoint, type GraphVertical } from './CalculatorGraph';

interface CalcRow {
  id: string;
  text: string;
  sliderRange: SliderRange;
}

interface CalculatorPanelProps {
  open: boolean;
  onClose: () => void;
}

// Intercepts are hunted for across a fixed, generous domain rather than
// whatever's currently in view — recomputing on every pan/zoom tick would
// mean re-scanning the curve continuously while dragging, and the points
// would pop in and out of existence as you pan past ±60, which reads as
// buggier than just not chasing every crossing an unbounded curve like
// sin(x) could have arbitrarily far out.
const INTERCEPT_DOMAIN: [number, number] = [-60, 60];
const INTERCEPT_STEPS = 1200;

// Where two curves cross belongs to both of them equally, so it's marked
// in the same neutral ink as everything else that isn't curve-specific
// (axis labels, grid) rather than borrowing either curve's own color.
const INTERSECTION_COLOR = '#1c1c1e';

// A plain bisection root-finder over evenly-sampled brackets. The tricky
// part isn't finding where the sign flips — it's telling a genuine
// crossing apart from a jump discontinuity (tan(x)'s asymptotes flip sign
// too, by shooting to +Infinity and back from -Infinity, without ever
// passing near zero). Rejecting brackets where either endpoint is already
// huge filters those out without needing to know anything about the
// specific function.
function findXIntercepts(evaluate: (x: number) => number): number[] {
  const [lo, hi] = INTERCEPT_DOMAIN;
  const dx = (hi - lo) / INTERCEPT_STEPS;
  const roots: number[] = [];
  let prevX = lo;
  let prevY = evaluate(lo);
  for (let i = 1; i <= INTERCEPT_STEPS; i++) {
    const x = lo + i * dx;
    const y = evaluate(x);
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) {
        roots.push(prevX);
      } else if ((prevY < 0) !== (y < 0) && Math.abs(prevY) < 1e4 && Math.abs(y) < 1e4) {
        let a = prevX;
        let b = x;
        let fa = prevY;
        for (let iter = 0; iter < 40; iter++) {
          const mid = (a + b) / 2;
          const fm = evaluate(mid);
          if (!Number.isFinite(fm)) break;
          if ((fa < 0) !== (fm < 0)) {
            b = mid;
          } else {
            a = mid;
            fa = fm;
          }
        }
        const root = (a + b) / 2;
        if (Math.abs(evaluate(root)) < 0.05) roots.push(root);
      }
    }
    prevX = x;
    prevY = y;
  }
  // Collapse roots that landed within one sample-step of each other (a
  // near-tangent crossing can otherwise trip the sign check twice).
  roots.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const r of roots) {
    if (deduped.length === 0 || r - deduped[deduped.length - 1] > dx * 2) deduped.push(r);
  }
  return deduped;
}

// The sidebar's expanded width — capped at 300px on comfortably wide
// screens, but shrunk proportionally on narrow ones so the graph (the
// actual point of the calculator) still gets the majority of the panel
// instead of being squeezed down to a sliver behind a full-size sidebar.
const MAX_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 140;
function computeSidebarWidth() {
  if (typeof window === 'undefined') return MAX_SIDEBAR_WIDTH;
  const panelWidth = window.innerWidth - 20; // the panel's own 10px inset on each side
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, panelWidth * 0.5)));
}

let rowIdCounter = 0;
function makeRow(text = ''): CalcRow {
  rowIdCounter += 1;
  return { id: `calc-row-${rowIdCounter}`, text, sliderRange: { min: -10, max: 10 } };
}

function isBlank(row: CalcRow) {
  return row.text.trim() === '';
}

// Guarantees a blank row is always waiting at the end, so there's never a
// moment where you'd have to reach for "add expression" just to keep
// typing. Append-only — it never removes a row, so it can't fight an
// explicit insert (Enter, the toolbar's +) by collapsing it back away.
function ensureTrailingBlank(rows: CalcRow[]): CalcRow[] {
  if (rows.length === 0) return [makeRow()];
  return isBlank(rows[rows.length - 1]) ? rows : [...rows, makeRow()];
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7L3 11l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11h11a6 6 0 016 6v0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 7l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 11H10a6 6 0 00-6 6v0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 6l-6 6 6 6M19 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalculatorPanel({ open, onClose }: CalculatorPanelProps) {
  const [rows, setRows] = useState<CalcRow[]>(() => [makeRow()]);
  const [history, setHistory] = useState<CalcRow[][]>([]);
  const [future, setFuture] = useState<CalcRow[][]>([]);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(computeSidebarWidth);
  // Coalesces a burst of rapid edits (typing a word, dragging a slider)
  // into a single undo step, captured from the state right before the
  // burst started rather than one step per keystroke/tick.
  const burstRef = useRef<{ timer: number | null; base: CalcRow[] | null }>({ timer: null, base: null });
  const inputRefs = useRef(new Map<string, HTMLDivElement>());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Runs after a row we just created has actually mounted (rows having
  // changed is what guarantees its input ref is registered by now).
  useEffect(() => {
    if (!pendingFocusId) return;
    const el = inputRefs.current.get(pendingFocusId);
    if (el) {
      el.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, rows]);

  // A single top-down pass: each row is classified using the constants
  // defined by rows above it, and definitions accumulate into one scope
  // object used — in its final, fully-populated form — to evaluate every
  // plotted curve below, so a slider affects a graph regardless of which
  // one appears first in the list.
  const { results, scope } = useMemo(() => {
    const scope: Record<string, number> = {};
    const results: RowResult[] = [];
    for (const row of rows) {
      const result = classifyRow(row.text, scope);
      results.push(result);
      if (result.kind === 'definition') scope[result.name] = result.value;
    }
    return { results, scope };
  }, [rows]);

  const curves = useMemo<GraphCurve[]>(() => {
    const out: GraphCurve[] = [];
    rows.forEach((row, i) => {
      const result = results[i];
      if (result.kind === 'plot') {
        const plot = result.plot;
        out.push({ id: row.id, color: colorForIndex(i), evaluate: (x) => plot.evaluate(x, scope) });
      }
    });
    return out;
  }, [rows, results, scope]);

  const verticals = useMemo<GraphVertical[]>(() => {
    const out: GraphVertical[] = [];
    rows.forEach((row, i) => {
      const result = results[i];
      if (result.kind === 'vertical') out.push({ id: row.id, color: colorForIndex(i), x: result.x });
    });
    return out;
  }, [rows, results]);

  // Every point actually shown on the graph: an explicit "(x, y)" row
  // plots exactly where it says, each curve additionally contributes its
  // y-intercept and however many x-intercepts turn up in the search domain
  // — mirroring what a curve's "intercepts" question normally means without
  // requiring the user to type them in by hand — and every pair of curves
  // contributes wherever they cross, the same way.
  const points = useMemo<GraphPoint[]>(() => {
    const out: GraphPoint[] = [];
    rows.forEach((row, i) => {
      const result = results[i];
      if (result.kind !== 'point') return;
      out.push({ id: row.id, x: result.x, y: result.y, color: colorForIndex(i) });
    });
    curves.forEach((curve) => {
      const y0 = curve.evaluate(0);
      if (Number.isFinite(y0)) out.push({ id: `${curve.id}-y-intercept`, x: 0, y: y0, color: curve.color });
      findXIntercepts(curve.evaluate).forEach((x, idx) => {
        out.push({ id: `${curve.id}-x-intercept-${idx}`, x, y: 0, color: curve.color });
      });
    });
    // A curve paired against itself would find a "crossing" at every
    // sample (evaluate(x) - evaluate(x) is identically zero), so distinct
    // rows plotting the same curve twice is the one case worth not
    // bothering with — everything else, findXIntercepts' own dedup handles.
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const a = curves[i];
        const b = curves[j];
        findXIntercepts((x) => a.evaluate(x) - b.evaluate(x)).forEach((x, idx) => {
          const y = a.evaluate(x);
          if (Number.isFinite(y)) {
            out.push({ id: `${a.id}-${b.id}-intersect-${idx}`, x, y, color: INTERSECTION_COLOR });
          }
        });
      }
    }
    return out;
  }, [rows, results, curves]);

  // Discrete actions (add/delete a row, edit a slider's bounds) commit to
  // history immediately — there's no "burst" of these to coalesce.
  function applyRows(next: CalcRow[]) {
    setHistory((h) => [...h, rows]);
    setFuture([]);
    setRows(ensureTrailingBlank(next));
  }

  function updateRow(id: string, patch: Partial<CalcRow>) {
    applyRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function deleteRow(id: string) {
    applyRows(rows.length > 1 ? rows.filter((r) => r.id !== id) : [makeRow()]);
  }

  function addRow() {
    const newRow = makeRow();
    applyRows([...rows, newRow]);
    setPendingFocusId(newRow.id);
  }

  // Enter always splits into a new row right after the current one and
  // focuses it — regardless of whether anything was typed, the same way a
  // plain line break works in any text editor.
  function insertRowAfter(id: string) {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const newRow = makeRow();
    const next = [...rows.slice(0, idx + 1), newRow, ...rows.slice(idx + 1)];
    applyRows(next);
    setPendingFocusId(newRow.id);
  }

  // Inserted right above the row that referenced them, so they're already
  // in scope by the time that row is reclassified on the next render —
  // the row goes from "needs sliders" straight to a normal plotted curve.
  function addSliders(id: string, names: string[]) {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const newRows = names.map((name) => makeRow(`${name} = 1`));
    applyRows([...rows.slice(0, idx), ...newRows, ...rows.slice(idx)]);
  }

  // Typing and slider-dragging both funnel through here — high-frequency,
  // so the history push is deferred until a pause rather than immediate.
  function commitBurst(id: string, text: string) {
    if (burstRef.current.base === null) burstRef.current.base = rows;
    if (burstRef.current.timer !== null) window.clearTimeout(burstRef.current.timer);
    burstRef.current.timer = window.setTimeout(() => {
      const base = burstRef.current.base;
      burstRef.current.base = null;
      burstRef.current.timer = null;
      if (base) {
        setHistory((h) => [...h, base]);
        setFuture([]);
      }
    }, 600);
    setRows((rs) => ensureTrailingBlank(rs.map((r) => (r.id === id ? { ...r, text } : r))));
  }

  function undo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setFuture([rows, ...future]);
    setRows(prev);
  }

  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setHistory([...history, rows]);
    setRows(next);
  }

  // Escape-to-close — worth keeping now that there's no header bar with an
  // obvious close button sitting in the content itself.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keeps the sidebar's expanded width in step with the viewport — e.g.
  // rotating a phone or resizing the window — rather than only computing
  // it once at mount.
  useEffect(() => {
    function onResize() {
      setSidebarWidth(computeSidebarWidth());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="calculator-panel glass"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          role="dialog"
          aria-label="Calculator"
        >
          <div className="calculator-panel-body">
            <motion.div
              className="calculator-expression-list"
              animate={{ width: listCollapsed ? 0 : sidebarWidth }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              <div className="calculator-sidebar-wrap" style={{ width: sidebarWidth }}>
                <div className="calculator-sidebar-toolbar">
                  <button
                    type="button"
                    className="calculator-toolbar-btn"
                    aria-label="Add expression"
                    onClick={addRow}
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="button"
                    className="calculator-toolbar-btn"
                    aria-label="Undo"
                    disabled={history.length === 0}
                    onClick={undo}
                  >
                    <UndoIcon />
                  </button>
                  <button
                    type="button"
                    className="calculator-toolbar-btn"
                    aria-label="Redo"
                    disabled={future.length === 0}
                    onClick={redo}
                  >
                    <RedoIcon />
                  </button>
                </div>
                <div className="calculator-expression-list-inner">
                  {rows.map((row, i) => (
                    <CalculatorExpressionRow
                      key={row.id}
                      index={i + 1}
                      text={row.text}
                      color={colorForIndex(i)}
                      result={results[i]}
                      sliderRange={row.sliderRange}
                      inputRef={(el) => {
                        if (el) inputRefs.current.set(row.id, el);
                        else inputRefs.current.delete(row.id);
                      }}
                      onChangeText={(text) => commitBurst(row.id, text)}
                      onEnter={() => insertRowAfter(row.id)}
                      onChangeSliderValue={(value) => {
                        const result = results[i];
                        if (result.kind === 'definition') {
                          commitBurst(row.id, `${result.name} = ${value}`);
                        }
                      }}
                      onChangeSliderRange={(sliderRange) => updateRow(row.id, { sliderRange })}
                      onAddSliders={(names) => addSliders(row.id, names)}
                      onDelete={() => deleteRow(row.id)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
            <button
              type="button"
              className="calculator-sidebar-toggle"
              aria-label={listCollapsed ? 'Show expression list' : 'Hide expression list'}
              onClick={() => setListCollapsed((c) => !c)}
            >
              <span className={listCollapsed ? 'calculator-chevrons-flipped' : undefined}>
                <ChevronsIcon />
              </span>
            </button>
            <CalculatorGraph curves={curves} verticals={verticals} points={points} onClose={onClose} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
