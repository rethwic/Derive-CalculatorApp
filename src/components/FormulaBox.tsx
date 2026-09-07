import { useEffect, useRef, useState } from 'react';
import { Katex } from './Katex';

// Renders one boxed formula display. No scrolling inside it — instead it
// shrinks to fit whenever the rendered equation is naturally wider than the
// box (e.g. on a narrow screen), so nothing is ever cut off or scrollable.
export function FormulaBox({ latex }: { latex: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    const wrap = wrapRef.current;
    if (!box || !wrap) return;

    function recalc() {
      const style = getComputedStyle(box!);
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = box!.clientWidth - paddingX;
      const natural = wrap!.scrollWidth;
      setScale(natural > 0 && available > 0 && natural > available ? available / natural : 1);
    }

    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(box);
    return () => observer.disconnect();
  }, [latex]);

  return (
    <div className="detail-formula" ref={boxRef}>
      <span ref={wrapRef} className="detail-formula-scale" style={{ transform: `scale(${scale})` }}>
        <Katex math={latex} block />
      </span>
    </div>
  );
}
