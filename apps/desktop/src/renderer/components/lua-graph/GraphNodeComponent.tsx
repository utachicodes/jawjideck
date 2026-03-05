/**
 * Custom React Flow node component for the Lua Graph Editor.
 * Renders a node with typed input/output ports, category coloring, and label.
 */
import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { GraphNodeData, PortValueType } from './lua-graph-types';
import { getNodeDefinition } from './node-library';
import { CATEGORY_COLORS } from './lua-graph-types';
import { useLuaGraphStore } from '../../stores/lua-graph-store';

const PORT_TYPE_COLORS: Record<PortValueType, string> = {
  number: '#3b82f6',   // blue
  boolean: '#a855f7',  // purple
  string: '#f97316',   // orange
  vector3: '#22c55e',  // green
  any: '#9ca3af',      // gray
};

function GraphNodeComponent({ id, data, selected }: NodeProps<Node<GraphNodeData>>) {
  const def = getNodeDefinition(data.definitionType);
  const categoryColor = CATEGORY_COLORS[data.category] ?? '#6b7280';
  const setSelectedNode = useLuaGraphStore((s) => s.setSelectedNode);

  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  if (!def) {
    return (
      <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-2 text-xs text-red-300">
        Unknown node: {data.definitionType}
      </div>
    );
  }

  // ── Comment / annotation node — lightweight label style ──
  if (data.definitionType === 'flow-comment') {
    const text = String(data.propertyValues['text'] ?? '');
    return (
      <div
        onClick={handleClick}
        className={`
          max-w-[240px] rounded-md border border-dashed px-3 py-1.5
          transition-all duration-150
          ${selected
            ? 'border-gray-400/60 bg-gray-700/30'
            : 'border-gray-600/40 bg-gray-800/20 hover:border-gray-500/50'
          }
        `}
      >
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
          {data.label}
        </div>
        {text && (
          <div className="text-[11px] text-gray-500 leading-snug">{text}</div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`
        min-w-[160px] rounded-lg border shadow-lg backdrop-blur-sm
        transition-all duration-150
        ${selected
          ? 'border-white/40 shadow-white/10 ring-1 ring-white/20'
          : 'border-gray-600/50 shadow-black/30 hover:border-gray-500/60'
        }
      `}
      style={{ background: 'rgba(30, 30, 40, 0.92)' }}
    >
      {/* Header bar with category color */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-semibold text-white"
        style={{ background: `${categoryColor}30`, borderBottom: `1px solid ${categoryColor}40` }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: categoryColor }} />
        <span className="truncate">{data.label}</span>
      </div>

      {/* Ports */}
      <div className="px-1 py-1.5 flex flex-col gap-0.5">
        {/* Input ports */}
        {def.inputs.map((port) => (
          <div key={port.id} className="relative flex items-center h-5 pl-3 pr-2">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              className="!w-2.5 !h-2.5 !border-2 !border-gray-900 !-left-[5px]"
              style={{ background: PORT_TYPE_COLORS[port.type] }}
            />
            <span className="text-[10px] text-gray-400">{port.label}</span>
          </div>
        ))}

        {/* Output ports */}
        {def.outputs.map((port) => (
          <div key={port.id} className="relative flex items-center justify-end h-5 pl-2 pr-3">
            <span className="text-[10px] text-gray-400">{port.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              className="!w-2.5 !h-2.5 !border-2 !border-gray-900 !-right-[5px]"
              style={{ background: PORT_TYPE_COLORS[port.type] }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(GraphNodeComponent);
