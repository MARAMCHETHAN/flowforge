# Learn: how FlowForge works — from zero to production

This folder explains **every part of FlowForge** — what was built, why it was
built that way, and how each piece works under the hood. Read in order the
first time; afterwards each file stands alone as a reference.

## Reading order

| # | File | What you'll learn |
|---|------|-------------------|
| 1 | [01_ARCHITECTURE.md](01_ARCHITECTURE.md) | The big picture: how frontend, store, and backend fit together |
| 2 | [02_NODE_ABSTRACTION.md](02_NODE_ABSTRACTION.md) | The config-driven `BaseNode` — why a new node type costs ~30 lines |
| 3 | [03_STATE_MANAGEMENT.md](03_STATE_MANAGEMENT.md) | Zustand store, undo/redo history, autosave — and why not Redux |
| 4 | [04_TEXT_NODE_VARIABLES.md](04_TEXT_NODE_VARIABLES.md) | Regex variable extraction, dynamic handles, textarea auto-resize |
| 5 | [05_STYLING.md](05_STYLING.md) | The Pixel-Arcade design system: CSS variables, theming every node from one place |
| 6 | [06_BACKEND_DAG.md](06_BACKEND_DAG.md) | Kahn's algorithm, cycle detection, the `/pipelines/parse` contract |
| 7 | [07_EXECUTION_ENGINE.md](07_EXECUTION_ENGINE.md) | How pipelines *actually run* — executor registry, value flow, branch skipping, the multi-provider LLM layer |
| 8 | [08_PRODUCTION_PRACTICES.md](08_PRODUCTION_PRACTICES.md) | Testing, validation, accessibility, error handling, honest trade-offs |

## Run it

```bash
# Terminal A — backend
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload

# Terminal B — frontend
cd frontend
npm install
npm start          # opens http://localhost:3000
```

Then: drag nodes from the toolbar (or press **⌘K**), connect them, and click
**► RUN PIPELINE**. Try **Templates → RAG Pipeline** for an instant demo.

Optional — real LLM calls instead of the simulation:

```bash
export ANTHROPIC_API_KEY=...   # and/or OPENAI_API_KEY, GEMINI_API_KEY
```

## Test it

```bash
cd backend && pytest test_main.py -v        # 17 backend tests
```

## The 30-second pitch

> A visual LLM pipeline builder in React + FastAPI. Nodes are **pure
> configuration** over one `BaseNode` component, so a new node type costs
> ~30 lines. The graph is validated in real time (cycles are rejected *while
> you drag* the edge) and validated again server-side with Kahn's algorithm.
> Clicking Run **executes** the graph in topological order: values flow along
> edges, `{{variables}}` get substituted, a router picks a branch, the LLM
> node calls OpenAI / Anthropic / Gemini (or an honest simulation when no key
> is set), and the Output nodes light up with real results, animated in
> execution order on the canvas — with a per-node trace of what ran and why.
