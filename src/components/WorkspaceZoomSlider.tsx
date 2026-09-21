import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MIN_SCALE, MAX_SCALE } from '../context/WorkspaceContext';

interface WorkspaceZoomSliderProps {
  scale: number;
  onChange: (scale: number) => void;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

// A custom drag-anywhere track rather than a styled <input type="range"> —
// there's no thumb graphic to grab; the filled bar itself grows toward
// wherever the pointer is, which is the "cool effect" a plain range input
// can't give since its thumb only ever snaps straight to the value.
export function WorkspaceZoomSlider({ scale, onChange }: WorkspaceZoomSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const fraction = clamp01((scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE));

  function fractionFromClientX(clientX: number) {
    const track = trackRef.current;
    // Guards a real (if rare) divide-by-zero: if this ever runs before the
    // track has been laid out (width 0), rect.width would be the
    // denominator and produce Infinity/NaN, which then gets written into
    // the persisted view and corrupts zoom permanently on every future load.
    if (!track || track.getBoundingClientRect().width === 0) return fraction;
    const rect = track.getBoundingClientRect();
    return clamp01((clientX - rect.left) / rect.width);
  }

  function commit(f: number) {
    onChange(MIN_SCALE + f * (MAX_SCALE - MIN_SCALE));
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    setDragging(true);
    commit(fractionFromClientX(e.clientX));
  }

  // Dragging is tracked with window-level listeners rather than pointer
  // capture on the track — the fill's own width is what visually follows
  // the cursor, so the track element itself never needs to "own" the
  // pointer for the gesture to read correctly.
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      commit(fractionFromClientX(e.clientX));
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') commit(clamp01(fraction + 0.05));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') commit(clamp01(fraction - 0.05));
  }

  const percent = Math.round(scale * 100);

  return (
    <div className="workspace-zoom-slider-row" onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={trackRef}
        className={`workspace-zoom-track${dragging ? ' workspace-zoom-track-active' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Zoom level"
        aria-valuemin={Math.round(MIN_SCALE * 100)}
        aria-valuemax={Math.round(MAX_SCALE * 100)}
        aria-valuenow={percent}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        <motion.div
          className="workspace-zoom-fill"
          animate={{ width: `${fraction * 100}%` }}
          transition={{ type: 'spring', stiffness: dragging ? 700 : 260, damping: dragging ? 45 : 26 }}
        />
      </div>
      <span className="workspace-zoom-percent">{percent}%</span>
    </div>
  );
}
