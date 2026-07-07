import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../store";
import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

import { extractVariables } from "../utils/variables";

export const TextNode = ({ id, data }) => {
  const updateNodeField = useStore((s) => s.updateNodeField);
  const taRef = useRef(null);
  const text = data?.text ?? "{{input}}";

  const variables = useMemo(() => extractVariables(text), [text]);
  const width = Math.max(220, Math.min(500, text.length * 8));

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, width]);

  const meta = NODE_META.text;

  return (
    <BaseNode
      id={id}
      data={data}
      style={{ width }}
      config={{
        title: meta.label,
        icon: meta.icon,
        color: meta.color,
        inputs: variables.map((name) => ({
          id: `${id}-${name}`,
          label: name,
          position: "left",
        })),
        outputs: [{ id: `${id}-output`, label: "output", position: "right" }],
      }}
    >
      <label className="vs-field">
        <span className="vs-field-label">Text</span>
        <textarea
          ref={taRef}
          className="vs-textarea nodrag"
          value={text}
          onChange={(e) => updateNodeField(id, "text", e.target.value)}
          placeholder="Type {{variable}} to create input handles"
        />
      </label>
      {variables.length > 0 && (
        <div className="vs-text-vars">
          Variables: {variables.map((v) => `{{${v}}}`).join(", ")}
        </div>
      )}
    </BaseNode>
  );
};
