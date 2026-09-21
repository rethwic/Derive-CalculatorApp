import { useEffect, useRef, useState } from 'react';
import type { FormulaVariant } from '../types';

function ChevronIcon() {
  return (
    <svg className="variant-chevron" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A native <select>'s open popup is rendered by the OS and ignores almost
// all CSS, so it can't carry the app's glass look. This is a custom
// button+list dropdown instead, built on the same floating .glass card
// pattern the search results already use, which we *can* fully style.
export function VariantPicker({
  variants,
  index,
  onChange,
}: {
  variants: FormulaVariant[];
  index: number;
  onChange: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = variants[index];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="variant-picker" ref={rootRef}>
      <button
        type="button"
        className="variant-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="variant-menu glass" role="listbox">
          {variants.map((v, i) => (
            <button
              key={v.label}
              type="button"
              role="option"
              aria-selected={i === index}
              className={`variant-option${i === index ? ' variant-option-active' : ''}`}
              onClick={() => {
                onChange(i);
                setOpen(false);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
