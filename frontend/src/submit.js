import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";
import { RunResultsModal, buildStory } from "./runResults";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const EXECUTE_URL = `${API_BASE}/pipelines/execute`;

// Free-tier hosting sleeps when idle and 5xx's while waking.
const WAKE_ATTEMPTS = 5;
const WAKE_DELAY_MS = 8000;

const selector = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  setRunStatus: state.setRunStatus,
  setRunStatuses: state.setRunStatuses,
  clearRunStatuses: state.clearRunStatuses,
  updateNodeField: state.updateNodeField,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SubmitButton = () => {
  const {
    nodes,
    edges,
    setRunStatus,
    setRunStatuses,
    clearRunStatuses,
    updateNodeField,
  } = useStore(useShallow(selector));
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [result, setResult] = useState(null);

  const nodeTypeById = {};
  const nodesById = {};
  for (const n of nodes) {
    nodeTypeById[n.id] = n.type;
    nodesById[n.id] = n;
  }

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setWaking(false);
    clearRunStatuses();
    try {
      // Retry with a visible "waking" status instead of failing on the
      // sleeping free-tier server's first error.
      let res = null;
      for (let attempt = 1; attempt <= WAKE_ATTEMPTS; attempt++) {
        try {
          res = await fetch(EXECUTE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodes, edges }),
          });
          if (res.ok || res.status === 429) break;
        } catch {
          res = null;
        }
        if (attempt < WAKE_ATTEMPTS) {
          setWaking(true);
          await sleep(WAKE_DELAY_MS);
        }
      }
      setWaking(false);
      if (res && res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setResult({
          error:
            body.detail ||
            "You're running pipelines very fast — take a short break and try again.",
        });
        return;
      }
      if (!res || !res.ok) {
        throw new Error(`Server responded ${res ? res.status : "not at all"}`);
      }
      const data = await res.json();

      if (data.status === "success") {
        // Animated sweep: light nodes up in topological order
        const order = data.execution_order || [];
        const step = Math.min(180, Math.max(60, 1400 / (order.length || 1)));
        for (const nid of order) {
          setRunStatus(nid, "running");
          // eslint-disable-next-line no-await-in-loop
          await sleep(step);
          setRunStatus(nid, data.node_results?.[nid]?.status || "skipped");
        }
        // Mark non-executable nodes (notes) too
        const statuses = {};
        for (const [nid, r] of Object.entries(data.node_results || {})) {
          statuses[nid] = r.status;
        }
        setRunStatuses(statuses);

        // Push final values into Output nodes so PreviewSlot shows them
        for (const f of data.final_outputs || []) {
          updateNodeField(f.node_id, "lastValue", f.value ?? "");
        }
      } else if (data.status === "invalid") {
        const bad = {};
        for (const nid of data.cycle_node_ids || []) bad[nid] = "error";
        setRunStatuses(bad);
      }

      setResult(data);
    } catch (err) {
      setResult({
        error:
          `The backend at ${API_BASE} isn't responding. On free hosting the server sleeps when idle — give it ~30 seconds and press RUN again.`,
      });
    } finally {
      setLoading(false);
    }
  }, [nodes, edges, setRunStatus, setRunStatuses, clearRunStatuses, updateNodeField]);

  return (
    <>
      <div className="vs-submit-bar">
        <button
          className="vs-submit-btn"
          onClick={onSubmit}
          disabled={loading || nodes.length === 0}
          title={
            nodes.length === 0
              ? "Add a node first — the 🎓 LEARN guide shows you how"
              : "Validate and run this pipeline"
          }
          type="button"
        >
          {loading ? (
            <>
              <span className="vs-spinner" />
              {waking ? "WAKING SERVER… (FREE HOSTING)" : "RUNNING…"}
            </>
          ) : (
            <>► RUN PIPELINE</>
          )}
        </button>
      </div>
      {result && (
        <RunResultsModal
          result={result}
          story={buildStory(result, nodesById)}
          nodeTypeById={nodeTypeById}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
};
