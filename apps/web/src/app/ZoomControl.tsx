import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export function ZoomControl() {
  const [zoom, setZoom] = useState(() => {
    try { const saved = Number(localStorage.getItem('caltrack.pageZoom')); return saved >= 75 && saved <= 125 ? saved : 100; }
    catch { return 100; }
  });
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom / 100);
    try { localStorage.setItem('caltrack.pageZoom', String(zoom)); } catch { /* Session-only preference. */ }
    return () => { document.documentElement.style.zoom = ''; };
  }, [zoom]);
  return <div className="zoom-control" role="group" aria-label="Page zoom">
    <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 75} onClick={() => setZoom((value) => Math.max(75, value - 5))}><Icon name="zoomOut" size={15} /></button>
    <button type="button" className="zoom-reset" aria-label={`Page zoom ${zoom}%. Reset to 100%`} title="Reset zoom to 100%" onClick={() => setZoom(100)}>{zoom}%</button>
    <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 125} onClick={() => setZoom((value) => Math.min(125, value + 5))}><Icon name="zoomIn" size={15} /></button>
  </div>;
}
