# 01 — Architecture: the big picture

## What this app is

A **visual programming environment**: users compose AI pipelines by dragging
nodes onto a canvas and wiring them together. It is the same product shape as
n8n, Zapier, Langflow, or ComfyUI. Two processes:

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│  React frontend  :3000      │  HTTP  │  FastAPI backend  :8000  │
│                             │ ─────► │                          │
│  ReactFlow canvas           │  POST  │  /pipelines/parse        │
│  Zustand store (state)      │  JSON  │    → counts, DAG check   │
│  Pixel-Arcade CSS theme     │        │  /pipelines/execute      │
│                             │ ◄───── │    → run the graph       │
└─────────────────────────────┘        └──────────────────────────┘
```

## The data model — everything is nodes + edges

The entire pipeline is two arrays, and *every feature* operates on them:

```js
node = { id: "llm-1", type: "llm", position: {x, y},
         data: { model: "GPT-4o", temperature: "0.7", ... } }

edge = { source: "customInput-1",  sourceHandle: "customInput-1-value",
         target: "llm-1",          targetHandle: "llm-1-prompt" }
```

Key insight: **handles are the API between nodes.** An edge doesn't just
connect two nodes — it connects a *specific output* (`sourceHandle`) to a
*specific input* (`targetHandle`). The convention used everywhere is
`"<nodeId>-<port>"`, e.g. `llm-1-prompt`. The backend strips the node-id
prefix to recover the port name (`prompt`) when routing values
([backend/main.py](../backend/main.py), `_handle_suffix`).

## Frontend file map

```
frontend/src/
  index.js            CRA entry — renders <App/>
  App.js              Layout: <Toolbar/> <Canvas/> <RunButton/>
  store.js            Zustand store — the single source of truth
  ui.js               ReactFlow canvas, drag-drop, connection validation, hotkeys
  toolbar.js          Node chips, search, Templates & Actions menus, saved indicator
  submit.js           RUN PIPELINE button, execution animation, results modal
  commandPalette.js   ⌘K palette (add nodes / insert templates by keyboard)
  templates.js        Pre-built pipelines (RAG, Summarization, Classifier)
  draggableNode.js    The draggable toolbar chip
  index.css           The entire design system (~38KB, one file, CSS variables)
  nodes/
    BaseNode.js       ★ THE abstraction — renders any node from a config object
    nodeMeta.js       ★ Central registry: label/color/icon/info per node type
    inputNode.js …    9 node types, each just a config passed to BaseNode
    NodeInfoModal.js  The ⓘ "what does this node do?" modal
```

## Backend file map

```
backend/
  main.py        FastAPI app: graph builder, Kahn's topological sort,
                 /pipelines/parse (validation) and /pipelines/execute
                 (the execution engine with per-node-type executors)
  test_main.py   14 pytest tests covering both endpoints
```

## One full round trip (what happens when you click RUN)

1. `submit.js` reads `nodes` + `edges` from the store and POSTs them to
   `/pipelines/execute`.
2. Backend builds an adjacency list, runs **Kahn's algorithm**. If a cycle
   exists → returns `status: "invalid"` + the offending node ids.
3. Otherwise it walks the topological order, running each node's **executor**:
   Input emits its value → Text substitutes `{{vars}}` → LLM (simulated)
   generates a response → Router picks a branch → Output captures the final
   value. Every node logs what it did and how long it took.
4. Frontend receives the results and **animates the canvas**: each node pulses
   yellow ("running") in execution order, then settles green ✓ / grey ⤫
   (skipped branch) / red ! (error). Output nodes' "LAST VALUE" preview is
   populated via the store.
5. A modal shows the stats (nodes / edges / DAG), the final outputs, and a
   collapsible per-node execution trace.

## Why this separation of concerns matters

- **The store knows nothing about rendering.** You could swap ReactFlow out.
- **BaseNode knows nothing about specific node types.** New types are data.
- **The backend knows nothing about React.** It accepts plain nodes/edges —
  the same JSON you get from Actions → Export.
- **Executors know nothing about the graph.** They get `(data, inputs, log)`
  and return outputs; the engine does all the wiring. This is exactly how a
  real workflow engine (Airflow, Prefect, n8n) is layered.
