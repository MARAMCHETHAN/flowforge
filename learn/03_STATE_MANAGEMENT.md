# 03 — State management: one Zustand store

All app state lives in [`store.js`](../frontend/src/store.js) — a single
Zustand store. Components subscribe to *slices* of it and re-render only when
their slice changes.

## Why Zustand

- **No boilerplate** — a store is one `create()` call; actions are plain
  functions living next to the state they mutate.
- **No provider tree** — `useStore(selector)` works anywhere.
- **Selector-based subscriptions** — `useStore((s) => s.nodes)` re-renders
  only on `nodes` changes. With `useShallow` for object selectors we avoid
  re-render storms while dragging.
- Redux would give the same result with 4× the ceremony; React Context would
  re-render every consumer on every change. For a canvas app where nodes
  update on every keystroke, that matters.

## What the store holds

```
nodes, edges          the pipeline (ReactFlow-shaped)
nodeIDs               per-type counters → "llm-1", "llm-2", ...
history, historyIndex undo/redo snapshots (max 50)
savedAt               timestamp for the "SAVED 12s ago" indicator
runStatuses           { nodeId: running|executed|skipped|error } during a run
```

## The three clever parts

### 1. Debounced snapshots power BOTH undo/redo and autosave

Every mutation calls `scheduleSnapshot()`, which debounces 400ms and then:

- pushes a deep-cloned `{nodes, edges}` onto `history` (dropping any redo
  branch, capping at 50 entries), and
- writes the same state to `localStorage` (`vs-pipeline-v1`).

One code path, two features. The debounce means typing a sentence into a
textarea creates **one** history entry, not thirty. It also skips a snapshot
when state deep-equals the current head (e.g. a drag that ended where it
started).

> This was also the site of the one show-stopper bug found during the final
> audit: the key had been mangled from `scheduleSnapshot:` to `uleSnapshot:`,
> so every mutation threw `get().scheduleSnapshot is not a function`. One-line
> fix; the lesson is *run the app after every refactor* — the Playwright
> smoke driver now catches this class of break automatically.

### 2. Structural-only snapshots during drags

`onNodesChange` fires ~60×/sec while dragging. Snapshotting each would flood
history. So it only schedules a snapshot for *structural* changes — and for
position changes **only when `dragging === false`** (the drop). Undo after a
drag returns the node to where it was, in one step.

### 3. ID restoration on load/import

IDs are `"<type>-<n>"`. After a refresh or JSON import, `computeNodeIDs()`
re-derives each type's max counter from the existing node ids so new nodes
don't collide with restored ones. Without this, adding an LLM after a reload
would create a second `llm-1` and corrupt edges.

## Run state is deliberately separate

`runStatuses` lives in the store but is **not** part of snapshots or
localStorage — execution status is ephemeral UI, not document state. Undoing
should never replay "node was green". (The Output node's `lastValue` preview
*is* written into node data on purpose: the last run's result surviving a
refresh is a feature.)

## Actions catalogue

| Action | Used by |
|--------|---------|
| `addNode / removeNode` | drag-drop, ⌘K, node × button |
| `onNodesChange / onEdgesChange / onConnect` | ReactFlow callbacks |
| `updateNodeField` | every BaseNode field |
| `undo / redo` | ⌘Z / ⌘⇧Z |
| `clearPipeline / loadTemplate / importPipeline` | toolbar menus |
| `autoLayout` | Actions menu — longest-path layering (a mini dagre) |
| `setRunStatus / setRunStatuses / clearRunStatuses` | the run animation |

`autoLayout` is worth reading: it computes each node's depth as the longest
path from any source (memoized DFS with a cycle guard) and lays depths out as
columns — the same idea layout libraries like dagre use, in 40 lines.
