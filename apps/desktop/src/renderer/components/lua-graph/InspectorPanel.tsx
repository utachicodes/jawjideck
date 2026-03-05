/**
 * Right sidebar — Inspector for the selected node's properties.
 * Shows node info, editable inputs, and configurable properties.
 */
import { useMemo } from 'react';
import { Settings2, Timer } from 'lucide-react';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { getNodeDefinition } from './node-library';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './lua-graph-types';

export function InspectorPanel() {
  const selectedNodeId = useLuaGraphStore((s) => s.selectedNodeId);
  const nodes = useLuaGraphStore((s) => s.nodes);
  const updateNodeProperty = useLuaGraphStore((s) => s.updateNodeProperty);
  const updateNodeLabel = useLuaGraphStore((s) => s.updateNodeLabel);
  const graphName = useLuaGraphStore((s) => s.graphName);
  const graphDescription = useLuaGraphStore((s) => s.graphDescription);
  const runIntervalMs = useLuaGraphStore((s) => s.runIntervalMs);
  const setGraphName = useLuaGraphStore((s) => s.setGraphName);
  const setGraphDescription = useLuaGraphStore((s) => s.setGraphDescription);
  const setRunIntervalMs = useLuaGraphStore((s) => s.setRunIntervalMs);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  if (!selectedNode) {
    return (
      <div className="h-full overflow-y-auto">
        {/* Script Settings — shown when no node is selected */}
        <div className="px-3 py-3 border-b border-gray-700/40">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Script Settings
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Name</label>
              <input
                type="text"
                value={graphName}
                onChange={(e) => setGraphName(e.target.value)}
                className="w-full text-xs bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Description</label>
              <textarea
                value={graphDescription}
                onChange={(e) => setGraphDescription(e.target.value)}
                rows={2}
                className="w-full text-xs bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/40 resize-none"
                placeholder="What does this script do?"
              />
            </div>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Run Interval
            </span>
          </div>
          <p className="text-[10px] text-gray-600 mb-2">
            How often the script executes. Lower values give faster response but use more CPU.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={runIntervalMs}
              min={50}
              max={60000}
              step={50}
              onChange={(e) => setRunIntervalMs(parseInt(e.target.value, 10) || 1000)}
              className="w-24 text-xs bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-gray-500">ms</span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[200, 500, 1000, 2000].map((ms) => (
              <button
                key={ms}
                onClick={() => setRunIntervalMs(ms)}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  runIntervalMs === ms
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-gray-800/40 text-gray-500 border border-gray-700/30 hover:text-gray-300'
                }`}
              >
                {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const def = getNodeDefinition(selectedNode.data.definitionType);
  if (!def) return null;

  const categoryColor = CATEGORY_COLORS[selectedNode.data.category] ?? '#6b7280';
  const props = selectedNode.data.propertyValues;

  return (
    <div className="h-full overflow-y-auto">
      {/* Node Header */}
      <div className="px-3 py-3 border-b border-gray-700/40">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: categoryColor }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: categoryColor }}>
            {CATEGORY_LABELS[selectedNode.data.category]}
          </span>
        </div>
        <input
          type="text"
          value={selectedNode.data.label}
          onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
          className="w-full text-sm font-semibold text-white bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-500/50 focus:outline-none pb-0.5 transition-colors"
        />
        <p className="text-[10px] text-gray-500 mt-1">{def.description}</p>
      </div>

      {/* Properties */}
      {def.properties.length > 0 && (
        <div className="px-3 py-3">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">
            Properties
          </h4>
          <div className="flex flex-col gap-2.5">
            {def.properties.map((propDef) => {
              const value = props[propDef.id] ?? propDef.defaultValue;

              if (propDef.type === 'select') {
                return (
                  <div key={propDef.id}>
                    <label className="text-[10px] text-gray-500 block mb-0.5">{propDef.label}</label>
                    <select
                      value={String(value)}
                      onChange={(e) => {
                        const opt = propDef.options?.find((o) => String(o.value) === e.target.value);
                        if (opt) updateNodeProperty(selectedNode.id, propDef.id, opt.value);
                      }}
                      className="w-full text-xs bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/40"
                    >
                      {propDef.options?.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (propDef.type === 'boolean') {
                return (
                  <div key={propDef.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => updateNodeProperty(selectedNode.id, propDef.id, e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0"
                    />
                    <label className="text-[11px] text-gray-400">{propDef.label}</label>
                  </div>
                );
              }

              if (propDef.type === 'number' || propDef.type === 'channel') {
                return (
                  <div key={propDef.id}>
                    <label className="text-[10px] text-gray-500 block mb-0.5">{propDef.label}</label>
                    <input
                      type="number"
                      value={Number(value)}
                      min={propDef.min}
                      max={propDef.max}
                      step={propDef.step ?? 1}
                      onChange={(e) => updateNodeProperty(selectedNode.id, propDef.id, parseFloat(e.target.value) || 0)}
                      className="w-full text-xs bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                );
              }

              // string
              return (
                <div key={propDef.id}>
                  <label className="text-[10px] text-gray-500 block mb-0.5">{propDef.label}</label>
                  <input
                    type="text"
                    value={String(value)}
                    onChange={(e) => updateNodeProperty(selectedNode.id, propDef.id, e.target.value)}
                    className="w-full text-xs bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/40"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Port Info */}
      {(def.inputs.length > 0 || def.outputs.length > 0) && (
        <div className="px-3 py-3 border-t border-gray-700/40">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">
            Ports
          </h4>
          {def.inputs.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-gray-600">Inputs</span>
              <div className="mt-1 flex flex-col gap-1">
                {def.inputs.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background:
                          p.type === 'number' ? '#3b82f6'
                          : p.type === 'boolean' ? '#a855f7'
                          : p.type === 'string' ? '#f97316'
                          : '#9ca3af',
                      }}
                    />
                    <span className="text-gray-400">{p.label}</span>
                    <span className="text-gray-600 ml-auto">{p.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {def.outputs.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-600">Outputs</span>
              <div className="mt-1 flex flex-col gap-1">
                {def.outputs.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background:
                          p.type === 'number' ? '#3b82f6'
                          : p.type === 'boolean' ? '#a855f7'
                          : p.type === 'string' ? '#f97316'
                          : '#9ca3af',
                      }}
                    />
                    <span className="text-gray-400">{p.label}</span>
                    <span className="text-gray-600 ml-auto">{p.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
