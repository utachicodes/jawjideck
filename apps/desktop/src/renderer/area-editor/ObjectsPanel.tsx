/**
 * ObjectsPanel — the editor's object list (Adobe/Figma-style layers panel).
 * Select, rename (double-click), reorder, show/hide, delete; and convert a
 * parametric rectangle/circle to a free polygon for vertex editing.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useObjectsStore } from './objects-store';
import { colorForIndex } from './objects-geo';
import { isVertexEditable, type EditorObjectType } from './area-object';
import { GROUP_COLOR_PALETTE } from '../../shared/mission-group-types';

const TYPE_LABEL: Record<EditorObjectType, string> = {
  polygon: 'Area', corridor: 'Corridor', rectangle: 'Rectangle', circle: 'Circle',
};

const svg = {
  className: 'w-3.5 h-3.5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export function ObjectsPanel(): JSX.Element {
  const objects = useObjectsStore((s) => s.objects);
  const selectedId = useObjectsStore((s) => s.selectedId);
  const {
    selectObject, renameObject, deleteObject, toggleVisible, reorderObject, convertSelectedToPolygon, setObjectColor,
  } = useObjectsStore.getState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [colorId, setColorId] = useState<string | null>(null);
  const [colorPos, setColorPos] = useState<{ top: number; left: number } | null>(null);

  const commitRename = (): void => {
    if (editingId && draft.trim()) renameObject(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-subtle flex items-center justify-between">
        <p className="text-xs font-semibold text-content">Objects</p>
        <span className="text-xs text-content-tertiary tabular-nums">{objects.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {objects.length === 0 ? (
          <p className="text-xs text-content-tertiary px-4 py-2">No objects yet. Pick a tool and draw.</p>
        ) : (
          objects.map((o, i) => {
            const active = o.id === selectedId;
            return (
              <div
                key={o.id}
                onClick={() => selectObject(o.id)}
                className={
                  'group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ' +
                  (active ? 'bg-blue-600/15' : 'hover:bg-surface-raised')
                }
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleVisible(o.id); }}
                  data-tip={o.visible ? 'Hide' : 'Show'}
                  className="text-content-tertiary hover:text-content"
                >
                  {o.visible ? (
                    <svg {...svg}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  ) : (
                    <svg {...svg}><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A17 17 0 002 12s3.5 7 10 7a10.8 10.8 0 004.1-.8" /></svg>
                  )}
                </button>

                <button
                  type="button"
                  data-tip="Change color"
                  aria-label="Object color"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (colorId === o.id) { setColorId(null); return; }
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setColorPos({ top: r.bottom + 4, left: r.left });
                    setColorId(o.id);
                  }}
                  className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/25"
                  style={{ background: o.color ?? colorForIndex(i) }}
                />

                {editingId === o.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 h-6 px-1.5 rounded bg-surface-input border border-subtle text-xs text-content"
                  />
                ) : (
                  <div
                    className="flex-1 min-w-0"
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingId(o.id); setDraft(o.name); }}
                  >
                    <div className="text-xs text-content truncate">{o.name}</div>
                    <div className="text-[10px] text-content-tertiary">{TYPE_LABEL[o.type]}</div>
                  </div>
                )}

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" data-tip="Move up" disabled={i === 0}
                    onClick={(e) => { e.stopPropagation(); reorderObject(o.id, -1); }}
                    className="text-content-tertiary hover:text-content disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg {...svg}><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" data-tip="Move down" disabled={i === objects.length - 1}
                    onClick={(e) => { e.stopPropagation(); reorderObject(o.id, 1); }}
                    className="text-content-tertiary hover:text-content disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg {...svg}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <button type="button" data-tip="Delete"
                    onClick={(e) => { e.stopPropagation(); deleteObject(o.id); }}
                    className="text-content-tertiary hover:text-rose-400">
                    <svg {...svg}><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M7 7l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" /></svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(() => {
        const sel = objects.find((o) => o.id === selectedId);
        if (!sel || isVertexEditable(sel)) return null;
        return (
          <div className="flex-shrink-0 px-3 py-2 border-t border-subtle">
            <button
              type="button"
              onClick={() => convertSelectedToPolygon()}
              className="w-full h-7 rounded-md text-xs font-medium bg-surface-raised text-content hover:brightness-125 transition-colors"
              data-tip="Convert this shape to a free polygon so you can edit its points"
            >
              Convert to polygon
            </button>
          </div>
        );
      })()}

      {colorId && colorPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setColorId(null)} />
            <div
              className="fixed z-[9999] p-1.5 bg-surface-solid border border-subtle rounded-lg shadow-2xl grid grid-cols-4 gap-1"
              style={{ top: colorPos.top, left: colorPos.left }}
            >
              {GROUP_COLOR_PALETTE.map((c) => {
                const current = objects.find((o) => o.id === colorId);
                const active = (current?.color ?? colorForIndex(objects.findIndex((o) => o.id === colorId))) === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setObjectColor(colorId, c); setColorId(null); }}
                    className={'w-5 h-5 rounded transition-transform hover:scale-110 ' + (active ? 'ring-2 ring-white' : '')}
                    style={{ background: c }}
                    aria-label={`Set color ${c}`}
                  />
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
