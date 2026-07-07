# 02 — Node Abstraction: nodes as configuration

## The problem

The starter code had four node files (`inputNode`, `outputNode`, `llmNode`,
`textNode`) that each re-implemented the same things: a container div, a
title, `<Handle/>` placement math, labelled form fields, change handlers.
Adding node #5 meant copy-pasting ~70 lines and editing them. At 30 node
types that's unmaintainable — restyle one border and you touch 30 files.

## The solution: nodes are *configuration*, not components

One component — [`BaseNode.js`](../frontend/src/nodes/BaseNode.js) — renders
**any** node from a declarative config object:

```js
config = {
  title: "LLM", icon: "✦", color: "#d946ef",
  inputs:  [{ id: `${id}-system`, label: "System" },
            { id: `${id}-prompt`, label: "Prompt" }],
  outputs: [{ id: `${id}-response`, label: "Response" }],
  fields:  [
    { type: "select", key: "model",       label: "Model", options: [...] },
    { type: "slider", key: "temperature", label: "Temperature", min: 0, max: 2 },
    { type: "number", key: "maxTokens",   label: "Max Tokens", min: 1 },
  ],
}
```

A concrete node file is now just that config wrapped in a component —
[`llmNode.js`](../frontend/src/nodes/llmNode.js) is ~45 lines, and most of it
is the options list.

## What BaseNode does with the config

1. **Header** — icon, title, the ⓘ info button, the × delete button. The
   node's accent color arrives as a CSS variable (`--node-color`), so styling
   stays in CSS.
2. **Fields** — a small field renderer supports 8 field types:
   `static`, `text`, `select`, `textarea`, `number`, `slider`, `swatch`
   (color picker), `file`. Every field writes through one store action,
   `updateNodeField(id, key, value)` — nodes never own local form state, so
   undo/redo and autosave capture everything for free.
3. **Handles** — inputs render on the left, outputs on the right. If a handle
   has no explicit `style.top`, `distribute()` spaces N handles evenly at
   `(i+1)/(N+1) × 100%`. Labels render next to the dot.
4. **Escape hatch** — `children`. Anything the config can't express (the
   Output node's "LAST VALUE" preview, the Router's live condition tester)
   is passed as JSX children and renders inside the body. **This is the most
   important design decision**: the abstraction covers the 90% case without
   blocking the 10%.

## The second half: `nodeMeta.js`

[`nodeMeta.js`](../frontend/src/nodes/nodeMeta.js) is the **single registry**
of node identity: label, color, icon, plus the human-readable info shown by
the ⓘ modal. The toolbar, the ⌘K palette, the minimap colors, and the info
modal all read from this one file. Adding a node type to the UI = one entry
here + one config file + one line in `ui.js`'s `nodeTypes` map.

## Proof it works: the five new nodes

| Node | Config highlights | Extra JSX (children)? |
|------|------------------|----------------------|
| **File Upload** | one `file` field, one output | no |
| **Prompt Template** | `select` + `textarea`, detects `{{vars}}` | var chips hint |
| **Vector Search** | two inputs, `select` + two `slider`s | no |
| **Router** | two outputs (True/False) at 33%/66% | live condition evaluator |
| **Note** | `swatch` color picker + `textarea`, zero handles | no |

Each took minutes, not hours — which is the entire point of the abstraction
(speeding up how fast new nodes ship) demonstrated in practice.

## Why config-over-inheritance

The alternative was a class hierarchy (`class LLMNode extends BaseNode`).
Config wins because:

- **Serializable** — a config is data; it could come from a database or an
  API (which is how commercial pipeline builders ship hundreds of nodes).
- **No lifecycle coupling** — React favors composition; inheritance of
  components is an anti-pattern.
- **Testable** — you can snapshot-test one BaseNode against many configs.

## How to add node #10 (checklist)

1. `nodes/nodeMeta.js` — add `myNode: { label, color, icon, info: {...} }`
   and append to `TOOLBAR_ORDER`.
2. `nodes/myNode.js` — export a component returning
   `<BaseNode config={{...}} />`. (~30 lines)
3. `ui.js` — register in the `nodeTypes` map.
4. (If it should *run*) `backend/main.py` — add an executor to `_EXECUTORS`.
   See [07_EXECUTION_ENGINE.md](07_EXECUTION_ENGINE.md).
