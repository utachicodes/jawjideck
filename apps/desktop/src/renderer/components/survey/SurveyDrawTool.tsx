/**
 * Survey Draw Tool - Map click handler for polygon drawing.
 * Follows the same pattern as FenceDrawTool.
 * Click to add vertices, double-click to complete, ESC to cancel.
 */
import { useEffect } from 'react';
import { useMapEvents } from 'react-leaflet';
import { useSurveyStore } from '../../stores/survey-store';

export function SurveyDrawTool() {
  const drawMode = useSurveyStore((s) => s.drawMode);
  const drawingVertices = useSurveyStore((s) => s.drawingVertices);
  const addVertex = useSurveyStore((s) => s.addVertex);
  const completePolygon = useSurveyStore((s) => s.completePolygon);
  const cancelDrawing = useSurveyStore((s) => s.cancelDrawing);

  useMapEvents({
    click: (e) => {
      if (drawMode !== 'polygon') return;
      addVertex(e.latlng.lat, e.latlng.lng);
    },
    dblclick: (e) => {
      if (drawMode !== 'polygon') return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      if (drawingVertices.length >= 2) {
        // Double-click adds a vertex then completes (3+ total)
        completePolygon();
      }
    },
    contextmenu: (e) => {
      if (drawMode !== 'polygon') return;
      e.originalEvent.preventDefault();
      cancelDrawing();
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (drawMode !== 'polygon') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing();
      } else if (e.key === 'Enter' && drawingVertices.length >= 3) {
        completePolygon();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawMode, drawingVertices.length, cancelDrawing, completePolygon]);

  return null;
}
