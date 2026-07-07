import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "./store";
import { MOD_K } from "./utils/platform";
import { NODE_META } from "./nodes/nodeMeta";
import { CommandPalette } from "./commandPalette";
import { InputNode } from "./nodes/inputNode";
import { OutputNode } from "./nodes/outputNode";
import { LLMNode } from "./nodes/llmNode";
import { TextNode } from "./nodes/textNode";
import { FileUploadNode } from "./nodes/fileUploadNode";
import { PromptTemplateNode } from "./nodes/promptTemplateNode";
import { VectorSearchNode } from "./nodes/vectorSearchNode";
import { RouterNode } from "./nodes/routerNode";
import { NoteNode } from "./nodes/noteNode";

import "reactflow/dist/style.css";

const gridSize = 20;
const proOptions = { hideAttribution: true };

const nodeTypes = {
  customInput: InputNode,
  customOutput: OutputNode,
  llm: LLMNode,
  text: TextNode,
  fileUpload: FileUploadNode,
  promptTemplate: PromptTemplateNode,
  vectorSearch: VectorSearchNode,
  router: RouterNode,
  note: NoteNode,
};

const selector = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  getNodeID: state.getNodeID,
  addNode: state.addNode,
  pendingAddType: state.pendingAddType,
  clearPendingAdd: state.clearPendingAdd,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
  undo: state.undo,
  redo: state.redo,
});

const minimapNodeColor = (node) => NODE_META[node.type]?.color || "#7c3aed";

const PipelineCanvas = () => {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [invalidMessage, setInvalidMessage] = useState(null);
  const { deleteElements } = useReactFlow();

  const {
    nodes,
    edges,
    getNodeID,
    addNode,
    pendingAddType,
    clearPendingAdd,
    onNodesChange,
    onEdgesChange,
    onConnect,
    undo,
    redo,
  } = useStore(useShallow(selector));

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/reactflow");
      if (!data || !reactFlowInstance || !reactFlowWrapper.current) return;
      const { nodeType } = JSON.parse(data);
      if (!nodeType) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const id = getNodeID(nodeType);
      addNode({
        id,
        type: nodeType,
        position,
        data: { id, nodeType },
      });
    },
    [reactFlowInstance, getNodeID, addNode]
  );

  // Click-to-add: toolbar chips set pendingAddType; drop it at the
  // center of the visible canvas (slightly jittered so repeats don't stack).
  useEffect(() => {
    if (!pendingAddType || !reactFlowInstance || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const jitter = () => (Math.random() - 0.5) * 80;
    const position = reactFlowInstance.project({
      x: bounds.width / 2 + jitter(),
      y: bounds.height / 2 + jitter(),
    });
    const id = getNodeID(pendingAddType);
    addNode({ id, type: pendingAddType, position, data: { id, nodeType: pendingAddType } });
    clearPendingAdd();
  }, [pendingAddType, reactFlowInstance, getNodeID, addNode, clearPendingAdd]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Connection validation: real-time DAG-safety checks
  const isValidConnection = useCallback(
    (connection) => {
      const { source, sourceHandle, target, targetHandle } = connection;
      if (!source || !target) return false;

      // 1. Self-loop check
      if (source === target) {
        setInvalidMessage("▲ INVALID: SELF-LOOP DETECTED ▲");
        return false;
      }

      // 2. Duplicate connection check
      const dup = edges.some(
        (e) =>
          e.source === source &&
          e.target === target &&
          e.sourceHandle === sourceHandle &&
          e.targetHandle === targetHandle
      );
      if (dup) {
        setInvalidMessage("▲ INVALID: DUPLICATE CONNECTION ▲");
        return false;
      }

      // 3. Single-input rule: each input handle gets at most one source
      const targetAlreadyConnected = edges.some(
        (e) => e.target === target && e.targetHandle === targetHandle
      );
      if (targetAlreadyConnected) {
        setInvalidMessage("▲ INVALID: INPUT ALREADY CONNECTED ▲");
        return false;
      }

      // 4. Real-time cycle detection: if target can already reach source,
      // adding source -> target would close a cycle.
      const pathExists = (start, end) => {
        const queue = [start];
        const visited = new Set();
        while (queue.length > 0) {
          const curr = queue.shift();
          if (curr === end) return true;
          if (visited.has(curr)) continue;
          visited.add(curr);
          for (const e of edges) {
            if (e.source === curr) queue.push(e.target);
          }
        }
        return false;
      };
      if (pathExists(target, source)) {
        setInvalidMessage("▲ INVALID: CYCLE DETECTED ▲");
        return false;
      }

      return true;
    },
    [edges]
  );

  useEffect(() => {
    if (!invalidMessage) return;
    const t = setTimeout(() => setInvalidMessage(null), 2500);
    return () => clearTimeout(t);
  }, [invalidMessage]);

  // Keyboard: Delete/Backspace removes selection, Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or +Y) redo
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = (e.target?.tagName || "").toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";

      if (mod && (e.key === "z" || e.key === "Z")) {
        if (inField) return;
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        if (inField) return;
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (inField) return;
        const selectedNodes = nodes.filter((n) => n.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);
        if (selectedNodes.length || selectedEdges.length) {
          deleteElements({ nodes: selectedNodes, edges: selectedEdges });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodes, edges, deleteElements, undo, redo]);

  return (
    <div
      ref={reactFlowWrapper}
      className={`vs-canvas ${invalidMessage ? "vs-canvas-invalid" : ""}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={setReactFlowInstance}
        onEdgeDoubleClick={(_, edge) => deleteElements({ edges: [edge] })}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        snapGrid={[gridSize, gridSize]}
        connectionLineType="smoothstep"
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{ type: "smoothstep" }}
        fitView
      >
        <Background variant="dots" gap={gridSize} size={1.4} color="#2d3550" />
        <Controls className="vs-controls" />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(15,17,23,0.7)"
          style={{ background: "#0f1117" }}
        />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="vs-empty">
          <div className="vs-empty-arrow">▲</div>
          <div className="vs-empty-title">INSERT NODE TO BEGIN</div>
          <div className="vs-empty-sub">
            drag or click a block above · or press <span className="vs-kbd">{MOD_K}</span>
          </div>
        </div>
      )}

      {invalidMessage && (
        <div className="vs-invalid-banner">{invalidMessage}</div>
      )}

      <CommandPalette />
    </div>
  );
};

export const PipelineUI = () => (
  <ReactFlowProvider>
    <PipelineCanvas />
  </ReactFlowProvider>
);
