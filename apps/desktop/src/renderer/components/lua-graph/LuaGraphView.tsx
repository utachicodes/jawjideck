/**
 * Main Lua Graph Editor view — the top-level component rendered in App.tsx.
 * Composes the toolbar, node palette, canvas, inspector, and lua preview.
 */
import { useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { GraphCanvas } from './GraphCanvas';
import { NodePalette } from './NodePalette';
import { InspectorPanel } from './InspectorPanel';
import { LuaPreviewPanel } from './LuaPreviewPanel';
import { GraphToolbar } from './GraphToolbar';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { compileGraph } from './lua-compiler';

export function LuaGraphView() {
  const nodes = useLuaGraphStore((s) => s.nodes);
  const edges = useLuaGraphStore((s) => s.edges);
  const graphName = useLuaGraphStore((s) => s.graphName);
  const runIntervalMs = useLuaGraphStore((s) => s.runIntervalMs);
  const selectedNodeId = useLuaGraphStore((s) => s.selectedNodeId);

  // Compile for status bar
  const compileResult = useMemo(
    () => compileGraph(nodes, edges, graphName, runIntervalMs),
    [nodes, edges, graphName, runIntervalMs],
  );

  return (
    <ReactFlowProvider>
      <div className="h-full flex flex-col bg-gray-950">
        {/* Toolbar */}
        <GraphToolbar />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Node Palette */}
          <NodePalette />

          {/* Center: Canvas */}
          <div className="flex-1 relative">
            <GraphCanvas />
          </div>

          {/* Right: Inspector + Preview */}
          <div className="w-56 border-l border-gray-700/40 bg-gray-900/60 flex flex-col">
            {/* Inspector — primary content, takes available space */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <InspectorPanel />
            </div>

            {/* Lua Preview — compact collapsible section at bottom */}
            <LuaPreviewPanel />
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-4 px-3 py-1 bg-gray-900/80 border-t border-gray-700/40 text-[10px] text-gray-500">
          <span>{nodes.length} node{nodes.length !== 1 ? 's' : ''}</span>
          <span className="w-px h-3 bg-gray-700/50" />
          <span
            className={compileResult.success ? 'text-emerald-500' : 'text-red-400'}
          >
            {compileResult.success ? 'Valid' : `${compileResult.errors.length} error(s)`}
          </span>
          <span className="w-px h-3 bg-gray-700/50" />
          <span>
            Est. memory: {(compileResult.estimatedMemoryBytes / 1024).toFixed(1)} KB
          </span>
          <div className="flex-1" />
          <span className="text-gray-600">ArduPilot Lua Scripting</span>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
