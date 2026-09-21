import { useEffect, useRef } from 'react';
import { OTHER_FUNCTION_NAMES, TRIG_FUNCTION_NAMES } from '../lib/mathEngine';

interface MathInputProps {
  value: string;
  className?: string;
  title?: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  inputRef?: (el: HTMLDivElement | null) => void;
}

// A small hand-rolled math editor rather than a full library (MathQuill
// drags in jQuery, MathLive drags in a whole computer-algebra engine on top
// of mathjs, which we already have) — it only needs to cover the two
// triggers Desmos-style calculators are known for: "^" opens a live
// superscript, "/" turns whatever you just typed into a stacked fraction.
// The DOM is the visual source of truth while typing; on every input we
// walk it back down into a plain mathjs-parseable string (e.g. a fraction
// becomes "(1)/(2)") for the rest of the app, which never needs to know
// this rich editing happened at all.

function extractValue(root: HTMLElement): string {
  let out = '';
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent?.replace(/​/g, '') ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.classList.contains('calc-sup')) {
      out += `^(${extractValue(el)})`;
      return;
    }
    if (el.classList.contains('calc-frac')) {
      const num = el.querySelector('.calc-frac-num');
      const den = el.querySelector('.calc-frac-den');
      out += `(${num ? extractValue(num as HTMLElement) : ''})/(${den ? extractValue(den as HTMLElement) : ''})`;
      return;
    }
    if (el.classList.contains('calc-radical')) {
      const argEl = el.querySelector('.calc-radical-arg');
      const arg = argEl ? extractValue(argEl as HTMLElement) : '';
      const kind = el.dataset.kind;
      if (kind === 'cbrt') {
        out += `cbrt(${arg})`;
      } else if (kind === 'nthroot') {
        const indexEl = el.querySelector('.calc-radical-index');
        const index = indexEl ? extractValue(indexEl as HTMLElement) : '';
        out += `nthRoot(${arg},${index || '2'})`;
      } else {
        out += `sqrt(${arg})`;
      }
      return;
    }
    el.childNodes.forEach(walk);
  }
  root.childNodes.forEach(walk);
  return out;
}

// Function names that, the moment you finish typing them, turn into their
// actual math symbol instead of staying as plain letters — e.g. typing the
// "t" in "sqrt" immediately swaps it for a real radical.
//
// Sorted longest-name-first so that when more than one registered name
// matches as a suffix (typing "asin" also ends in "sin"), the trigger
// check below picks the longer, more specific one instead of firing on
// the shorter name buried inside it.
const AUTO_SYMBOL_TRIGGERS: { name: string; kind: 'sqrt' | 'cbrt' | 'nthroot' }[] = [
  { name: 'sqrt', kind: 'sqrt' },
  { name: 'cbrt', kind: 'cbrt' },
  { name: 'nthroot', kind: 'nthroot' },
];
AUTO_SYMBOL_TRIGGERS.sort((a, b) => b.name.length - a.name.length);

// Every other named function (sin, cos, log, mean, ...) — these don't get
// a special symbol, but do get "()" auto-inserted the moment the name is
// complete. Without this, "sin" typed without a paren yet is just a bare
// symbol as far as mathjs is concerned, so it briefly (and confusingly)
// gets offered as a slider candidate right up until "(" is typed. Sorted
// longest-first for the same reason as AUTO_SYMBOL_TRIGGERS above.
const AUTO_PAREN_TRIGGERS = [...TRIG_FUNCTION_NAMES, ...OTHER_FUNCTION_NAMES].sort((a, b) => b.length - a.length);

// Grabs the trailing "token" immediately before the caret — a run of
// word/decimal characters, or a balanced parenthesized group — so typing
// "12/" turns the "12" that's already there into the fraction's numerator
// instead of starting from nothing.
function takeTrailingToken(text: string): { rest: string; token: string } {
  const parenMatch = text.match(/\(([^()]*)\)$/);
  if (parenMatch) {
    return { rest: text.slice(0, text.length - parenMatch[0].length), token: parenMatch[0] };
  }
  const wordMatch = text.match(/[a-zA-Z0-9.]+$/);
  if (wordMatch) {
    return { rest: text.slice(0, text.length - wordMatch[0].length), token: wordMatch[0] };
  }
  return { rest: text, token: '' };
}

export function MathInput({ value, className, title, onChange, onEnter, inputRef }: MathInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Starts at a sentinel that can never equal a real value (rather than
  // `value` itself) so the very first render always populates the DOM —
  // a row created with non-empty starting text (a slider's "a = 3", or
  // "d = 1" from an "add slider" button) otherwise renders as an empty
  // field forever, since React never touches a contentEditable's children.
  const lastEmitted = useRef<string | null>(null);

  // Only rewrites the DOM when the value changed for a reason other than
  // our own typing (undo/redo, a slider dragging elsewhere) — otherwise
  // every keystroke would reset the live cursor position mid-edit. This
  // does mean an externally-set value always renders as flat text, not
  // re-parsed into a fraction/superscript — a reasonable trade for how
  // rarely that path is hit (undo, or a slider rewriting "a = <value>").
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (rootRef.current) rootRef.current.textContent = value;
  }, [value]);

  function commit() {
    const root = rootRef.current;
    if (!root) return;
    const next = extractValue(root);
    lastEmitted.current = next;
    onChange(next);
  }

  // A radical widget shared by sqrt/cbrt/nthroot — an optional small index
  // (fixed "3" for cbrt, editable for nthroot), the √ glyph, and an
  // editable argument with a bar drawn over it via border-top.
  function insertRadical(range: Range, kind: 'sqrt' | 'cbrt' | 'nthroot') {
    range.deleteContents();

    const wrap = document.createElement('span');
    wrap.className = 'calc-radical';
    wrap.contentEditable = 'false';
    wrap.dataset.kind = kind;

    if (kind === 'cbrt') {
      const index = document.createElement('sup');
      index.className = 'calc-radical-index calc-radical-index-fixed';
      index.textContent = '3';
      wrap.appendChild(index);
    } else if (kind === 'nthroot') {
      const index = document.createElement('sup');
      index.className = 'calc-radical-index';
      index.contentEditable = 'true';
      index.spellcheck = false;
      index.textContent = '2';
      wrap.appendChild(index);
    }

    const symbol = document.createElement('span');
    symbol.className = 'calc-radical-symbol';
    symbol.textContent = '√';
    wrap.appendChild(symbol);

    const arg = document.createElement('span');
    arg.className = 'calc-radical-arg';
    arg.contentEditable = 'true';
    arg.spellcheck = false;
    const argText = document.createTextNode('​');
    arg.appendChild(argText);
    wrap.appendChild(arg);

    range.insertNode(wrap);

    const newRange = document.createRange();
    newRange.setStart(argText, 1);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(newRange);
  }

  // True if the text immediately before the caret ends with `name`. This
  // used to also require a word boundary in front of the match — rejecting
  // "sin" inside "dsin" the same as inside a hypothetical "notsqrt" — but
  // that's wrong here: mathEngine treats an unrecognized letter glued in
  // front of a known function name as a separate variable multiplying it
  // ("dsin" already evaluates as "d*sin(...)"), so the trigger needs to
  // fire there too, not just when the name stands alone. The one thing
  // that boundary check was rightly guarding against — "sin" matching
  // inside "asin" and firing on the wrong, shorter name — is instead
  // handled by checking trigger lists longest-name-first, so a real
  // ambiguity resolves to the more specific match rather than by refusing
  // to match at all.
  function endsWithWord(before: string, name: string): boolean {
    return before.endsWith(name);
  }

  // For the root functions: deletes the trigger word from the text node
  // (it's being replaced by an actual radical glyph) and returns a range
  // collapsed where it used to be, ready for the widget to be inserted.
  function consumeTriggerWord(before: string, container: Text, offset: number, name: string): Range {
    const startIdx = before.length - name.length;
    const fullText = container.textContent ?? '';
    container.textContent = fullText.slice(0, startIdx) + fullText.slice(offset);
    const range = document.createRange();
    range.setStart(container, startIdx);
    range.setEnd(container, startIdx);
    return range;
  }

  // For every other function name: the name itself stays as plain text —
  // only "()" gets inserted right after it, with the caret landing between
  // them so the argument can be typed immediately.
  function insertAutoParens(container: Text, offset: number) {
    const fullText = container.textContent ?? '';
    container.textContent = `${fullText.slice(0, offset)}()${fullText.slice(offset)}`;
    const newRange = document.createRange();
    newRange.setStart(container, offset + 1);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(newRange);
  }

  // Runs both trigger families on every input: a completed "sqrt"/"cbrt"/
  // "nthroot" becomes a radical symbol; any other completed function name
  // (sin, log, mean, ...) gets "()" auto-inserted right after it so mathjs
  // sees a real function call immediately — otherwise the bare name
  // briefly looks like an undefined variable and gets offered as a slider
  // right up until "(" is typed by hand.
  //
  // Backspace/Delete also fire a native "input" event, and without this
  // check they'd run through the exact same trigger logic — so deleting a
  // character that happens to leave a complete function name sitting at
  // the caret (which is nearly guaranteed while backspacing through
  // "sin(90)") would re-trigger the auto-paren insertion mid-deletion,
  // fighting the user's own backspace. inputType is the browser's own
  // signal for which of those this actually is.
  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const inputType = (e.nativeEvent as InputEvent).inputType;
    if (inputType && inputType.startsWith('delete')) {
      commit();
      return;
    }

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 && sel.isCollapsed ? sel.getRangeAt(0) : null;
    const container = range?.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer as Text) : null;

    if (container) {
      const offset = range!.startOffset;
      const before = container.textContent?.slice(0, offset) ?? '';

      const symbolTrigger = AUTO_SYMBOL_TRIGGERS.find((t) => endsWithWord(before, t.name));
      if (symbolTrigger) {
        insertRadical(consumeTriggerWord(before, container, offset, symbolTrigger.name), symbolTrigger.kind);
        commit();
        return;
      }

      const parenName = AUTO_PAREN_TRIGGERS.find((name) => endsWithWord(before, name));
      if (parenName) {
        insertAutoParens(container, offset);
        commit();
        return;
      }
    }

    commit();
  }

  function insertSuperscript() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !rootRef.current) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const sup = document.createElement('sup');
    sup.className = 'calc-sup';
    sup.contentEditable = 'true';
    sup.spellcheck = false;
    const zwsp = document.createTextNode('​');
    sup.appendChild(zwsp);
    range.insertNode(sup);

    const newRange = document.createRange();
    newRange.setStart(zwsp, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    commit();
  }

  function insertFraction() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !rootRef.current) return;
    const range = sel.getRangeAt(0);

    let numeratorText = '';
    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
      const container = range.startContainer as Text;
      const full = container.textContent ?? '';
      const before = full.slice(0, range.startOffset);
      const after = full.slice(range.startOffset);
      const { rest, token } = takeTrailingToken(before);
      numeratorText = token;
      container.textContent = rest + after;
      range.setStart(container, rest.length);
      range.setEnd(container, rest.length);
    }
    range.deleteContents();

    const frac = document.createElement('span');
    frac.className = 'calc-frac';
    frac.contentEditable = 'false';
    const num = document.createElement('span');
    num.className = 'calc-frac-num';
    num.contentEditable = 'true';
    num.spellcheck = false;
    num.textContent = numeratorText;
    const den = document.createElement('span');
    den.className = 'calc-frac-den';
    den.contentEditable = 'true';
    den.spellcheck = false;
    const denText = document.createTextNode('​');
    den.appendChild(denText);
    frac.append(num, den);
    range.insertNode(frac);

    const newRange = document.createRange();
    newRange.setStart(denText, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    commit();
  }

  // Backspacing right inside an empty auto-inserted "()" removes both
  // characters as one unit — otherwise it takes the "(" alone and leaves a
  // stranded ")" behind, which is exactly the "sin(90) minus one backspace
  // doesn't look like a function anymore" complaint (mismatched parens
  // read as a syntax error, not a function call).
  function tryCollapseEmptyParens(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return false;
    const container = range.startContainer as Text;
    const offset = range.startOffset;
    const text = container.textContent ?? '';
    if (offset === 0 || text[offset - 1] !== '(' || text[offset] !== ')') return false;

    container.textContent = text.slice(0, offset - 1) + text.slice(offset + 1);
    const newRange = document.createRange();
    newRange.setStart(container, offset - 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
  }

  // Fractions and radicals both wrap their editable parts (numerator/
  // denominator; index/argument) in a contentEditable="false" shell so the
  // widget reads as one atomic unit to the outer editor. That shell is
  // exactly what makes native Backspace get stuck: once an island empties
  // down to a bare <br>, there's no editable content left for the browser
  // to merge into on the far side of that "false" boundary, so Backspace
  // silently does nothing forever. (Superscript has no such shell — it's a
  // plain nested contentEditable=true span — which is why it never had
  // this problem.) This restores Backspace by hand: from the start of a
  // later island (denominator, or a root's argument) it steps back into
  // the previous one (numerator, or the index); from the start of the
  // first island it unwraps the whole widget back into plain text so the
  // next Backspace can keep merging into whatever came before it.
  function plainTextOf(el: Element): string {
    return (el.textContent ?? '').replace(/​/g, '');
  }

  function isCaretAtStartOf(root: Element, container: Node, offset: number): boolean {
    const range = document.createRange();
    range.selectNodeContents(root);
    try {
      range.setEnd(container, offset);
    } catch {
      return false;
    }
    return range.toString().replace(/​/g, '') === '';
  }

  function placeCaretAtEnd(el: Element) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function getEditableIslands(widget: Element): Element[] {
    const selector = widget.classList.contains('calc-frac')
      ? '.calc-frac-num, .calc-frac-den'
      : '.calc-radical-index[contenteditable="true"], .calc-radical-arg';
    return Array.from(widget.querySelectorAll(selector));
  }

  function unwrapWidget(widget: Element) {
    let replacement: string;
    if (widget.classList.contains('calc-frac')) {
      const num = widget.querySelector('.calc-frac-num');
      const den = widget.querySelector('.calc-frac-den');
      const numText = num ? plainTextOf(num) : '';
      const denText = den ? plainTextOf(den) : '';
      replacement = denText ? `${numText}/${denText}` : numText;
    } else {
      const arg = widget.querySelector('.calc-radical-arg');
      replacement = arg ? plainTextOf(arg) : '';
    }
    const textNode = document.createTextNode(replacement);
    widget.replaceWith(textNode);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function tryHandleIslandBackspace(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;
    const startEl = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
    if (!startEl) return false;

    const widget = startEl.closest('.calc-frac, .calc-radical');
    if (!widget) return false;
    const island = startEl.closest('.calc-frac-num, .calc-frac-den, .calc-radical-index, .calc-radical-arg');
    if (!island || !isCaretAtStartOf(island, container, offset)) return false;

    const islands = getEditableIslands(widget);
    const idx = islands.indexOf(island);
    if (idx > 0) {
      placeCaretAtEnd(islands[idx - 1]);
      return true;
    }
    unwrapWidget(widget);
    return true;
  }

  // The case above only fires once the caret is already *inside* one of a
  // widget's islands. But typing doesn't stop at the widget — you keep
  // going in the outer field, e.g. "(1/2)x" continues past the fraction
  // with ")x" as plain text right after it. Backspacing through that
  // plain text eventually lands the caret in the outer field immediately
  // to the right of the widget, and from there Backspace found nothing to
  // intercept: it isn't inside an island, so the boundary-stepping logic
  // above never ran, and — atomic contentEditable="false" chip or not —
  // there was no handling at all for stepping *into* it from the outside,
  // so it just sat there forever with no way to reach in and delete it
  // character by character. This is that missing entry point: from just
  // after a fraction or radical in plain text, Backspace steps into its
  // last island (denominator, or the argument) instead of doing nothing.
  function isWidget(node: Node | null): node is Element {
    return node instanceof Element && (node.classList.contains('calc-frac') || node.classList.contains('calc-radical'));
  }

  // A node the browser leaves behind that carries no real content of its
  // own — an empty text node, or the <br> it substitutes in for an
  // entirely empty region. This editor never lets the user insert an
  // actual line break (Enter always creates a new row instead), so any
  // <br> here is guaranteed to be one of those placeholders, never real
  // content — safe to walk straight past when looking for what's really
  // sitting immediately before the caret.
  function isInertPlaceholder(node: Node | null): boolean {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '') === '';
    return node.nodeName === 'BR';
  }

  function tryEnterWidgetFromOutside(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    const startEl = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
    if (startEl?.closest('.calc-frac, .calc-radical')) return false;

    let node: Node | null;
    if (container.nodeType === Node.TEXT_NODE) {
      if (offset !== 0) return false;
      node = container.previousSibling;
    } else {
      node = offset > 0 ? container.childNodes[offset - 1] : null;
    }
    while (isInertPlaceholder(node)) node = node!.previousSibling;
    if (!isWidget(node)) return false;

    const islands = getEditableIslands(node);
    const lastIsland = islands[islands.length - 1];
    if (!lastIsland) return false;
    placeCaretAtEnd(lastIsland);
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
      return;
    }
    if (e.key === '^') {
      e.preventDefault();
      insertSuperscript();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      insertFraction();
      return;
    }
    if (e.key === 'Backspace' && (tryCollapseEmptyParens() || tryHandleIslandBackspace() || tryEnterWidgetFromOutside())) {
      e.preventDefault();
      commit();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        inputRef?.(el);
      }}
      className={className}
      title={title}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}
