import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NODE_META } from "./nodes/nodeMeta";

// Plain-English narration of a run — one sentence per node, for people
// who have never seen a pipeline before.
export const buildStory = (data, nodesById) => {
  if (data.status !== "success") return [];
  const story = [];
  for (const nid of data.execution_order || []) {
    const r = data.node_results?.[nid];
    const node = nodesById[nid];
    if (!r || !node) continue;
    const d = node.data || {};
    const logs = (r.logs || []).join(" ");
    if (r.status === "skipped") {
      if (node.type === "note") continue;
      story.push(`${nid} was skipped — no data reached it (it sits on the path not taken).`);
      continue;
    }
    if (r.status === "error") {
      story.push(`${nid} hit an error — open its row in the trace below.`);
      continue;
    }
    switch (node.type) {
      case "customInput":
        story.push(`The INPUT node “${d.inputName || nid}” handed your text to the pipeline.`);
        break;
      case "fileUpload":
        story.push(`The FILE node loaded “${d.file?.name || "your file"}”.`);
        break;
      case "text":
        story.push(`The TEXT node filled in its {{variables}} and passed the result on.`);
        break;
      case "promptTemplate":
        story.push(`The PROMPT node built the instructions for the AI.`);
        break;
      case "llm": {
        const sim = logs.includes("simulation");
        story.push(
          `The LLM node sent the prompt to ${d.model || "the AI"}` +
            (sim
              ? " — simulated response (add an API key for a real one)."
              : " and got a live response.")
        );
        break;
      }
      case "vectorSearch":
        story.push(`The VECTOR node searched the knowledge base and kept the best matches.`);
        break;
      case "router": {
        const branch = logs.includes("TRUE branch") ? "TRUE" : "FALSE";
        story.push(`The ROUTER tested its condition and sent the data down the ${branch} path.`);
        break;
      }
      case "customOutput":
        story.push(`The OUTPUT node “${d.outputName || nid}” displayed the final answer.`);
        break;
      default:
        break;
    }
  }
  return story;
};

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

export const RunResultsModal = ({ result, story, nodeTypeById, onClose }) => {
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

              {story.length > 0 && (
                <div className="vs-run-section">
                  <div className="vs-run-section-title">▸ WHAT HAPPENED (PLAIN ENGLISH)</div>
                  <ol className="vs-story">
                    {story.map((line, i) => (
                      <li key={i} className="vs-story-line">{line}</li>
                    ))}
                  </ol>
                </div>
              )}

              {result.status === "success" && finals.length === 0 && (
                <div className="vs-run-section">
                  <div className="vs-run-section-title">▸ OUTPUTS</div>
                  <p className="vs-run-hint">
                    Nothing arrived at an OUTPUT node. Add a ◆ OUTPUT node and
                    connect your last node to it — that's where results appear.
                  </p>
                </div>
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
