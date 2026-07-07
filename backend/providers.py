"""Multi-provider LLM layer for the FlowForge execution engine.

One public function:

    generate(model, temperature, max_tokens, system, prompt, log) -> str

The `model` argument is the display name shown in the LLM node's dropdown
(e.g. "Claude Haiku 4.5"). It is mapped to a (provider, api_model_id) pair
here. If the provider's API key is present in the environment the call is
made live over HTTPS; otherwise — or on any API error — we fall back to a
deterministic local simulation so the app always runs keyless.

Env keys:
    OPENAI_API_KEY     → GPT models       (api.openai.com)
    ANTHROPIC_API_KEY  → Claude models    (api.anthropic.com)
    GEMINI_API_KEY     → Gemini models    (generativelanguage.googleapis.com)
"""

import os
import re
import time
from typing import List, Optional, Tuple

try:
    import httpx
except ImportError:  # httpx is optional — simulation still works without it
    httpx = None

TIMEOUT = 30.0

# Display name (LLM node dropdown) → (provider, API model id)
MODEL_REGISTRY = {
    "GPT-4o":           ("openai",    "gpt-4o"),
    "GPT-4o mini":      ("openai",    "gpt-4o-mini"),
    "Claude Sonnet 4.6": ("anthropic", "claude-sonnet-4-6"),
    "Claude Haiku 4.5":  ("anthropic", "claude-haiku-4-5"),
    "Gemini 2.5 Pro":   ("gemini",    "gemini-2.5-pro"),
    "Gemini 2.5 Flash": ("gemini",    "gemini-2.5-flash"),
}

_KEY_ENV = {
    "openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
}


def _api_key(provider: str) -> Optional[str]:
    for env in _KEY_ENV.get(provider, ()):
        key = os.environ.get(env)
        if key:
            return key
    return None


# ─────────────────────────── live providers ───────────────────────────

def _call_openai(key: str, model_id: str, temperature: float,
                 max_tokens: int, system: str, prompt: str) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    r = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _call_anthropic(key: str, model_id: str, temperature: float,
                    max_tokens: int, system: str, prompt: str) -> str:
    body = {
        "model": model_id,
        "max_tokens": max_tokens,
        # Anthropic accepts temperature in [0, 1]; the node slider goes to 2
        "temperature": min(temperature, 1.0),
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json=body,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
    return "".join(b["text"] for b in data["content"] if b["type"] == "text")


def _call_gemini(key: str, model_id: str, temperature: float,
                 max_tokens: int, system: str, prompt: str) -> str:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system:
        body["system_instruction"] = {"parts": [{"text": system}]}
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent",
        headers={"x-goog-api-key": key},
        json=body,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    candidates = r.json().get("candidates", [])
    if not candidates:
        raise ValueError("Gemini returned no candidates")
    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts)


_CALLERS = {
    "openai": _call_openai,
    "anthropic": _call_anthropic,
    "gemini": _call_gemini,
}


# ─────────────────────────── simulation fallback ───────────────────────────

def _simulate(model: str, temperature: float, max_tokens: int,
              system: str, prompt: str, log: List[str]) -> str:
    """Deterministic, prompt-aware simulation. Keeps the demo keyless."""
    if not prompt:
        log.append("no prompt received — nothing to respond to")
        return ""

    lower = prompt.lower()
    words = re.findall(r"[A-Za-z0-9']+", prompt)
    preview = " ".join(words[:24])

    if "summar" in lower:
        body = (f"Summary — the passage centres on: \"{preview}…\". "
                f"Key point extracted from {len(words)} words of input.")
    elif any(k in lower for k in ("classify", "spam", "category", "label")):
        body = "spam" if "spam" in lower else "positive"
    elif "translate" in lower:
        body = f"Translation — «{preview}…»"
    elif "?" in prompt:
        body = (f"Answer — based on the provided context, {preview.rstrip('?')} "
                f"can be addressed as follows: the retrieved passages support a direct response.")
    else:
        body = f"Response to: \"{preview}…\" — processed {len(words)} input words."

    if system:
        body = f"[persona: {system[:60]}] {body}"

    limit = max(16, int(max_tokens)) * 4  # ~4 chars per token
    if len(body) > limit:
        body = body[:limit].rstrip() + "…"
    return f"⟨{model} · simulated⟩ {body}"


# ─────────────────────────── public entry point ───────────────────────────

def resolve(model: str) -> Tuple[str, Optional[str]]:
    """Return (provider, api_model_id); unknown display names simulate."""
    return MODEL_REGISTRY.get(model, ("simulation", None))


def generate(model: str, temperature: float, max_tokens: int,
             system: str, prompt: str, log: List[str]) -> str:
    provider, api_model_id = resolve(model)
    key = _api_key(provider)

    if provider != "simulation" and key and httpx is not None and prompt:
        for attempt in (1, 2):
            try:
                text = _CALLERS[provider](key, api_model_id, temperature,
                                          max_tokens, system, prompt)
                log.append(f"live response from {provider} ({api_model_id})")
                return text
            except Exception as exc:
                # Never log str(exc): it can contain the request URL/headers.
                status = getattr(getattr(exc, "response", None), "status_code", None)
                reason = f"HTTP {status}" if status else exc.__class__.__name__
                transient = status in (429, 500, 502, 503, 504)
                if transient and attempt == 1:
                    log.append(f"{provider} returned {reason} — retrying once")
                    time.sleep(1.5)
                    continue
                log.append(f"{provider} call failed ({reason}) — falling back to simulation")
                break
    elif provider != "simulation" and not key:
        env = _KEY_ENV[provider][0]
        log.append(f"no {env} set — using simulation")

    return _simulate(model, temperature, max_tokens, system, prompt, log)
