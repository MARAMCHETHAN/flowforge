"""The execution engine: run a pipeline graph in topological order.

Values flow along edges from source handles to target handles; Output
nodes collect final results. Nodes on an untaken router branch are
skipped; a node that throws is marked `error` and the run continues.
"""

import time
from collections import defaultdict
from typing import Any, Dict, List

from executors import EXECUTORS, handle_suffix
from graph import build_graph, self_loop_node_ids, topological_sort


def execute(nodes: List[Any], edges: List[Any]) -> Dict[str, Any]:
    node_ids, adj, in_degree, _, _ = build_graph(nodes, edges)
    self_loops = self_loop_node_ids(edges)
    order, cycle_nodes = topological_sort(node_ids, adj, in_degree)

    base = {"num_nodes": len(nodes), "num_edges": len(edges)}
    if order is None or self_loops:
        return {
            **base,
            "status": "invalid",
            "is_dag": False,
            "error": "Pipeline contains a cycle and cannot be executed.",
            "cycle_node_ids": sorted(set(cycle_nodes) | set(self_loops)),
        }

    nodes_by_id = {n["id"]: n for n in nodes
                   if isinstance(n, dict) and "id" in n}
    incoming: Dict[str, List[dict]] = defaultdict(list)
    for e in edges:
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

        if ntype == "note" or ntype not in EXECUTORS:
            node_results[nid] = {"status": "skipped", "outputs": {},
                                 "logs": ["not an executable node"], "elapsed_ms": 0}
            continue

        # Gather inputs from upstream outputs via edge handles
        inputs: Dict[str, Any] = {}
        fed_edges = incoming.get(nid, [])
        live_inputs = 0
        for e in fed_edges:
            src = e["source"]
            src_suffix = handle_suffix(src, e.get("sourceHandle"), "value")
            tgt_suffix = handle_suffix(nid, e.get("targetHandle"), "value")
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
            outputs = EXECUTORS[ntype](ndata, inputs, log)
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
