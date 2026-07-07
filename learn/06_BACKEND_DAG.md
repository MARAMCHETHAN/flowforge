# 06 — Backend graph validation: Kahn's algorithm & the parse endpoint

The validation contract: POST nodes+edges to `/pipelines/parse`, get back
`{num_nodes, num_edges, is_dag}` plus a rich structural analysis. The three
core fields are the stable API; everything else is additive.

## What is a DAG and why does it matter here?

**D**irected **A**cyclic **G**raph: edges have direction, and no path loops
back to where it started. A pipeline *must* be a DAG because execution means
"run a node once all its inputs are ready" — with a cycle, A waits for B and
B waits for A: deadlock. Every workflow engine (Airflow literally names its
unit "a DAG") does this check.

## Kahn's algorithm, explained simply

[`_topological_sort`](../backend/main.py) implements Kahn's algorithm:

1. Compute each node's **in-degree** (number of incoming edges).
2. Put every node with in-degree 0 into a queue — these have no
   prerequisites.
3. Pop a node, append it to the order, and "delete" it: decrement each
   neighbour's in-degree. Any neighbour hitting 0 joins the queue.
4. Repeat until the queue empties.

**The verdict:** if the produced order contains *all* nodes → DAG. If some
nodes never reached in-degree 0, they are locked in a mutual wait — a cycle.
Complexity is O(V + E), and as a bonus the algorithm outputs the exact
**execution order** the engine later uses, plus the **cycle members** (nodes
left with in-degree > 0) so the UI can point at the culprits.

Edge cases handled deliberately:

- **Self-loops** (`a → a`) are caught separately and force `is_dag: false`.
- **Dangling edges** referencing unknown node ids are ignored rather than
  crashing the graph build (`test_parse_ignores_edges_to_unknown_nodes`).
- **Empty pipeline** → trivially a DAG, plus an `EMPTY_PIPELINE` warning.

## The response, beyond the required trio

```json
{
  "num_nodes": 5, "num_edges": 4, "is_dag": true,        ← required
  "node_types": {"llm": 1, "customInput": 2, ...},
  "entry_node_ids": [...], "exit_node_ids": [...], "orphan_node_ids": [...],
  "topological_order": ["in-1", "llm-1", ...],   // null if cyclic
  "cycle_node_ids": [],                          // [] if DAG
  "warnings": [{"code": "ORPHAN_NODES", "message": "...", "node_ids": [...]}]
}
```

Warnings are **structured** (code + message + node ids), not prose — a
frontend can highlight the exact nodes. Note the product-aware touch: Note
nodes are exempt from the orphan warning because stickies are *supposed* to
be disconnected.

## Defense in depth: the same check lives in two places

The frontend refuses to *create* a cycle in the first place —
`isValidConnection` in [`ui.js`](../frontend/src/ui.js) runs a BFS
("can the target already reach the source?") **while you drag the edge**, and
rejects with a flashing `▲ INVALID: CYCLE DETECTED ▲` banner. It also blocks
self-loops, duplicate edges, and two sources into one input.

Why validate twice? **Never trust the client.** The frontend check is UX
(instant feedback); the backend check is integrity (an imported JSON, a
buggy client, or a curl request can still contain a cycle). This
client-for-UX / server-for-truth split is the production pattern.

## Why a modal, not `window.alert()`

`window.alert()` freezes the tab and looks like a bug. Instead [`submit.js`](../frontend/src/submit.js) renders a themed modal
(portal + `role="dialog"` + Escape/backdrop close) showing nodes, edges, and
a YES/NO DAG badge — same information, user-friendly manner, as asked.

## CORS, in one paragraph

The browser blocks JS on `localhost:3000` from reading responses off
`localhost:8000` (different port = different origin) unless the server opts
in. FastAPI's `CORSMiddleware` allow-lists exactly the two dev origins
(3000, and 3001 for CRA's fallback port) rather than `*` — the habit that
matters in production.
