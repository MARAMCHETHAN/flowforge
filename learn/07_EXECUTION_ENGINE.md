# 07 — The execution engine: pipelines that actually run

Most pipeline-builder demos stop at validating the graph. FlowForge's core
feature is that **clicking Run actually executes it — data flows through the
pipeline**. Endpoint: `POST /pipelines/execute` in
[`main.py`](../backend/main.py).

## The mental model

A pipeline run is three steps:

1. **Order** — Kahn's algorithm (already needed for the DAG check) yields an
   order where every node runs *after* everything it depends on.
2. **Flow** — each node's outputs are stored under its handle names; edges
   deliver them to downstream nodes' input handles.
3. **Execute** — each node type has a small **executor** function that turns
   inputs into outputs.

```
executor(data, inputs, log) -> { output_handle: value }
```

- `data` — the node's own fields (model, temperature, the text template…)
- `inputs` — values delivered by incoming edges, keyed by *input handle
  suffix* (`prompt`, `query`, a text variable name…)
- `log` — the executor appends human-readable lines; they surface in the
  UI's execution trace.

Executors are registered in a dict:

```python
_EXECUTORS = {"customInput": _run_input, "llm": _run_llm, "router": _run_router, ...}
```

Adding execution support for a new node = one function + one dict entry.
The engine itself never changes — the same **registry pattern** as the
frontend's `nodeTypes` map, mirrored across the stack.

## The handle-suffix protocol (the glue)

Frontend handles are `"<nodeId>-<port>"` (`llm-1-prompt`). The engine strips
the node-id prefix to get the port name:

```
edge: llm-1 --(sourceHandle "llm-1-response")--> out-1 (targetHandle "out-1-value")
engine: inputs_for("out-1")["value"] = outputs_of("llm-1")["response"]
```

This is also how **Text node variables execute**: the frontend creates the
handle `text-1-name` for `{{name}}`, so the value connected there arrives in
`inputs` as `name`, and `_substitute()` drops it into the template. The
regex on the backend matches the frontend's exactly — one contract, two
implementations, covered by a test on each side.

## What each executor does

| Node | Behaviour |
|------|-----------|
| Input | emits its "Default Value" field as `value` |
| File Upload | emits simulated extracted text for the attached file (browser never uploads bytes; metadata only) |
| Text | substitutes `{{vars}}` from inputs; unconnected vars → empty string + a warning in the log |
| Prompt Template | same substitution over its template field |
| **LLM** | live API call (OpenAI / Anthropic / Gemini) when a key is set, deterministic simulation otherwise (see below) |
| Vector Search | real scoring: splits the KB into sentence chunks, ranks by query-word overlap, returns top-K with scores |
| Router | parses `value <op> literal` (`==, !=, >, <, >=, <=, includes`), numeric compare when both sides parse as numbers, and emits the value **only on the taken branch** |
| Output | captures the arriving value as a final output |
| Note | skipped (not executable) |

## The multi-provider LLM layer

[`providers.py`](../backend/providers.py) is the seam between the engine and
the outside world. `MODEL_REGISTRY` maps the dropdown's display names to
`(provider, api_model_id)` pairs — `"Claude Haiku 4.5"` →
`("anthropic", "claude-haiku-4-5")`. If the provider's key is in the
environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`), the
call goes live over raw HTTPS via `httpx`; the three provider functions are
deliberately symmetric so you can read the API differences side by side
(OpenAI's bearer token vs Anthropic's `x-api-key` + `anthropic-version`
headers vs Gemini's query-param key).

**No key? It still runs.** The fallback is an honest, clearly-labelled
simulation — every response prefixed `⟨model · simulated⟩` — that is
deterministic but *prompt-aware*: summarize prompts get a summary-shaped
answer, classify prompts get a label, questions get an answer shape;
`max_tokens` truncates, `system` becomes a persona tag. Any API error also
degrades to simulation with the failure noted in the node's log, so a bad
key or a provider outage never breaks a run.

## Branch skipping (the subtle part)

The Router emits on only one of its two output handles. Downstream, the
engine counts each node's **live inputs** — edges whose source actually
produced a value on that handle. A node whose incoming edges delivered
*nothing* is marked `skipped`, and the skip propagates naturally down the
inactive branch, because skipped nodes produce no outputs either.

Errors work the same way: an executor that throws is caught, marked
`error`, and the run **continues** — one bad node degrades the run instead
of 500-ing the whole request (`test_execute_bad_node_data_does_not_crash_run`).

## The response and what the frontend does with it

```json
{ "status": "success", "is_dag": true, "num_nodes": 3, "num_edges": 2,
  "execution_order": ["in-1", "llm-1", "out-1"],
  "node_results": { "llm-1": { "status": "executed", "outputs": {...},
                               "logs": [...], "elapsed_ms": 0.21 }, ... },
  "final_outputs": [ { "node_id": "out-1", "name": "summary", "value": "..." } ] }
```

[`submit.js`](../frontend/src/submit.js) then:

1. **Animates the sweep** — walks `execution_order`, marking each node
   `running` (pulsing yellow) then its final status. Step delay adapts to
   graph size (60–180ms/node, ~1.4s total).
2. **Fills the canvas with results** — each final output is written into its
   Output node's `lastValue`, so the "LAST VALUE" preview shows the answer
   right on the node.
3. **Shows the modal** — required stats up top (unchanged contract), then
   OUTPUTS, then a collapsible per-node trace (status, timing, logs, output
   previews — values truncated server-side to 2KB so a huge document can't
   bloat the response).

If the graph is cyclic, `status: "invalid"` comes back with
`cycle_node_ids`, and the frontend marks exactly those nodes red.
