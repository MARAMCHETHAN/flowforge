import { useMemo } from "react";
import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

const VAR_REGEX = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;

const extractVars = (text) => {
  const seen = new Set();
  const out = [];
  let m;
  while ((m = VAR_REGEX.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
};

const TemplateVarHint = ({ data }) => {
  const template = data?.template ?? "";
  const vars = useMemo(() => extractVars(template), [template]);
  if (vars.length === 0) return null;
  return (
    <div className="vs-var-chips">
      <span className="vs-var-chips-label">VARS</span>
      {vars.map((v) => (
        <span key={v} className="vs-var-chip">{`{{${v}}}`}</span>
      ))}
    </div>
  );
};

export const PromptTemplateNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.promptTemplate.label,
      icon: NODE_META.promptTemplate.icon,
      color: NODE_META.promptTemplate.color,
      inputs: [{ id: `${id}-context`, label: "Context", position: "left" }],
      outputs: [{ id: `${id}-prompt`, label: "Prompt", position: "right" }],
      fields: [
        {
          type: "select",
          key: "model",
          label: "Model",
          options: ["GPT-4o", "Claude Sonnet 4.6", "Gemini 2.5 Flash"],
          default: "GPT-4o",
        },
        {
          type: "textarea",
          key: "template",
          label: "Template",
          default: "Summarize: {{context}}",
        },
      ],
    }}
  >
    <TemplateVarHint data={data} />
  </BaseNode>
);
