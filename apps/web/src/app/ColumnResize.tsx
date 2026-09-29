import { useRef } from 'react';

export function ColumnResize({ width, onChange }: { width: number; onChange: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (next: number) => onChange(Math.max(280, Math.min(1000, next)));
  return <button type="button" className="column-resize" aria-label="Resize RFO name column"
    title="Drag to resize. Use arrow keys for precision; double-click to reset."
    onDoubleClick={() => onChange(440)}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); resize(width + (event.key === 'ArrowRight' ? 24 : -24));
      }
      if (event.key === 'Home') { event.preventDefault(); onChange(440); }
    }}
    onPointerDown={(event) => {
      drag.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
    onPointerUp={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
  ><span aria-hidden="true">⋮</span></button>;
}
