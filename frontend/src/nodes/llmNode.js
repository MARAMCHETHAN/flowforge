import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

export const LLMNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.llm.label,
      icon: NODE_META.llm.icon,
      color: NODE_META.llm.color,
      inputs: [
        { id: `${id}-system`, label: "System", position: "left", style: { top: "33%" } },
        { id: `${id}-prompt`, label: "Prompt", position: "left", style: { top: "66%" } },
      ],
      outputs: [{ id: `${id}-response`, label: "Response", position: "right" }],
      fields: [
        {
          type: "select",
          key: "model",
          label: "Model",
          options: ["GPT-4o", "GPT-4o mini", "Claude Sonnet 4.6", "Claude Haiku 4.5", "Gemini 2.5 Pro", "Gemini 2.5 Flash"],
          default: "GPT-4o",
        },
        {
          type: "slider",
          key: "temperature",
          label: "Temperature",
          min: 0,
          max: 2,
          step: 0.1,
          default: 0.7,
        },
        {
          type: "number",
          key: "maxTokens",
          label: "Max Tokens",
          min: 1,
          max: 32768,
          step: 1,
          default: 1024,
        },
      ],
    }}
  />
);
