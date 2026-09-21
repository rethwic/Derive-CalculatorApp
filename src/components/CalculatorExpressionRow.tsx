import { useEffect, useRef, useState } from 'react';
import type { RowResult } from '../lib/mathEngine';
import { MathInput } from './MathInput';

export interface SliderRange {
  min: number;
  max: number;
}

interface CalculatorExpressionRowProps {
  index: number;
  text: string;
  color: string;
  result: RowResult;
  sliderRange: SliderRange;
  inputRef?: (el: HTMLDivElement | null) => void;
  onChangeText: (text: string) => void;
  onEnter: () => void;
  onChangeSliderValue: (value: number) => void;
  onChangeSliderRange: (range: SliderRange) => void;
  onAddSliders: (names: string[]) => void;
  onDelete: () => void;
}

// A white triangle silhouette with the "!" cut out in the box's own
// color, so it reads correctly against whatever curve color the row would
// take on once the missing variable(s) are turned into sliders.
function WarningIcon({ boxColor }: { boxColor: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2L22 20H2L12 3.2Z" fill="#fff" />
      <rect x="11.05" y="8.5" width="1.9" height="6" rx="0.95" fill={boxColor} />
      <rect x="11.05" y="16.2" width="1.9" height="1.9" rx="0.95" fill={boxColor} />
    </svg>
  );
}

function formatSliderValue(value: number): string {
  return Number(value.toFixed(4)).toString();
}

// Rounds to 10 significant digits before restringifying, which is enough
// precision for any normal calculation while cleaning up the floating-point
// noise plain arithmetic tends to leave behind (0.1 + 0.2 -> 0.30000000000000004).
function formatResult(value: number): string {
  return Number(value.toPrecision(10)).toString();
}

interface SliderBoundInputProps {
  value: number;
  label: string;
  invalid: boolean;
  title?: string;
  onCommit: (value: number) => void;
}

// A plain text field rather than <input type="number"> — the number input's
// native "badInput" behavior reports its own .value as "" for anything it
// can't parse yet, including the "-" you type as the very first keystroke
// of a negative bound. That empty string turns into Number("") = 0 the
// moment it reaches onChange, so the field snaps to "0" mid-keystroke and
// the minus sign is lost — typing a negative bound by hand never actually
// worked, only the up/down arrows (which never pass through that state).
// Local text stays exactly what was typed; it only feeds a value upstream
// once it actually parses to a finite number, and reverts to the last
// valid value on blur if what's left over doesn't.
function SliderBoundInput({ value, label, invalid, title, onCommit }: SliderBoundInputProps) {
  const [text, setText] = useState(() => String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`calculator-expr-slider-bound${invalid ? ' calculator-expr-slider-bound-error' : ''}`}
      value={text}
      title={title}
      aria-label={label}
      aria-invalid={invalid}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const parsed = Number(next);
        if (next.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
      }}
      onBlur={() => {
        focused.current = false;
        const parsed = Number(text);
        if (text.trim() === '' || !Number.isFinite(parsed)) setText(String(value));
      }}
    />
  );
}

export function CalculatorExpressionRow({
  index,
  text,
  color,
  result,
  sliderRange,
  inputRef,
  onChangeText,
  onEnter,
  onChangeSliderValue,
  onChangeSliderRange,
  onAddSliders,
  onDelete,
}: CalculatorExpressionRowProps) {
  const isPlotted = result.kind === 'plot' || result.kind === 'vertical' || result.kind === 'point';
  const isError = result.kind === 'error';
  const isEmpty = result.kind === 'empty';
  const needsSliders = result.kind === 'needs-sliders';

  return (
    <div className={`calculator-expr-row${isEmpty ? ' calculator-expr-row-empty' : ''}`}>
      <div className="calculator-expr-row-main">
        <span
          className="calculator-expr-number"
          style={isPlotted || needsSliders ? { background: color, color: '#fff' } : undefined}
          aria-hidden="true"
        >
          {needsSliders ? <WarningIcon boxColor={color} /> : index}
        </span>
        <MathInput
          inputRef={inputRef}
          className={`calculator-expr-input${isError ? ' calculator-expr-input-error' : ''}`}
          title={isError ? result.message : undefined}
          value={text}
          onChange={onChangeText}
          onEnter={onEnter}
        />
        {result.kind === 'value' && <span className="calculator-expr-result">= {formatResult(result.value)}</span>}
        {result.kind === 'point' && (
          <span className="calculator-expr-result">
            ({formatResult(result.x)}, {formatResult(result.y)})
          </span>
        )}
        <button type="button" className="calculator-expr-delete" aria-label="Delete expression" onClick={onDelete}>
          ×
        </button>
      </div>

      {result.kind === 'definition' && (() => {
        const rangeInvalid = sliderRange.min > sliderRange.max;
        const boundTitle = rangeInvalid ? 'Left value must not be greater than the right value' : undefined;
        return (
          <div className="calculator-expr-slider-wrap">
            <div className={`calculator-expr-slider${rangeInvalid ? ' calculator-expr-slider-invalid' : ''}`}>
              <SliderBoundInput
                value={sliderRange.min}
                label={`Minimum value for ${result.name}`}
                invalid={rangeInvalid}
                title={boundTitle}
                onCommit={(min) => onChangeSliderRange({ ...sliderRange, min })}
              />
              <input
                type="range"
                className="calculator-expr-slider-input"
                disabled={rangeInvalid}
                min={rangeInvalid ? result.value : sliderRange.min}
                max={rangeInvalid ? result.value : sliderRange.max}
                step={rangeInvalid ? 1 : (sliderRange.max - sliderRange.min) / 400 || 0.01}
                value={result.value}
                style={{
                  ['--fill' as string]: rangeInvalid
                    ? '0%'
                    : `${((result.value - sliderRange.min) / (sliderRange.max - sliderRange.min || 1)) * 100}%`,
                }}
                onChange={(e) => onChangeSliderValue(Number(e.target.value))}
                aria-label={`Value of ${result.name}`}
              />
              <SliderBoundInput
                value={sliderRange.max}
                label={`Maximum value for ${result.name}`}
                invalid={rangeInvalid}
                title={boundTitle}
                onCommit={(max) => onChangeSliderRange({ ...sliderRange, max })}
              />
              <span className="calculator-expr-slider-value">{formatSliderValue(result.value)}</span>
            </div>
            {rangeInvalid && (
              <div className="calculator-expr-slider-error" role="alert">
                Left value must not be greater than the right value
              </div>
            )}
          </div>
        );
      })()}

      {result.kind === 'needs-sliders' && (
        <div className="calculator-expr-slider-suggest">
          <span className="calculator-expr-slider-suggest-label">add slider:</span>
          {result.variables.map((name) => (
            <button
              key={name}
              type="button"
              className="calculator-expr-suggest-btn"
              onClick={() => onAddSliders([name])}
            >
              {name}
            </button>
          ))}
          {result.variables.length > 1 && (
            <button
              type="button"
              className="calculator-expr-suggest-btn calculator-expr-suggest-btn-all"
              onClick={() => onAddSliders(result.variables)}
            >
              all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
