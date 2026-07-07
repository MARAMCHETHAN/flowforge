"""FlowForge Pipeline API.

Endpoints:
    GET  /                  — health check
    POST /pipelines/parse   — validate: counts, DAG check, structural warnings
    POST /pipelines/execute — run the graph (see engine.py)

Module layout: graph.py (Kahn's algorithm), executors.py (per-node-type
runners), engine.py (the execution loop), providers.py (LLM APIs).
"""

import os
import time
from collections import Counter, defaultdict, deque
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import engine
from graph import build_graph, self_loop_node_ids, topological_sort

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


# ── Rate limiting ────────────────────────────────────────────────────
# The execute endpoint spends our LLM quota, and this API is public.
# Simple in-memory sliding window per client IP (fine for one instance).
RATE_LIMIT_RUNS = int(os.environ.get("RATE_LIMIT_RUNS", "10"))
RATE_LIMIT_WINDOW_S = int(os.environ.get("RATE_LIMIT_WINDOW_S", "60"))
_hits: Dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:  # behind Render's proxy the real IP is the first entry
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    now = time.monotonic()
    window = _hits[_client_ip(request)]
    while window and now - window[0] > RATE_LIMIT_WINDOW_S:
        window.popleft()
    if len(window) >= RATE_LIMIT_RUNS:
        raise HTTPException(
            status_code=429,
            detail=(f"Rate limit: {RATE_LIMIT_RUNS} runs per "
                    f"{RATE_LIMIT_WINDOW_S}s per client. Take a short break "
                    f"and run again."),
        )
    window.append(now)


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
    type_of = {n["id"]: n.get("type", "unknown")
               for n in nodes if isinstance(n, dict) and "id" in n}

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


@app.get("/")
def read_root():
    return {"Ping": "Pong"}


@app.post("/pipelines/parse")
def parse_pipeline(data: PipelineData):
    node_ids, adj, in_degree, out_degree, _ = build_graph(data.nodes, data.edges)

    self_loops = self_loop_node_ids(data.edges)
    order, cycle_nodes = topological_sort(node_ids, adj, in_degree)
    is_dag = order is not None and not self_loops
    if self_loops and order is not None:
        cycle_nodes = sorted(set(cycle_nodes) | set(self_loops))
        order = None

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
        "num_nodes": len(data.nodes),
        "num_edges": len(data.edges),
        "is_dag": is_dag,
        "node_types": node_types,
        "entry_node_ids": entry_node_ids,
        "exit_node_ids": exit_node_ids,
        "orphan_node_ids": orphan_node_ids,
        "topological_order": order,         # None when not DAG
        "cycle_node_ids": cycle_nodes,      # [] when DAG
        "warnings": warnings,
    }


@app.post("/pipelines/execute")
def execute_pipeline(data: PipelineData, request: Request):
    enforce_rate_limit(request)
    return engine.execute(data.nodes, data.edges)
