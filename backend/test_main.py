"""Backend test suite — run with `pytest test_main.py -v` from /backend.

Covers the two endpoints:
  /pipelines/parse   — node/edge counts, DAG detection, warnings
  /pipelines/execute — topological execution, value flow, branching, cycles
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _node(nid, ntype, **data):
    return {"id": nid, "type": ntype, "data": data}


def _edge(src, tgt, sh=None, th=None):
    return {
        "source": src,
        "target": tgt,
        "sourceHandle": sh or f"{src}-value",
        "targetHandle": th or f"{tgt}-value",
    }


# ─────────────────────────── /pipelines/parse ───────────────────────────

def test_parse_empty_pipeline():
    r = client.post("/pipelines/parse", json={"nodes": [], "edges": []})
    body = r.json()
    assert r.status_code == 200
    assert body["num_nodes"] == 0
    assert body["num_edges"] == 0
    assert body["is_dag"] is True
    assert any(w["code"] == "EMPTY_PIPELINE" for w in body["warnings"])


def test_parse_linear_dag():
    nodes = [_node("a", "customInput"), _node("b", "llm"), _node("c", "customOutput")]
    edges = [_edge("a", "b"), _edge("b", "c")]
    body = client.post("/pipelines/parse", json={"nodes": nodes, "edges": edges}).json()
    assert body == {**body, "num_nodes": 3, "num_edges": 2, "is_dag": True}
    assert body["topological_order"] == ["a", "b", "c"]
    assert body["cycle_node_ids"] == []


def test_parse_cycle_detected():
    nodes = [_node("a", "llm"), _node("b", "llm")]
    edges = [_edge("a", "b"), _edge("b", "a")]
    body = client.post("/pipelines/parse", json={"nodes": nodes, "edges": edges}).json()
    assert body["is_dag"] is False
    assert body["topological_order"] is None
    assert set(body["cycle_node_ids"]) == {"a", "b"}


def test_parse_self_loop_is_not_dag():
    nodes = [_node("a", "llm")]
    edges = [_edge("a", "a")]
    body = client.post("/pipelines/parse", json={"nodes": nodes, "edges": edges}).json()
    assert body["is_dag"] is False
    assert "a" in body["cycle_node_ids"]


def test_parse_orphan_warning_ignores_notes():
    nodes = [_node("a", "llm"), _node("n", "note")]
    body = client.post("/pipelines/parse", json={"nodes": nodes, "edges": []}).json()
    orphan = next(w for w in body["warnings"] if w["code"] == "ORPHAN_NODES")
    assert orphan["node_ids"] == ["a"]  # note is exempt


def test_parse_ignores_edges_to_unknown_nodes():
    nodes = [_node("a", "llm")]
    edges = [_edge("a", "ghost")]
    body = client.post("/pipelines/parse", json={"nodes": nodes, "edges": edges}).json()
    assert body["is_dag"] is True  # dangling edge doesn't break the graph


# ────────────────────────── /pipelines/execute ──────────────────────────

def test_execute_linear_flow_carries_value_to_output():
    nodes = [
        _node("in-1", "customInput", inputName="doc",
              value="Summarize: pipelines are graphs of nodes."),
        _node("llm-1", "llm", model="GPT-4o", temperature="0.3", maxTokens="256"),
        _node("out-1", "customOutput", outputName="summary"),
    ]
    edges = [
        _edge("in-1", "llm-1", "in-1-value", "llm-1-prompt"),
        _edge("llm-1", "out-1", "llm-1-response", "out-1-value"),
    ]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["status"] == "success"
    assert body["execution_order"] == ["in-1", "llm-1", "out-1"]
    assert all(r["status"] == "executed" for r in body["node_results"].values())
    final = body["final_outputs"][0]
    assert final["name"] == "summary"
    assert "Summary" in final["value"]          # the simulated LLM summarized
    assert "GPT-4o" in final["value"]


def test_execute_text_node_substitutes_variables():
    nodes = [
        _node("in-1", "customInput", value="world"),
        _node("text-1", "text", text="Hello {{name}}!"),
        _node("out-1", "customOutput", outputName="greeting"),
    ]
    edges = [
        _edge("in-1", "text-1", "in-1-value", "text-1-name"),
        _edge("text-1", "out-1", "text-1-output", "out-1-value"),
    ]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["final_outputs"][0]["value"] == "Hello world!"


def test_execute_unconnected_variable_becomes_empty():
    nodes = [
        _node("text-1", "text", text="Hi {{missing}}."),
        _node("out-1", "customOutput", outputName="o"),
    ]
    edges = [_edge("text-1", "out-1", "text-1-output", "out-1-value")]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["final_outputs"][0]["value"] == "Hi ."
    logs = body["node_results"]["text-1"]["logs"]
    assert any("missing" in l for l in logs)


def test_execute_router_takes_true_branch_and_skips_false():
    nodes = [
        _node("in-1", "customInput", value="42"),
        _node("r-1", "router", condition="value > 10"),
        _node("out-t", "customOutput", outputName="big"),
        _node("out-f", "customOutput", outputName="small"),
    ]
    edges = [
        _edge("in-1", "r-1", "in-1-value", "r-1-input"),
        _edge("r-1", "out-t", "r-1-true", "out-t-value"),
        _edge("r-1", "out-f", "r-1-false", "out-f-value"),
    ]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["node_results"]["out-t"]["status"] == "executed"
    assert body["node_results"]["out-f"]["status"] == "skipped"
    assert body["final_outputs"] == [
        {"node_id": "out-t", "name": "big", "value": "42"}
    ]


def test_execute_vector_search_ranks_by_overlap():
    kb = ("Cats sleep a lot. Pipelines route data between nodes. "
          "The weather is sunny today.")
    nodes = [
        _node("q", "customInput", value="how do pipelines route data"),
        _node("k", "customInput", value=kb),
        _node("v", "vectorSearch", topK="1"),
        _node("o", "customOutput", outputName="hits"),
    ]
    edges = [
        _edge("q", "v", "q-value", "v-query"),
        _edge("k", "v", "k-value", "v-kb"),
        _edge("v", "o", "v-results", "o-value"),
    ]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert "Pipelines route data" in body["final_outputs"][0]["value"]


def test_execute_rejects_cycle():
    nodes = [_node("a", "llm"), _node("b", "llm")]
    edges = [_edge("a", "b"), _edge("b", "a")]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["status"] == "invalid"
    assert body["is_dag"] is False
    assert set(body["cycle_node_ids"]) == {"a", "b"}


def test_execute_note_nodes_are_skipped():
    nodes = [_node("n", "note", content="remember to tune temp")]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": []}).json()
    assert body["node_results"]["n"]["status"] == "skipped"


def test_execute_bad_node_data_does_not_crash_run():
    nodes = [
        _node("llm-1", "llm", maxTokens="not-a-number"),
        _node("out-1", "customOutput", outputName="o"),
    ]
    edges = [_edge("llm-1", "out-1", "llm-1-response", "out-1-value")]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["status"] == "success"          # run completes
    assert body["node_results"]["llm-1"]["status"] == "error"
    assert body["node_results"]["out-1"]["status"] == "skipped"


# ────────────────────────── provider layer ──────────────────────────

import pytest
import providers


@pytest.fixture(autouse=True)
def _no_live_keys(monkeypatch):
    """Force simulation mode: tests must never hit real provider APIs."""
    for env in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY",
                "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(env, raising=False)


def test_resolve_maps_display_names_to_providers():
    assert providers.resolve("GPT-4o") == ("openai", "gpt-4o")
    assert providers.resolve("Claude Sonnet 4.6") == ("anthropic", "claude-sonnet-4-6")
    assert providers.resolve("Gemini 2.5 Flash") == ("gemini", "gemini-2.5-flash")
    assert providers.resolve("Some Unknown Model") == ("simulation", None)


def test_generate_without_key_simulates_and_logs():
    log = []
    out = providers.generate("Claude Haiku 4.5", 0.3, 256,
                             system="", prompt="Summarize: graphs are neat.", log=log)
    assert out.startswith("⟨Claude Haiku 4.5 · simulated⟩")
    assert any("no ANTHROPIC_API_KEY set" in l for l in log)


def test_generate_respects_max_tokens_cap():
    log = []
    out = providers.generate("GPT-4o", 0.7, 16,
                             system="", prompt="word " * 500, log=log)
    assert len(out) <= len("⟨GPT-4o · simulated⟩ ") + 16 * 4 + 1


def test_execute_file_upload_uses_real_browser_content():
    nodes = [
        _node("f-1", "fileUpload",
              file={"name": "notes.txt", "size": 42,
                    "content": "FlowForge pipelines execute in topological order."}),
        _node("out-1", "customOutput", outputName="doc"),
    ]
    edges = [_edge("f-1", "out-1", "f-1-file", "out-1-value")]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert body["final_outputs"][0]["value"] == \
        "FlowForge pipelines execute in topological order."
    assert any("real text" in l for l in body["node_results"]["f-1"]["logs"])


def test_execute_file_upload_without_content_falls_back_to_simulation():
    nodes = [
        _node("f-1", "fileUpload", file={"name": "report.pdf", "size": 999}),
        _node("out-1", "customOutput", outputName="doc"),
    ]
    edges = [_edge("f-1", "out-1", "f-1-file", "out-1-value")]
    body = client.post("/pipelines/execute", json={"nodes": nodes, "edges": edges}).json()
    assert "Simulated extracted text" in body["final_outputs"][0]["value"]


def test_execute_rate_limit_kicks_in(monkeypatch):
    import main as main_module
    monkeypatch.setattr(main_module, "RATE_LIMIT_RUNS", 3)
    main_module._hits.clear()
    payload = {"nodes": [_node("n", "note")], "edges": []}
    for _ in range(3):
        assert client.post("/pipelines/execute", json=payload).status_code == 200
    resp = client.post("/pipelines/execute", json=payload)
    assert resp.status_code == 429
    assert "Rate limit" in resp.json()["detail"]
    main_module._hits.clear()  # don't poison other tests
