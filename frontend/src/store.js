import { create } from "zustand";
import { addEdge, applyNodeChanges, applyEdgeChanges } from "reactflow";

import { extractVariables } from "./utils/variables";

const LS_KEY = "flowforge-pipeline-v1";
const HISTORY_LIMIT = 50;
const SNAPSHOT_DEBOUNCE = 400;

const clone = (v) => JSON.parse(JSON.stringify(v));

const loadFromLocal = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
      return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveToLocal = (nodes, edges) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ nodes, edges }));
  } catch {
    /* quota or disabled — silently ignore */
  }
};

const restored = loadFromLocal();
const initialNodes = restored?.nodes ?? [];
const initialEdges = restored?.edges ?? [];
const initialNodeIDs = computeNodeIDs(initialNodes);

function computeNodeIDs(nodes) {
  const ids = {};
  for (const n of nodes) {
    if (!n?.type || !n?.id) continue;
    const m = String(n.id).match(/-(\d+)$/);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (!isNaN(num)) ids[n.type] = Math.max(ids[n.type] ?? 0, num);
  }
  return ids;
}

let snapshotTimer = null;

export const useStore = create((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  nodeIDs: initialNodeIDs,

  // ── Learn Mode (guided tutorial) ─────────────────────────
  learnOpen: false,
  setLearnOpen: (open) => set({ learnOpen: open }),

  // ── Execution run state (not persisted) ─────────────────
  // { [nodeId]: "running" | "executed" | "skipped" | "error" }
  runStatuses: {},
  setRunStatus: (nodeId, status) =>
    set({ runStatuses: { ...get().runStatuses, [nodeId]: status } }),
  setRunStatuses: (statuses) => set({ runStatuses: statuses }),
  clearRunStatuses: () => set({ runStatuses: {} }),

  // ── History ──────────────────────────────────────────────
  history: [{ nodes: clone(initialNodes), edges: clone(initialEdges) }],
  historyIndex: 0,
  savedAt: restored ? Date.now() : null,

  scheduleSnapshot: () => {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      const { nodes, edges, history, historyIndex } = get();
      const head = history[historyIndex];
      // Skip if state unchanged from current head
      if (
        head &&
        JSON.stringify(head.nodes) === JSON.stringify(nodes) &&
        JSON.stringify(head.edges) === JSON.stringify(edges)
      ) {
        saveToLocal(nodes, edges);
        set({ savedAt: Date.now() });
        return;
      }
      const truncated = history.slice(0, historyIndex + 1);
      truncated.push({ nodes: clone(nodes), edges: clone(edges) });
      if (truncated.length > HISTORY_LIMIT) truncated.shift();
      set({
        history: truncated,
        historyIndex: truncated.length - 1,
        savedAt: Date.now(),
      });
      saveToLocal(nodes, edges);
    }, SNAPSHOT_DEBOUNCE);
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({
      nodes: clone(prev.nodes),
      edges: clone(prev.edges),
      historyIndex: historyIndex - 1,
    });
    saveToLocal(prev.nodes, prev.edges);
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({
      nodes: clone(next.nodes),
      edges: clone(next.edges),
      historyIndex: historyIndex + 1,
    });
    saveToLocal(next.nodes, next.edges);
  },

  clearPipeline: () => {
    set({ nodes: [], edges: [] });
    get().scheduleSnapshot();
  },

  loadTemplate: (templateBuilder) => {
    const built = templateBuilder(get().getNodeID);
    set({ nodes: built.nodes, edges: built.edges });
    get().scheduleSnapshot();
  },

  // Topological layered auto-layout. Place nodes in columns based on
  // longest path from a source; same-depth nodes stack vertically.
  autoLayout: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;

    const inAdj = new Map(nodes.map((n) => [n.id, []]));
    const outAdj = new Map(nodes.map((n) => [n.id, []]));
    edges.forEach((e) => {
      if (inAdj.has(e.target) && outAdj.has(e.source)) {
        inAdj.get(e.target).push(e.source);
        outAdj.get(e.source).push(e.target);
      }
    });

    // Longest-path depth from any source via memoized DFS
    const depthCache = new Map();
    const visiting = new Set();
    const depthOf = (id) => {
      if (depthCache.has(id)) return depthCache.get(id);
      if (visiting.has(id)) return 0; // cycle guard
      visiting.add(id);
      const parents = inAdj.get(id) || [];
      const d = parents.length === 0
        ? 0
        : 1 + Math.max(...parents.map(depthOf));
      visiting.delete(id);
      depthCache.set(id, d);
      return d;
    };

    const COL_W = 320;
    const ROW_H = 220;
    const PAD_X = 80;
    const PAD_Y = 80;

    const byDepth = new Map();
    nodes.forEach((n) => {
      const d = depthOf(n.id);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d).push(n);
    });

    const positioned = nodes.map((n) => {
      const d = depthOf(n.id);
      const column = byDepth.get(d);
      const idxInColumn = column.indexOf(n);
      return {
        ...n,
        position: {
          x: PAD_X + d * COL_W,
          y: PAD_Y + idxInColumn * ROW_H,
        },
      };
    });

    set({ nodes: positioned });
    get().scheduleSnapshot();
  },

  importPipeline: (data) => {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      throw new Error("Invalid pipeline file");
    }
    const newIDs = computeNodeIDs(data.nodes);
    set({ nodes: data.nodes, edges: data.edges, nodeIDs: newIDs });
    get().scheduleSnapshot();
  },

  // ── Node IDs ─────────────────────────────────────────────
  getNodeID: (type) => {
    const newIDs = { ...get().nodeIDs };
    if (newIDs[type] === undefined) newIDs[type] = 0;
    newIDs[type] += 1;
    set({ nodeIDs: newIDs });
    return `${type}-${newIDs[type]}`;
  },

  // ── Mutations (each schedules a snapshot) ────────────────
  addNode: (node) => {
    set({ nodes: [...get().nodes, node] });
    get().scheduleSnapshot();
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
    });
    get().scheduleSnapshot();
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    // Only snapshot for structural / committed changes (skip in-flight drag)
    const structural = changes.some(
      (c) =>
        c.type === "remove" ||
        c.type === "add" ||
        (c.type === "position" && c.dragging === false) ||
        c.type === "dimensions"
    );
    if (structural) get().scheduleSnapshot();
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const structural = changes.some(
      (c) => c.type === "remove" || c.type === "add"
    );
    if (structural) get().scheduleSnapshot();
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          animated: true,
        },
        get().edges
      ),
    });
    get().scheduleSnapshot();
  },

  updateNodeField: (nodeId, fieldName, fieldValue) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    let edges = get().edges;

    // Text node variables ARE its input handles: when the text changes,
    // prune edges into handles that no longer exist.
    if (node?.type === "text" && fieldName === "text") {
      const live = new Set(extractVariables(fieldValue));
      edges = edges.filter((e) => {
        if (e.target !== nodeId) return true;
        const suffix = (e.targetHandle || "").slice(nodeId.length + 1);
        return live.has(suffix);
      });
    }

    set({
      edges,
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, [fieldName]: fieldValue } }
          : n
      ),
    });
    get().scheduleSnapshot();
  },
}));
