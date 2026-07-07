import { useState } from "react";
import { Handle, Position } from "reactflow";
import { useStore } from "../store";
import { NodeInfoModal } from "./NodeInfoModal";

const positionMap = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

const distribute = (index, total) => `${((index + 1) / (total + 1)) * 100}%`;

const HandleWithLabel = ({ handle, kind, fallbackIndex, total }) => {
  const pos = handle.position || (kind === "target" ? "left" : "right");
  const top = handle.style?.top || distribute(fallbackIndex, total);
  const isLeft = pos === "left";
  const showLabel = !!handle.label;
  return (
    <div
      className="vs-handle-wrapper"
      style={{ top, [isLeft ? "left" : "right"]: 0 }}
    >
      <Handle
        type={kind}
        position={positionMap[pos]}
        id={handle.id}
        className="vs-handle"
        style={{ top: "50%" }}
        title={handle.label}
      />
      {showLabel && (
        <span
          className={`vs-handle-label ${isLeft ? "vs-handle-label-left" : "vs-handle-label-right"}`}
        >
          {handle.label}
        </span>
      )}
    </div>
  );
};

const Field = ({ field, value, onChange }) => {
  if (field.type === "static") {
    return <div className="vs-static">{field.content}</div>;
  }
  if (field.type === "text") {
    return (
      <label className="vs-field">
        <span className="vs-field-label">{field.label}</span>
        <input
          className="vs-input nodrag"
          type="text"
          value={value ?? field.default ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="vs-field">
        <span className="vs-field-label">{field.label}</span>
        <select
          className="vs-select nodrag"
          value={value ?? field.default ?? field.options[0]}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="vs-field">
        {field.label && <span className="vs-field-label">{field.label}</span>}
        <textarea
          className="vs-textarea nodrag"
          rows={3}
          value={value ?? field.default ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </label>
    );
  }
  if (field.type === "number") {
    return (
      <label className="vs-field">
        <span className="vs-field-label">{field.label}</span>
        <input
          className="vs-input nodrag"
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value ?? field.default ?? ""}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </label>
    );
  }
  if (field.type === "slider") {
    const current = value ?? field.default ?? field.min ?? 0;
    return (
      <div className="vs-field">
        <div className="vs-slider-header">
          <span className="vs-field-label">{field.label}</span>
          <span className="vs-slider-value">{current}</span>
        </div>
        <input
          className="vs-slider nodrag"
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={current}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </div>
    );
  }
  if (field.type === "swatch") {
    const current = value ?? field.default ?? field.options[0]?.name;
    return (
      <div className="vs-field">
        <span className="vs-field-label">{field.label}</span>
        <div className="vs-swatches nodrag">
          {field.options.map((opt) => (
            <button
              key={opt.name}
              type="button"
              className={`vs-swatch ${current === opt.name ? "vs-swatch-active" : ""}`}
              style={{ background: opt.color }}
              onClick={() => onChange(field.key, opt.name)}
              aria-label={opt.name}
              title={opt.name}
            />
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "file") {
    const file = value;
    return (
      <div className="vs-field">
        <span className="vs-field-label">{field.label || "File"}</span>
        <label className="vs-file-btn nodrag">
          <input
            type="file"
            className="vs-file-input"
            accept={field.accept}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const meta = { name: f.name, size: f.size, type: f.type };
              const isText =
                /\.(txt|md|csv|json|log)$/i.test(f.name) ||
                (f.type || "").startsWith("text/") ||
                f.type === "application/json";
              if (isText) {
                const reader = new FileReader();
                reader.onload = () =>
                  onChange(field.key, {
                    ...meta,
                    // cap so autosave/localStorage stays healthy
                    content: String(reader.result || "").slice(0, 200000),
                  });
                reader.readAsText(f);
              } else {
                onChange(field.key, meta);
              }
            }}
          />
          {file ? "REPLACE FILE" : "CHOOSE FILE"}
        </label>
        {file && (
          <div className="vs-file-pill">
            <span className="vs-file-name">{file.name}</span>
            <span className="vs-file-size">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const RUN_BADGES = {
  running: "⟳",
  executed: "✓",
  skipped: "⤫",
  error: "!",
};

export const BaseNode = ({ id, data, config, children, className = "", style = {} }) => {
  const updateNodeField = useStore((s) => s.updateNodeField);
  const removeNode = useStore((s) => s.removeNode);
  const runStatus = useStore((s) => s.runStatuses[id]);
  const [infoOpen, setInfoOpen] = useState(false);
  const inputs = config.inputs || [];
  const outputs = config.outputs || [];
  const fields = config.fields || [];

  const setField = (key, value) => updateNodeField(id, key, value);
  const nodeType = data?.nodeType;

  return (
    <div
      className={`vs-node ${className} ${runStatus ? `vs-run-${runStatus}` : ""}`}
      style={{ "--node-color": config.color, ...style }}
    >
      {runStatus && (
        <span className={`vs-run-badge vs-run-badge-${runStatus}`}>
          {RUN_BADGES[runStatus]}
        </span>
      )}
      <div className="vs-node-header">
        <span className="vs-node-icon">{config.icon}</span>
        <span className="vs-node-title">{config.title}</span>
        <button
          className="vs-node-info nodrag"
          onClick={() => setInfoOpen(true)}
          aria-label="Node info"
          title="What does this node do?"
        >
          ⓘ
        </button>
        <button
          className="vs-node-delete nodrag"
          onClick={() => removeNode(id)}
          aria-label="Delete node"
          title="Delete node"
        >
          ×
        </button>
      </div>

      {infoOpen && nodeType && (
        <NodeInfoModal nodeType={nodeType} onClose={() => setInfoOpen(false)} />
      )}

      <div className="vs-node-body">
        {fields.map((field, i) => (
          <Field
            key={field.key || `static-${i}`}
            field={field}
            value={field.key ? data?.[field.key] : undefined}
            onChange={setField}
          />
        ))}
        {children}
      </div>

      {inputs.map((h, i) => (
        <HandleWithLabel
          key={h.id}
          handle={h}
          kind="target"
          fallbackIndex={i}
          total={inputs.length}
        />
      ))}
      {outputs.map((h, i) => (
        <HandleWithLabel
          key={h.id}
          handle={h}
          kind="source"
          fallbackIndex={i}
          total={outputs.length}
        />
      ))}
    </div>
  );
};
