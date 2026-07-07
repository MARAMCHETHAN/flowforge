# 08 — Production practices & design trade-offs

What separates "it works on my machine" from production-grade, as
implemented in this repo.

## Testing (two layers)

**Backend — 14 pytest tests** ([`test_main.py`](../backend/test_main.py))
via FastAPI's `TestClient`, no server needed:

- parse: counts, linear DAG, cycle, self-loop, orphan warning (note-exempt),
  dangling-edge tolerance, empty pipeline
- execute: value flow end-to-end, `{{var}}` substitution, unconnected-var
  fallback, router true/false branch skipping, vector-search ranking, cycle
  rejection, note skipping, **and** graceful per-node error handling

**Frontend — Playwright smoke driver**
: loads a template and
runs it, drives the ⌘K palette, attempts a cycle and asserts the rejection
banner, types `{{name}} {{order_id}}` and asserts two handles materialize.
Screenshots are saved as evidence. This caught the one real regression in
the project (a mangled function name in the store that broke every
mutation) — the argument for smoke tests over "it compiled".

## Validation at every boundary

| Boundary | Check |
|----------|-------|
| Edge creation (drag) | self-loop, duplicate, occupied input, would-create-cycle |
| Submit | server re-validates the DAG (never trust the client) |
| JSON import | shape-checked before replacing state; errors reported, state untouched |
| localStorage restore | shape-checked; corrupt data falls back to empty |
| Executor crash | caught per node; run degrades instead of 500-ing |
| Response size | node outputs truncated to 2KB server-side |

## Error handling users can act on

- Backend down → the modal says *what to start and where*
  ("FastAPI on http://localhost:8000"), not "Network Error".
- Cycle → the offending node ids come back and get marked red on canvas.
- Unconnected `{{variable}}` → executes anyway, with a warning in the trace.
- Destructive actions (template-over-work, clear-all) require confirmation.

## Accessibility & UX detail

- Modals: `role="dialog"`, `aria-modal`, labelled titles, Escape + backdrop
  close, rendered via portals.
- Icon buttons carry `aria-label`s; handles have `title` tooltips.
- Keyboard path for everything: ⌘K add/insert, ⌘Z/⌘⇧Z undo/redo,
  Delete/Backspace remove — all suppressed while typing in a field
  (checked against `e.target.tagName`).
- Hover-only affordances become always-visible on touch
  (`@media (hover: none)`).

## Performance choices

- Zustand selectors + `useShallow` → dragging a node re-renders that node,
  not the app.
- `useMemo` on variable extraction and palette filtering.
- Debounced (400ms) snapshots → one history entry per burst of typing.
- Snapshot skipped entirely when state deep-equals the head.
- O(V+E) algorithms for cycle check and layout — fine for thousands of nodes.

## Honest limitations (say these before they ask)

1. **The LLM is simulated** — deliberately, so the demo runs keyless and
   deterministic. The provider seam is one function.
2. **History is O(graph) per snapshot** — deep clones. At ~50 entries ×
   small graphs it's nothing; at 10k nodes you'd move to structural sharing
   (immer patches) or command-based undo.
3. **Edges to deleted `{{variables}}`** linger in data until the next
   graph operation; a pruning pass on variable change is the fix.
4. **No auth / rate limiting** on the API — dev scope.
5. **`localStorage` is per-browser** — real persistence means a backend
   save endpoint; Export/Import JSON is the interim answer.

## One-paragraph project summary

> "I built the four required parts, then kept going to make it feel like the
> real product. The core design decision is *configuration over code*: nodes
> are config objects rendered by one BaseNode, mirrored by an executor
> registry on the backend — so a new node type is ~30 lines of config plus
> one Python function, with styling inherited automatically. State is a
> single Zustand store where one debounced snapshot path powers undo/redo
> *and* autosave. The graph is validated twice — BFS in the browser while
> you drag, Kahn's algorithm on the server — because the client check is UX
> and the server check is truth. And Run actually executes the DAG: values
> flow along handle-to-handle edges, a router branch-skips, outputs land on
> the canvas, animated in topological order. It's tested at both layers —
> 14 pytest cases and a Playwright driver that screenshots the four core
> flows."
