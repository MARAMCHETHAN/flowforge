import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";
import { NODE_META } from "./nodes/nodeMeta";

const EXECUTE_URL = "http://localhost:8000/pipelines/execute";

const selector = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  setRunStatus: state.setRunStatus,
  setRunStatuses: state.setRunStatuses,
  clearRunStatuses: state.clearRunStatuses,
  updateNodeField: state.updateNodeField,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATUS_ICONS = {
  executed: "✓",
  skipped: "⤫",
  error: "!",
};

const TraceRow = ({ nodeId, result, nodeType }) => {
  const [open, setOpen] = useState(false);
  const meta = NODE_META[nodeType];
  const hasDetail = result.logs?.length > 0;
  return (
    <div className={`vs-trace-row vs-trace-${result.status}`}>
      <button
        className="vs-trace-main"
        onClick={() => hasDetail && setOpen((o) => !o)}
        type="button"
      >
        <span className="vs-trace-status">{STATUS_ICONS[result.status] || "·"}</span>
        <span className="vs-trace-icon" style={{ color: meta?.color }}>
          {meta?.icon || "?"}
        </span>
        <span className="vs-trace-id">{nodeId}</span>
        <span className="vs-trace-ms">
          {result.status === "executed" ? `${result.elapsed_ms}ms` : result.status.toUpperCase()}
        </span>
        {hasDetail && <span className="vs-trace-caret">{open ? "▾" : "▸"}</span>}
      </button>
      {open && (
        <div className="vs-trace-detail">
          {result.logs.map((l, i) => (
            <div key={i} className="vs-trace-log">› {l}</div>
          ))}
          {Object.entries(result.outputs || {}).map(([k, v]) => (
            <div key={k} className="vs-trace-output">
              <span className="vs-trace-output-key">{k} →</span> {v}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Modal = ({ result, nodeTypeById, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isError = !!result.error && result.status !== "invalid";
  const isCycle = result.status === "invalid";
  const finals = result.final_outputs || [];
  const order = result.execution_order || [];

  return createPortal(
    <div
      className="vs-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="vs-modal vs-run-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vs-modal-title"
      >
        <div className="vs-modal-header">
          <span id="vs-modal-title" className="vs-modal-title">
            {isError ? "✕ ERROR" : isCycle ? "▲ NOT A DAG" : "✓ PIPELINE OK"}
          </span>
          <button className="vs-modal-x" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <div className="vs-modal-body">
          {isError ? (
            <p className="vs-modal-message vs-modal-error">{result.error}</p>
          ) : (
            <>
              <div className="vs-stat">
                <span className="vs-stat-icon">[◆]</span>
                <div className="vs-stat-text">
                  <span className="vs-stat-value">{result.num_nodes}</span>
                  <span className="vs-stat-label">NODES</span>
                </div>
              </div>
              <div className="vs-stat">
                <span className="vs-stat-icon">[~]</span>
                <div className="vs-stat-text">
                  <span className="vs-stat-value">{result.num_edges}</span>
                  <span className="vs-stat-label">EDGES</span>
                </div>
              </div>
              <div className="vs-stat">
                <span className="vs-stat-icon">{result.is_dag ? "[✓]" : "[!]"}</span>
                <div className="vs-stat-text">
                  <span className="vs-stat-value">DAG</span>
                  <span className="vs-stat-label">STRUCTURE CHECK</span>
                </div>
                <span
                  className={`vs-badge ${result.is_dag ? "vs-badge-yes" : "vs-badge-no"}`}
                >
                  {result.is_dag ? "YES" : "NO"}
                </span>
              </div>

              {isCycle && (
                <p className="vs-modal-message vs-modal-error">
                  {result.error} Cycle through:{" "}
                  {(result.cycle_node_ids || []).join(", ")}
                </p>
              )}

              {finals.length > 0 && (
                <div className="vs-run-section">
                  <div className="vs-run-section-title">▸ OUTPUTS</div>
                  {finals.map((f) => (
                    <div key={f.node_id} className="vs-run-output">
                      <div className="vs-run-output-name">{f.name}</div>
                      <div className="vs-run-output-value">
                        {f.value != null && f.value !== ""
                          ? String(f.value)
                          : "— no value reached this output —"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {order.length > 0 && (
                <div className="vs-run-section">
                  <div className="vs-run-section-title">
                    ▸ EXECUTION TRACE ({order.length} nodes)
                  </div>
                  <div className="vs-trace">
                    {order.map((nid) => (
                      <TraceRow
                        key={nid}
                        nodeId={nid}
                        result={result.node_results?.[nid] || { status: "skipped", logs: [] }}
                        nodeType={nodeTypeById[nid]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="vs-modal-footer">
          <button className="vs-modal-close" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

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
  const [result, setResult] = useState(null);

  const nodeTypeById = {};
  for (const n of nodes) nodeTypeById[n.id] = n.type;

  const onSubmit = useCallback(async () => {
    setLoading(true);
    clearRunStatuses();
    try {
      const res = await fetch(EXECUTE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
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
          "Could not reach the backend. Make sure FastAPI is running on http://localhost:8000.",
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
          type="button"
        >
          {loading ? (
            <>
              <span className="vs-spinner" />
              RUNNING…
            </>
          ) : (
            <>► RUN PIPELINE</>
          )}
        </button>
      </div>
      {result && (
        <Modal
          result={result}
          nodeTypeById={nodeTypeById}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
};
