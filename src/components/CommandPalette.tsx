import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Katex } from './Katex';
import { formulas } from '../data/formulas';
import { categoryMap } from '../data/categories';
import { useDetail } from '../context/DetailContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { searchFormulas } from '../lib/search';
import { parseSmartQuery } from '../lib/smartQuery';
import { ACCENTS, getTheme, setAccent, setTheme, useAccent, useTheme } from '../lib/theme';
import { looksLikeMath } from '../lib/mathGuard';
import type { CalcAnswer } from '../lib/paletteCalc';
import { convertForPalette } from '../lib/paletteConvert';
import { lookupConstants } from '../lib/constants';
import { getRecent, type RecentItem } from '../lib/recent';
import { cancelTimer, formatCountdown, pauseTimer, resumeTimer, startTimer, useTimer } from '../lib/timer';
import { copyText } from '../lib/clipboard';
import { showStatus } from '../lib/islandStatus';

// Opened from anywhere with Ctrl/⌘ + K (or by dispatching this event, which is
// what the "Ctrl K" chip on the search bar does).
export const OPEN_PALETTE_EVENT = 'derive:open-palette';

// 'search' is the everyday mode: open a formula, jump to a page, change the
// look. 'pin' is the workspace's "add a formula": the same box, but picking a
// formula pins it to the workspace instead of opening it.
type PaletteMode = 'search' | 'pin';

// `origin` is the element the palette should grow out of (and shrink back
// into): the search bar, or the workspace's "add" button.
export function openCommandPalette(mode: PaletteMode = 'search', origin?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { mode, origin } }));
}

// Where the palette rests when open: near the top, centered. Mirrors the CSS
// (.cmdk-scrim / .cmdk), because the grow-out animation needs the numbers.
function paletteTarget() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(620, vw - 32);
  return {
    left: (vw - width) / 2,
    top: vw <= 640 ? 72 : vh * 0.14,
    width,
    maxHeight: Math.min(vh * 0.72, 540),
  };
}

// Both eat up the distance right away and settle softly (an ease-in/out close
// barely moved for its first moments, which read as the palette just vanishing
// before anything shrank); closing is a touch quicker.
// How long the frame and the bar take to trade places at each end.
const FADE_MS = 140;
const OPEN_TRANSITION = { duration: 0.46, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };
const CLOSE_TRANSITION = { duration: 0.38, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

// Pressing Ctrl/⌘ + K on a page that shows the search bar grows the palette
// out of it, just as clicking the bar does.
function findVisibleSearchBar(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('.search-bar');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight ? el : null;
}

interface Item {
  id: string;
  group: string;
  kind: 'answer' | 'match' | 'formula' | 'action' | 'calc';
  title: string;
  sub?: string;
  latex?: string;
  // Small marker for actions: a glyph, or a swatch color.
  glyph?: string;
  swatch?: { from: string; to: string };
  run: () => void;
}

function formatValue(n: number): string {
  if (n !== 0 && (Math.abs(n) < 1e-4 || Math.abs(n) >= 1e9)) return n.toExponential(4);
  return String(Number(n.toPrecision(6)));
}

function SearchIcon() {
  return (
    <svg className="cmdk-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const PAGES: { title: string; path: string; keywords: string }[] = [
  { title: 'Home', path: '/', keywords: 'landing start main' },
  { title: 'Math', path: '/math', keywords: 'algebra geometry calculus statistics' },
  { title: 'Science', path: '/science', keywords: 'physics chemistry' },
  { title: 'Tech', path: '/tech', keywords: 'computer science cs' },
  { title: 'Workspace', path: '/workspace', keywords: 'canvas pinned board' },
  { title: 'Contact', path: '/contact', keywords: 'feedback recommendation email' },
];

const TIMER_PRESETS: { minutes: number; title: string }[] = [
  { minutes: 15, title: 'Start a 15 minute timer' },
  { minutes: 30, title: 'Start a 30 minute timer' },
  { minutes: 60, title: 'Start a 60 minute timer' },
];

// "15 min timer", "timer 20", "timer for 90 minutes"
function timerMinutesFrom(q: string): number | null {
  const m = q
    .trim()
    .match(/^(?:(\d{1,3})\s*(?:min(?:ute)?s?|m)?\s*timer|timer\s*(?:for\s*)?(\d{1,3})\s*(?:min(?:ute)?s?|m)?)$/i);
  const minutes = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 180 ? minutes : null;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('search');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // The element (and its rect) the palette is growing out of, if any.
  const originEl = useRef<HTMLElement | null>(null);
  const hideOriginTimer = useRef<number | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<Element | null>(null);
  const navigate = useNavigate();
  const { openDetail } = useDetail();
  const { addFormula } = useWorkspace();
  const theme = useTheme();
  const accent = useAccent();
  const timer = useTimer();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [calc, setCalc] = useState<CalcAnswer | null>(null);
  const [calcPending, setCalcPending] = useState(false);

  function close() {
    // The real search bar returns the moment closing starts, so the palette
    // visibly shrinks *into* a bar that's already there, instead of the bar
    // popping in after the palette has gone.
    if (hideOriginTimer.current !== null) window.clearTimeout(hideOriginTimer.current);
    if (originEl.current) delete originEl.current.dataset.away;
    setOpen(false);
    setQuery('');
    setActive(0);
    const target = returnFocusTo.current;
    returnFocusTo.current = null;
    if (target instanceof HTMLElement) target.focus();
  }

  useEffect(() => {
    function openPalette(e?: Event) {
      const detail = (e as CustomEvent<{ mode?: PaletteMode; origin?: HTMLElement | null }> | undefined)?.detail;
      setMode(detail?.mode === 'pin' ? 'pin' : 'search');
      const el = detail?.origin ?? findVisibleSearchBar();
      originEl.current = el;
      if (el) {
        setOrigin(el.getBoundingClientRect());
        // Hidden while the palette is out, so it reads as this one element
        // moving up (see [data-away] in index.css) — but only once the frame has
        // faded in over it, so the two hand off without a blink.
        if (hideOriginTimer.current !== null) window.clearTimeout(hideOriginTimer.current);
        hideOriginTimer.current = window.setTimeout(() => {
          el.dataset.away = 'true';
        }, FADE_MS);
      } else {
        setOrigin(null);
      }
      returnFocusTo.current = document.activeElement;
      setRecent(getRecent());
      setOpen(true);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else openPalette();
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, openPalette);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, openPalette);
    };
    // close() only touches state setters and a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const q = query.trim();

  // Arithmetic typed into the box ("2^10", "15% of 240"): the math engine is
  // only fetched the first time a query actually looks like a sum.
  useEffect(() => {
    if (mode !== 'search' || !looksLikeMath(q)) {
      setCalc(null);
      setCalcPending(false);
      return;
    }
    let cancelled = false;
    setCalcPending(true);
    import('../lib/paletteCalc').then(({ evaluateForPalette }) => {
      if (cancelled) return;
      setCalc(evaluateForPalette(q));
      setCalcPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [q, mode]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const rippleFrom = { x: window.innerWidth / 2, y: 90 };

    // Adding to the workspace: just formulas (whole cards, so no per-shape
    // entries), a short starter list when the box is empty.
    if (mode === 'pin') {
      const candidates = q
        ? searchFormulas(formulas, q)
            .filter((h) => h.variantIndex === undefined)
            .map((h) => h.formula)
        : formulas.slice(0, 12);
      return candidates.slice(0, 12).map<Item>((f) => ({
        id: `pin-${f.id}`,
        group: q ? 'Formulas' : 'Suggestions',
        kind: 'formula',
        title: f.title,
        sub: categoryMap[f.category].name,
        latex: f.latex,
        run: () => addFormula(f),
      }));
    }

    // --- a unit conversion ("5 km in miles"), then a calculation, come first;
    // Enter copies the answer
    const conversion = q ? convertForPalette(q) : null;
    if (conversion) {
      out.push({
        id: 'convert',
        group: 'Conversion',
        kind: 'calc',
        title: `= ${conversion.display}`,
        sub: `${conversion.expression} · Enter to copy`,
        glyph: '⇄',
        run: async () => {
          const copied = await copyText(conversion.copy);
          if (copied) showStatus(`Copied ${conversion.display}`, 'copy');
          else showStatus("Couldn't copy", 'info');
        },
      });
    }
    if (calc && !conversion) {
      out.push({
        id: 'calc',
        group: 'Calculator',
        kind: 'calc',
        title: `= ${calc.display}`,
        sub: `${calc.expression} · Enter to copy`,
        glyph: '=',
        run: async () => {
          const copied = await copyText(calc.copy);
          if (copied) showStatus(`Copied ${calc.display}`, 'copy');
          else showStatus("Couldn't copy", 'info');
        },
      });
    }

    // --- a physical constant asked for by name ("planck", "speed of light")
    if (q) {
      lookupConstants(q).forEach((c) => {
        out.push({
          id: `const-${c.id}`,
          group: 'Constant',
          kind: 'calc',
          title: `= ${c.display}`,
          sub: `${c.name} (${c.symbol}) · Enter to copy`,
          glyph: c.symbol.length > 2 ? c.symbol.slice(0, 1) : c.symbol,
          run: async () => {
            const copied = await copyText(c.copy);
            if (copied) showStatus(`Copied ${c.name}`, 'copy');
            else showStatus("Couldn't copy", 'info');
          },
        });
      });
    }

    // --- "15 min timer" typed out becomes a one-tap timer
    const typedMinutes = q ? timerMinutesFrom(q) : null;
    if (typedMinutes !== null) {
      out.push({
        id: 'timer-typed',
        group: 'Timer',
        kind: 'action',
        title: `Start a ${typedMinutes} minute timer`,
        sub: 'timer countdown',
        glyph: '⏱',
        run: () => {
          startTimer(typedMinutes);
          showStatus(`Timer set · ${typedMinutes} min`, 'bell', 1800);
        },
      });
    }

    // --- formulas: worked answers first, then plain matches
    const smart = q ? parseSmartQuery(q) : [];
    smart.forEach((s) => {
      out.push({
        id: `smart-${s.formula.id}-${s.variantIndex ?? 'base'}`,
        group: 'Answers',
        kind: s.kind === 'answer' ? 'answer' : 'match',
        title:
          s.kind === 'answer'
            ? `${s.targetSymbol} ≈ ${formatValue(s.value)}${s.targetUnit ? ` ${s.targetUnit}` : ''}`
            : s.title,
        sub:
          s.kind === 'answer'
            ? `${s.title} · using ${s.knowns.map((k) => `${k.symbol} = ${formatValue(k.value)}${k.unit ? ` ${k.unit}` : ''}`).join(', ')}`
            : s.targetMeaning
              ? `Solve for ${s.targetMeaning.toLowerCase()}`
              : undefined,
        latex: s.latex,
        run: () => openDetail(s.formula, null, s.prefill, s.variantIndex),
      });
    });
    if (q) {
      searchFormulas(formulas, q)
        .filter((h) => !smart.some((s) => s.formula.id === h.formula.id && s.variantIndex === h.variantIndex))
        .slice(0, 8)
        .forEach((h) => {
          out.push({
            id: `formula-${h.formula.id}-${h.variantIndex ?? 'base'}`,
            group: 'Formulas',
            kind: 'formula',
            title: h.title,
            sub: categoryMap[h.formula.category].name,
            latex: h.latex,
            run: () => openDetail(h.formula, null, undefined, h.variantIndex),
          });
        });
    }

    // --- Recent: what you opened last, when the box is empty
    if (!q) {
      recent.forEach((r) => {
        const formula = formulas.find((f) => f.id === r.id);
        if (!formula) return;
        const variant = r.variantIndex !== undefined ? formula.variants?.[r.variantIndex] : undefined;
        out.push({
          id: `recent-${r.id}-${r.variantIndex ?? 'base'}`,
          group: 'Recent',
          kind: 'formula',
          title: variant ? `${formula.title} — ${variant.label}` : formula.title,
          sub: categoryMap[formula.category].name,
          latex: variant ? variant.latex : formula.latex,
          run: () => openDetail(formula, null, undefined, r.variantIndex),
        });
      });
    }

    // --- timer: controls while one is running, presets otherwise
    const timerActions: Item[] =
      timer.phase === 'idle'
        ? TIMER_PRESETS.map<Item>((t) => ({
            id: `timer-${t.minutes}`,
            group: 'Timer',
            kind: 'action',
            title: t.title,
            sub: 'timer countdown study focus pomodoro',
            glyph: '⏱',
            run: () => {
              startTimer(t.minutes);
              showStatus(`Timer set · ${t.minutes} min`, 'bell', 1800);
            },
          }))
        : [
            {
              id: 'timer-toggle',
              group: 'Timer',
              kind: 'action',
              title: timer.phase === 'running' ? `Pause timer (${formatCountdown(timer.remainingMs)} left)` : `Resume timer (${formatCountdown(timer.remainingMs)} left)`,
              sub: 'timer pause resume countdown',
              glyph: timer.phase === 'running' ? '⏸' : '▶',
              run: () => (timer.phase === 'running' ? pauseTimer() : resumeTimer()),
            },
            {
              id: 'timer-cancel',
              group: 'Timer',
              kind: 'action',
              title: 'Cancel timer',
              sub: 'timer stop cancel countdown',
              glyph: '✕',
              run: () => cancelTimer(),
            },
          ];

    // --- actions (all of them when the box is empty, otherwise the ones that match)
    const actions: Item[] = [
      ...PAGES.map<Item>((p) => ({
        id: `go-${p.path}`,
        group: 'Go to',
        kind: 'action',
        title: p.title,
        sub: `${p.keywords}`,
        glyph: '→',
        run: () => navigate(p.path),
      })),
      ...timerActions,
      {
        id: 'toggle-theme',
        group: 'Appearance',
        kind: 'action',
        title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        sub: 'dark light theme mode night',
        glyph: '◐',
        run: () => setTheme(getTheme() === 'dark' ? 'light' : 'dark', rippleFrom),
      },
      ...ACCENTS.map<Item>((a) => ({
        id: `accent-${a.id}`,
        group: 'Appearance',
        kind: 'action',
        title: `Accent: ${a.label}${accent === a.id ? ' (current)' : ''}`,
        sub: 'accent color theme',
        swatch: { from: a.from, to: a.to },
        run: () => setAccent(a.id, rippleFrom),
      })),
    ];
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = actions.filter((a) => {
      if (tokens.length === 0) return true;
      const hay = `${a.title} ${a.sub ?? ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    // Actions never crowd out formula results: capped when there's a query.
    return out.concat(q ? matching.slice(0, 4) : matching);
  }, [q, mode, theme, accent, navigate, openDetail, addFormula, calc, recent, timer.phase, timer.remainingMs]);

  // Keep the highlighted row in range and in view.
  useEffect(() => {
    setActive(0);
  }, [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, items]);

  function run(item: Item | undefined) {
    if (!item) return;
    close();
    item.run();
  }

  function onInputKey(e: React.KeyboardEvent) {
    // Once closing has begun the palette is only fading out: its list has
    // already reset, so a stray extra key (a repeated Enter) must not act on it.
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  let lastGroup = '';
  const target = paletteTarget();

  return (
    <AnimatePresence
      onExitComplete={() => {
        originEl.current = null;
      }}
    >
      {open && (
        <motion.div
          className="cmdk-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.3 } }}
          exit={{ opacity: 0, transition: CLOSE_TRANSITION }}
          onPointerDown={close}
        >
          <motion.div
            className="cmdk glass"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            // Grown out of the bar that was clicked: the frame starts as exactly
            // that shape in exactly that spot, moves up, and opens downward.
            // Only the frame animates — its content is laid out at its final
            // size the whole time (see .cmdk-inner) and merely revealed, so
            // nothing reflows or squashes on the way in or out. (No origin: a
            // plain drop-in.)
            initial={
              origin
                ? {
                    x: origin.left - target.left,
                    y: origin.top - target.top,
                    width: origin.width,
                    height: origin.height,
                    borderRadius: origin.height / 2,
                    opacity: 0,
                  }
                : { opacity: 0, y: -14, scale: 0.97 }
            }
            animate={
              origin
                ? {
                    x: 0,
                    y: 0,
                    width: target.width,
                    height: 'auto',
                    borderRadius: 22,
                    opacity: 1,
                    transition: { ...OPEN_TRANSITION, opacity: { duration: FADE_MS / 1000 } },
                  }
                : { opacity: 1, y: 0, scale: 1, transition: OPEN_TRANSITION }
            }
            exit={
              origin
                ? {
                    x: origin.left - target.left,
                    y: origin.top - target.top,
                    width: origin.width,
                    height: origin.height,
                    borderRadius: origin.height / 2,
                    // Solid for most of the shrink, then out over the last stretch,
                    // onto the real bar now waiting underneath.
                    opacity: [1, 1, 0],
                    transition: { ...CLOSE_TRANSITION, opacity: { duration: 0.38, times: [0, 0.68, 1], ease: 'linear' } },
                  }
                : { opacity: 0, y: -8, scale: 0.98, transition: CLOSE_TRANSITION }
            }
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="cmdk-inner" style={{ width: target.width, maxHeight: target.maxHeight }}>
            <div className="cmdk-input-row">
              <SearchIcon />
              <input
                ref={inputRef}
                className="cmdk-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={
                  mode === 'pin' ? 'Search a formula to add to your workspace…' : 'Search formulas, or type “r = 6 cm”…'
                }
                spellCheck={false}
                autoComplete="off"
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-list"
                aria-activedescendant={items[active] ? `cmdk-item-${items[active].id}` : undefined}
              />
              <kbd className="cmdk-kbd">esc</kbd>
            </div>

            <motion.div
              className="cmdk-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.22, delay: 0.14 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
            <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
              {items.length === 0 && <div className="cmdk-empty">{calcPending ? 'Calculating…' : 'No results'}</div>}
              {items.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <div key={item.id}>
                    {header && <div className="cmdk-group">{header}</div>}
                    <button
                      type="button"
                      id={`cmdk-item-${item.id}`}
                      role="option"
                      aria-selected={i === active}
                      data-active={i === active}
                      className={`cmdk-item cmdk-item-${item.kind}`}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => run(item)}
                    >
                      <span className="cmdk-lead">
                        {item.latex ? (
                          <Katex math={item.latex} />
                        ) : item.swatch ? (
                          <span
                            className="cmdk-swatch"
                            style={{ '--from': item.swatch.from, '--to': item.swatch.to } as React.CSSProperties}
                          />
                        ) : (
                          <span className="cmdk-glyph">{item.glyph}</span>
                        )}
                      </span>
                      <span className="cmdk-text">
                        <span className="cmdk-title">{item.title}</span>
                        {item.sub && item.kind !== 'action' && <span className="cmdk-sub">{item.sub}</span>}
                      </span>
                      {i === active && <span className="cmdk-enter" aria-hidden="true">↵</span>}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="cmdk-foot" aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> {mode === 'pin' ? 'add' : 'open'}</span>
              <span><kbd>esc</kbd> close</span>
            </div>
            </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
