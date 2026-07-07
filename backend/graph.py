"""Graph primitives: adjacency building and Kahn's topological sort."""

from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Tuple


def build_graph(nodes: List[Any], edges: List[Any]):
    """Return (node_ids, adjacency, in_degree, out_degree, normalized_edges).

    Edges referencing unknown node ids are ignored rather than crashing.
    """
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


def topological_sort(node_ids, adj, in_degree) -> Tuple[Optional[List[str]], List[str]]:
    """Kahn's algorithm. Returns (order, cycle_nodes).

    order is None if there's a cycle; cycle_nodes is empty for a DAG.
    """
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


def self_loop_node_ids(edges: List[Any]) -> List[str]:
    return sorted({e["source"] for e in edges
                   if isinstance(e, dict)
                   and e.get("source") is not None
                   and e.get("source") == e.get("target")})
