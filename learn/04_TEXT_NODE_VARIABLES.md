# 04 — Text Node logic: auto-resize + live {{variable}} handles

Two requirements: the node must **grow with its content**, and typing
`{{ variable }}` must **create an input handle** for it. Both live in
[`textNode.js`](../frontend/src/nodes/textNode.js) (~70 lines).

## Requirement 1: auto-resize

Two axes, two techniques:

**Width** — derived directly from content length, clamped:

```js
const width = Math.max(220, Math.min(500, text.length * 8));
```

Min 220px so an empty node isn't a sliver; max 500px so a pasted document
doesn't take over the canvas; past that, text wraps.

**Height** — the classic textarea auto-grow trick, in an effect that runs on
every text change:

```js
el.style.height = "auto";              // collapse to natural size
el.style.height = `${el.scrollHeight}px`;  // expand to fit content
```

Setting `height: auto` first is the non-obvious part — without it,
`scrollHeight` can never shrink when the user deletes lines.

## Requirement 2: `{{variable}}` → live input handles

### The regex

```js
/\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g
```

Reading it piece by piece:

- `\{\{` … `\}\}` — literal `{{` and `}}` (braces are escaped)
- `\s*` — optional whitespace, so `{{ input }}` and `{{input}}` both work
- `[a-zA-Z_$][a-zA-Z0-9_$]*` — **a valid JavaScript identifier**: first
  char is a letter/underscore/dollar, then alphanumerics. `{{9lives}}` and
  `{{foo-bar}}` correctly do *not* match — by design, only
  valid JS variable names become handles.
- the parentheses capture just the name; the `g` flag lets us loop matches.

`extractVariables()` walks matches with `regex.exec()` in a loop, deduping
via a `Set` while preserving first-appearance order — so
`"{{a}} {{b}} {{a}}"` yields `["a", "b"]`, and handle order is stable while
you type.

### From names to handles

Here the node abstraction pays off — dynamic handles are just a `.map()` in
the config:

```js
inputs: variables.map((name) => ({
  id: `${id}-${name}`,      // e.g. "text-1-name"
  label: name,
})),
```

`BaseNode`'s `distribute()` re-spaces the handles automatically as the count
changes: type a third variable and all three snap to 25/50/75%.

### The subtle bits

- **`useMemo` on extraction** — re-parse only when text changes, not on
  every render.
- **Handle id = `${id}-${name}`** — deterministic and namespaced per node,
  which is exactly what the backend expects: it strips the node-id prefix
  to recover `name` and feeds the connected value into that variable during
  execution (see [07_EXECUTION_ENGINE.md](07_EXECUTION_ENGINE.md)).
- **Deleting a variable orphans its edges** in ReactFlow's data (the handle
  disappears). Cosmetically fine for the demo; the production roadmap fix is
  pruning edges whose `targetHandle` no longer exists whenever variables
  change.
- **The `nodrag` class** on the textarea tells ReactFlow "this is a form
  control, don't start a canvas drag from here" — without it you can't
  select text inside a node.

## End-to-end payoff

This isn't just visual: connect an Input node to the `{{name}}` handle, run
the pipeline, and the backend substitutes the upstream value into the text —
`"Hello {{name}}!"` with input `"world"` produces `"Hello world!"` at the
Output node. There's a pytest asserting exactly that
(`test_execute_text_node_substitutes_variables`).
