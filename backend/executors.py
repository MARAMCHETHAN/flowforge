"""Per-node-type executors for the FlowForge execution engine.

Contract:  executor(data, inputs, log) -> {output_handle_suffix: value}

- `data`   — the node's own fields (model, template text, condition…)
- `inputs` — values delivered by incoming edges, keyed by the node's
             input-handle suffix (the part after "<node_id>-")
- `log`    — human-readable lines surfaced in the UI's execution trace

Adding execution support for a new node type = one function + one
EXECUTORS entry. The engine itself never changes.
"""

import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from providers import generate as llm_generate

VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}")


def handle_suffix(node_id: str, handle: Optional[str], fallback: str) -> str:
    """'text-1-output' with node 'text-1' -> 'output'."""
    if handle and handle.startswith(f"{node_id}-"):
        return handle[len(node_id) + 1:]
    return handle or fallback


def substitute(template: str, values: Dict[str, Any], log: List[str]) -> str:
    def repl(m):
        name = m.group(1)
        if name in values and values[name] is not None:
            return str(values[name])
        log.append(f"variable '{{{{{name}}}}}' has no connected value — left empty")
        return ""
    return VAR_RE.sub(repl, template or "")


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
    content = file.get("content")
    if content:
        log.append(f"loaded '{name}' — {len(str(content))} chars of real text "
                   f"extracted in the browser")
        return {"file": str(content)}
    log.append(f"'{name}' isn't a plain-text file — text extraction only covers "
               f".txt/.md/.csv/.json for now; using simulated contents")
    return {"file": f"[document '{name}'] Simulated extracted text: "
                    f"This document discusses pipelines, retrieval and automation. "
                    f"It was uploaded as {name}."}


def _run_text(data, inputs, log):
    rendered = substitute(data.get("text", ""), inputs, log)
    log.append(f"rendered template ({len(rendered)} chars)")
    return {"output": rendered}


def _run_prompt_template(data, inputs, log):
    rendered = substitute(data.get("template", ""), inputs, log)
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
        score = len(q_words & c_words) / (len(q_words) or 1)
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


EXECUTORS: Dict[str, Callable] = {
    "customInput": _run_input,
    "fileUpload": _run_file_upload,
    "text": _run_text,
    "promptTemplate": _run_prompt_template,
    "llm": _run_llm,
    "vectorSearch": _run_vector_search,
    "router": _run_router,
    "customOutput": _run_output,
}
