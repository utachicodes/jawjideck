/**
 * Main React Flow canvas for the Lua Graph Editor.
 * Handles the graph viewport, node rendering, and edge connections.
 */
import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  type ReactFlowInstance,
  type IsValidConnection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import GraphNodeComponent from './GraphNodeComponent';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { getNodeDefinition } from './node-library';
import { CATEGORY_COLORS } from './lua-graph-types';

const nodeTypes = {
  graphNode: GraphNodeComponent,
};

export function GraphCanvas() {
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const nodes = useLuaGraphStore((s) => s.nodes);
  const edges = useLuaGraphStore((s) => s.edges);
  const onNodesChange = useLuaGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useLuaGraphStore((s) => s.onEdgesChange);
  const onConnect = useLuaGraphStore((s) => s.onConnect);
  const addNode = useLuaGraphStore((s) => s.addNode);
  const setSelectedNode = useLuaGraphStore((s) => s.setSelectedNode);
  const removeSelectedNodes = useLuaGraphStore((s) => s.removeSelectedNodes);
  const pushHistory = useLuaGraphStore((s) => s.pushHistory);

  // Connection validation — enforce compatible port types
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceDef = getNodeDefinition(sourceNode.data.definitionType);
      const targetDef = getNodeDefinition(targetNode.data.definitionType);
      if (!sourceDef || !targetDef) return false;

      const sourcePort = sourceDef.outputs.find((p) => p.id === connection.sourceHandle);
      const targetPort = targetDef.inputs.find((p) => p.id === connection.targetHandle);
      if (!sourcePort || !targetPort) return false;

      // Allow 'any' type to connect to anything
      if (sourcePort.type === 'any' || targetPort.type === 'any') return true;

      // Otherwise types must match
      return sourcePort.type === targetPort.type;
    },
    [nodes],
  );

  // Handle drop from node palette (drag-and-drop)
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const definitionType = e.dataTransfer.getData('application/lua-graph-node');
      if (!definitionType || !rfInstance.current) return;

      const position = rfInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      addNode(definitionType, position);
    },
    [addNode],
  );

  const onInit = useCallback((instance: ReactFlowInstance<any, any>) => {
    rfInstance.current = instance as any;
  }, []);

  // Click on canvas background deselects
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Keyboard shortcuts
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        removeSelectedNodes();
      }
    },
    [removeSelectedNodes],
  );

  // Minimap node color by category
  const minimapNodeColor = useCallback((node: any) => {
    const category = node.data?.category;
    return CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#6b7280';
  }, []);

  // Style edges with smoother appearance
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      style: { strokeWidth: 2, stroke: '#4b5563' },
      animated: false,
    }),
    [],
  );

  return (
    <div className="w-full h-full" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={onPaneClick}
        onNodeDragStart={pushHistory}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        className="bg-transparent"
      >
        <Background
          color="#374151"
          gap={16}
          size={1}
        />
        <Controls
          className="!bg-gray-800/80 !border-gray-700/50 !rounded-lg !shadow-lg [&>button]:!bg-gray-700/60 [&>button]:!border-gray-600/40 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-600/60"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.7)"
          className="!bg-gray-900/80 !border-gray-700/50 !rounded-lg"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
