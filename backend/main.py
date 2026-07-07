import os
import re
import time
from collections import Counter, defaultdict, deque
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from providers import generate as llm_generate

app = FastAPI(title="FlowForge Pipeline API")

_default_origins = "http://localhost:3000,http://localhost:3001"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PipelineData(BaseModel):
    nodes: List[Any]
    edges: List[Any]


def _build_graph(nodes: List[Any], edges: List[Any]):
    """Return (node_ids, adjacency, in_degree, out_degree, normalized_edges)."""
    node_ids = [n["id"] for n in nodes if isinstance(n, dict) and "id" in n]
    node_id_set = set(node_ids)

    adj: Dict[str, List[str]] = defaultdict(list)
    in_degree: Dict[str, int] = {nid: 0 for nid in node_ids}
    out_degree: Dict[str, int] = {nid: 0 for nid in node_ids}
    norm_edges: List[Dict[str, str]] = []

    for e in edges:
        if not isinstance(e, dict):
            continue
        src, tgt = e.get("source"), e.get("target")
        if src not in node_id_set or tgt not in node_id_set:
            continue
        adj[src].append(tgt)
        out_degree[src] += 1
        in_degree[tgt] += 1
        norm_edges.append({"source": src, "target": tgt})

    return node_ids, adj, in_degree, out_degree, norm_edges


def _topological_sort(node_ids, adj, in_degree):
    """Kahn's algorithm. Returns (order, cycle_nodes).
    order is None if there's a cycle; cycle_nodes is empty if DAG."""
    in_deg = dict(in_degree)
    queue = deque(nid for nid in node_ids if in_deg[nid] == 0)
    order: List[str] = []
    while queue:
        n = queue.popleft()
        order.append(n)
        for nb in adj[n]:
            in_deg[nb] -= 1
            if in_deg[nb] == 0:
                queue.append(nb)

    if len(order) == len(node_ids):
        return order, []

    cycle_nodes = [nid for nid in node_ids if in_deg[nid] > 0]
    return None, cycle_nodes


def _self_loop_node_ids(edges: List[Any]) -> List[str]:
    return sorted({e["source"] for e in edges
                   if isinstance(e, dict)
                   and e.get("source") is not None
                   and e.get("source") == e.get("target")})


def _build_warnings(
    nodes: List[Any],
    node_ids: List[str],
    entry_ids: List[str],
    exit_ids: List[str],
    orphan_ids: List[str],
    self_loops: List[str],
    is_dag: bool,
) -> List[Dict[str, Any]]:
    warnings: List[Dict[str, Any]] = []
    type_of = {n["id"]: n.get("type", "unknown") for n in nodes if isinstance(n, dict) and "id" in n}

    if not node_ids:
        warnings.append({
            "code": "EMPTY_PIPELINE",
            "message": "Pipeline has no nodes.",
            "node_ids": [],
        })

    # Only flag non-note orphans (notes are intentionally disconnected).
    flagged_orphans = [nid for nid in orphan_ids if type_of.get(nid) != "note"]
    if flagged_orphans:
        warnings.append({
            "code": "ORPHAN_NODES",
            "message": f"{len(flagged_orphans)} node(s) have no connections.",
            "node_ids": flagged_orphans,
        })

    if is_dag and node_ids and not entry_ids:
        warnings.append({
            "code": "NO_ENTRY",
            "message": "Pipeline has no entry points.",
            "node_ids": [],
        })

    if is_dag and node_ids and not exit_ids:
        warnings.append({
            "code": "NO_EXIT",
            "message": "Pipeline has no exit points.",
            "node_ids": [],
        })

    if self_loops:
        warnings.append({
            "code": "SELF_LOOP",
            "message": f"{len(self_loops)} node(s) connect to themselves.",
            "node_ids": self_loops,
        })

    has_input = any(t == "customInput" for t in type_of.values())
    has_output = any(t == "customOutput" for t in type_of.values())
    if node_ids and not has_input:
        warnings.append({
            "code": "NO_INPUT_NODE",
            "message": "Pipeline has no Input node.",
            "node_ids": [],
        })
    if node_ids and not has_output:
        warnings.append({
            "code": "NO_OUTPUT_NODE",
            "message": "Pipeline has no Output node.",
            "node_ids": [],
        })

    return warnings


# ═══════════════════════════════════════════════════════════════════
#  Execution engine
#
#  Nodes execute in topological order, values flow along edges from
#  source handles to target handles, and Output nodes collect the
#  final results.
#
#  Each node type registers an executor:
#      executor(data, inputs, log) -> {output_handle_suffix: value}
#  `inputs` is keyed by the node's own input-handle suffix (the part of
#  the handle id after "<node_id>-", e.g. "prompt", "query", a text
#  variable name). LLM generation lives in providers.py: live API calls
#  (OpenAI / Anthropic / Gemini) when a key is present, deterministic
#  simulation otherwise.
# ═══════════════════════════════════════════════════════════════════

_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}")


def _handle_suffix(node_id: str, handle: Optional[str], fallback: str) -> str:
    """'text-1-output' with node 'text-1' -> 'output'."""
    if handle and handle.startswith(f"{node_id}-"):
        return handle[len(node_id) + 1:]
    return handle or fallback


def _substitute(template: str, values: Dict[str, Any], log: List[str]) -> str:
    def repl(m):
        name = m.group(1)
        if name in values and values[name] is not None:
            return str(values[name])
        log.append(f"variable '{{{{{name}}}}}' has no connected value — left empty")
        return ""
    return _VAR_RE.sub(repl, template or "")


def _run_input(data, inputs, log):
    value = data.get("value") or ""
    name = data.get("inputName", "input")
    log.append(f"input '{name}' provided value ({len(str(value))} chars)")
    return {"value": value}


def _run_file_upload(data, inputs, log):
    file = data.get("file")
    if not file:
        log.append("no file attached — emitting empty document")
        return {"file": ""}
    name = file.get("name", "file")
    log.append(f"loaded '{name}' ({file.get('size', 0)} bytes, simulated contents)")
    return {"file": f"[document '{name}'] Simulated extracted text: "
                    f"This document discusses pipelines, retrieval and automation. "
                    f"It was uploaded as {name}."}


def _run_text(data, inputs, log):
    text = data.get("text", "")
    rendered = _substitute(text, inputs, log)
    log.append(f"rendered template ({len(rendered)} chars)")
    return {"output": rendered}


def _run_prompt_template(data, inputs, log):
    template = data.get("template", "")
    rendered = _substitute(template, inputs, log)
    log.append(f"prompt built for {data.get('model', 'GPT-4o')} ({len(rendered)} chars)")
    return {"prompt": rendered}


def _run_llm(data, inputs, log):
    model = str(data.get("model", "GPT-4o"))
    temperature = float(data.get("temperature", 0.7) or 0)
    max_tokens = int(float(data.get("maxTokens", 1024) or 1024))
    log.append(f"model={model} temperature={temperature} max_tokens={max_tokens}")
    response = llm_generate(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        system=str(inputs.get("system") or ""),
        prompt=str(inputs.get("prompt") or ""),
        log=log,
    )
    return {"response": response}


def _run_vector_search(data, inputs, log):
    query = str(inputs.get("query") or "")
    kb = str(inputs.get("kb") or "")
    top_k = int(float(data.get("topK", 5) or 5))

    chunks = [c.strip() for c in re.split(r"(?<=[.!?])\s+|\n+", kb) if c.strip()]
    if not chunks:
        log.append("knowledge base is empty — no results")
        return {"results": ""}

    q_words = set(re.findall(r"[a-z0-9']+", query.lower()))
    scored: List[Tuple[float, str]] = []
    for c in chunks:
        c_words = set(re.findall(r"[a-z0-9']+", c.lower()))
        overlap = len(q_words & c_words)
        score = overlap / (len(q_words) or 1)
        scored.append((score, c))
    scored.sort(key=lambda t: t[0], reverse=True)
    top = scored[:top_k]
    log.append(f"scored {len(chunks)} chunks by word overlap, returning top {len(top)}")
    return {"results": "\n".join(f"({s:.2f}) {c}" for s, c in top)}


_ROUTER_OPS = ["==", "!=", ">=", "<=", ">", "<", "includes"]


def _run_router(data, inputs, log):
    cond = str(data.get("condition", "") or "")
    value = inputs.get("input")
    op = next((o for o in _ROUTER_OPS if o in cond), None)
    result = None
    if op and value is not None:
        lhs, _, rhs = cond.partition(op)
        if lhs.strip() == "value":
            rhs = rhs.strip().strip("'\"")
            lv, rv = str(value), rhs
            try:
                lv, rv = float(lv), float(rhs)  # numeric compare when possible
            except ValueError:
                pass
            result = {
                "==": lambda: lv == rv, "!=": lambda: lv != rv,
                ">=": lambda: lv >= rv, "<=": lambda: lv <= rv,
                ">":  lambda: lv > rv,  "<":  lambda: lv < rv,
                "includes": lambda: str(rv) in str(lv),
            }[op]()
    if result is None:
        log.append(f"condition '{cond}' could not be evaluated — defaulting to FALSE branch")
        result = False
    branch = "true" if result else "false"
    log.append(f"condition '{cond}' on value '{str(value)[:60]}' → {branch.upper()} branch")
    return {branch: value}


def _run_output(data, inputs, log):
    value = inputs.get("value")
    log.append(f"captured final value ({len(str(value or ''))} chars)")
    return {"__final__": value}


_EXECUTORS: Dict[str, Callable] = {
    "customInput": _run_input,
    "fileUpload": _run_file_upload,
    "text": _run_text,
    "promptTemplate": _run_prompt_template,
    "llm": _run_llm,
    "vectorSearch": _run_vector_search,
    "router": _run_router,
    "customOutput": _run_output,
}


@app.post("/pipelines/execute")
def execute_pipeline(data: PipelineData):
    node_ids, adj, in_degree, out_degree, _ = _build_graph(data.nodes, data.edges)
    self_loops = _self_loop_node_ids(data.edges)
    order, cycle_nodes = _topological_sort(node_ids, adj, in_degree)

    base = {
        "num_nodes": len(data.nodes),
        "num_edges": len(data.edges),
    }
    if order is None or self_loops:
        return {
            **base,
            "status": "invalid",
            "is_dag": False,
            "error": "Pipeline contains a cycle and cannot be executed.",
            "cycle_node_ids": sorted(set(cycle_nodes) | set(self_loops)),
        }

    nodes_by_id = {n["id"]: n for n in data.nodes
                   if isinstance(n, dict) and "id" in n}
    incoming: Dict[str, List[dict]] = defaultdict(list)
    for e in data.edges:
        if isinstance(e, dict) and e.get("target") in nodes_by_id \
                and e.get("source") in nodes_by_id:
            incoming[e["target"]].append(e)

    node_outputs: Dict[str, Dict[str, Any]] = {}
    node_results: Dict[str, Dict[str, Any]] = {}
    final_outputs: List[Dict[str, Any]] = []

    for nid in order:
        node = nodes_by_id[nid]
        ntype = node.get("type", "unknown")
        ndata = node.get("data") or {}
        log: List[str] = []

        if ntype == "note" or ntype not in _EXECUTORS:
            node_results[nid] = {"status": "skipped", "outputs": {},
                                 "logs": ["not an executable node"], "elapsed_ms": 0}
            continue

        # Gather inputs from upstream outputs via edge handles
        inputs: Dict[str, Any] = {}
        fed_edges = incoming.get(nid, [])
        live_inputs = 0
        for e in fed_edges:
            src = e["source"]
            src_suffix = _handle_suffix(src, e.get("sourceHandle"), "value")
            tgt_suffix = _handle_suffix(nid, e.get("targetHandle"), "value")
            upstream = node_outputs.get(src, {})
            if src_suffix in upstream:
                inputs[tgt_suffix] = upstream[src_suffix]
                live_inputs += 1

        # A node fed only by inactive branches / skipped nodes is skipped
        if fed_edges and live_inputs == 0:
            node_results[nid] = {"status": "skipped", "outputs": {},
                                 "logs": ["no live upstream values (inactive branch)"],
                                 "elapsed_ms": 0}
            continue

        started = time.perf_counter()
        try:
            outputs = _EXECUTORS[ntype](ndata, inputs, log)
            elapsed = (time.perf_counter() - started) * 1000
            final = outputs.pop("__final__", None)
            node_outputs[nid] = outputs
            if ntype == "customOutput":
                final_outputs.append({
                    "node_id": nid,
                    "name": ndata.get("outputName", nid),
                    "value": final,
                })
            node_results[nid] = {
                "status": "executed",
                "outputs": {k: str(v)[:2000] for k, v in outputs.items()},
                **({"final_value": str(final)[:2000] if final is not None else None}
                   if ntype == "customOutput" else {}),
                "logs": log,
                "elapsed_ms": round(elapsed, 3),
            }
        except Exception as exc:  # keep executing the rest of the graph
            node_results[nid] = {"status": "error", "outputs": {},
                                 "logs": log + [f"error: {exc}"],
                                 "elapsed_ms": round((time.perf_counter() - started) * 1000, 3)}

    return {
        **base,
        "status": "success",
        "is_dag": True,
        "execution_order": order,
        "node_results": node_results,
        "final_outputs": final_outputs,
    }


@app.get("/")
def read_root():
    return {"Ping": "Pong"}


@app.post("/pipelines/parse")
def parse_pipeline(data: PipelineData):
    node_ids, adj, in_degree, out_degree, _ = _build_graph(
        data.nodes, data.edges
    )

    self_loops = _self_loop_node_ids(data.edges)
    order, cycle_nodes = _topological_sort(node_ids, adj, in_degree)
    is_dag = order is not None and not self_loops
    if self_loops and order is not None:
        # Kahn's can return an order even with self-loops if we filtered them
        # out earlier — but we didn't, so this branch is defensive only.
        cycle_nodes = sorted(set(cycle_nodes) | set(self_loops))
        order = None

    # Topology classifications
    entry_node_ids = sorted(
        nid for nid in node_ids
        if in_degree[nid] == 0 and out_degree[nid] > 0
    )
    exit_node_ids = sorted(
        nid for nid in node_ids
        if out_degree[nid] == 0 and in_degree[nid] > 0
    )
    orphan_node_ids = sorted(
        nid for nid in node_ids
        if in_degree[nid] == 0 and out_degree[nid] == 0
    )

    node_types = dict(Counter(
        n.get("type", "unknown")
        for n in data.nodes
        if isinstance(n, dict)
    ))

    warnings = _build_warnings(
        nodes=data.nodes,
        node_ids=node_ids,
        entry_ids=entry_node_ids,
        exit_ids=exit_node_ids,
        orphan_ids=orphan_node_ids,
        self_loops=self_loops,
        is_dag=is_dag,
    )

    return {
        # ── Backward-compatible flat fields (modal still works) ──
        "num_nodes": len(data.nodes),
        "num_edges": len(data.edges),
        "is_dag": is_dag,

        # ── New rich fields ──
        "node_types": node_types,
        "entry_node_ids": entry_node_ids,
        "exit_node_ids": exit_node_ids,
        "orphan_node_ids": orphan_node_ids,
        "topological_order": order,         # None when not DAG
        "cycle_node_ids": cycle_nodes,      # [] when DAG
        "warnings": warnings,
    }
