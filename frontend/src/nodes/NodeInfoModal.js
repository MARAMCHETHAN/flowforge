import { useEffect } from "react";
import { createPortal } from "react-dom";
import { NODE_META } from "./nodeMeta";

export const NodeInfoModal = ({ nodeType, onClose }) => {
  const meta = NODE_META[nodeType];

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!meta?.info) return null;

  const { description, inputs, outputs, useCase } = meta.info;

  return createPortal(
    <div
      className="vs-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="vs-modal vs-info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vs-info-title"
      >
        <div
          className="vs-modal-header"
          style={{ background: meta.color, color: "#fff" }}
        >
          <span id="vs-info-title" className="vs-modal-title">
            <span className="vs-info-icon">{meta.icon}</span>
            {meta.label} NODE
          </span>
          <button
            className="vs-modal-x"
            onClick={onClose}
            aria-label="Close info dialog"
          >
            ×
          </button>
        </div>

        <div className="vs-modal-body vs-info-body">
          <p className="vs-info-desc">{description}</p>

          {inputs.length > 0 && (
            <div className="vs-info-section">
              <div className="vs-info-section-title">▸ INPUTS</div>
              <ul className="vs-info-list">
                {inputs.map((it) => (
                  <li key={it.label}>
                    <span className="vs-info-handle">{it.label}</span>
                    <span className="vs-info-handle-desc">{it.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outputs.length > 0 && (
            <div className="vs-info-section">
              <div className="vs-info-section-title">▸ OUTPUTS</div>
              <ul className="vs-info-list">
                {outputs.map((it) => (
                  <li key={it.label}>
                    <span className="vs-info-handle">{it.label}</span>
                    <span className="vs-info-handle-desc">{it.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(inputs.length === 0 && outputs.length === 0) && (
            <div className="vs-info-section">
              <div className="vs-info-section-title">▸ CONNECTIONS</div>
              <p className="vs-info-empty">This node has no inputs or outputs.</p>
            </div>
          )}

          <div className="vs-info-section">
            <div className="vs-info-section-title">▸ EXAMPLE</div>
            <p className="vs-info-use">{useCase}</p>
          </div>
        </div>

        <div className="vs-modal-footer">
          <button className="vs-modal-close" onClick={onClose}>
            GOT IT
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
