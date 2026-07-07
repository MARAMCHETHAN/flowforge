import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

export const VectorSearchNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.vectorSearch.label,
      icon: NODE_META.vectorSearch.icon,
      color: NODE_META.vectorSearch.color,
      inputs: [
        { id: `${id}-query`, label: "Query", position: "left" },
        { id: `${id}-kb`, label: "Knowledge Base", position: "left" },
      ],
      outputs: [{ id: `${id}-results`, label: "Results", position: "right" }],
      fields: [
        {
          type: "select",
          key: "embedModel",
          label: "Embedding Model",
          options: ["text-embedding-3-large", "text-embedding-3-small", "bge-large-en", "all-MiniLM-L6"],
          default: "text-embedding-3-large",
        },
        {
          type: "slider",
          key: "topK",
          label: "Top K Results",
          min: 1,
          max: 50,
          step: 1,
          default: 5,
        },
        {
          type: "slider",
          key: "threshold",
          label: "Similarity",
          min: 0,
          max: 1,
          step: 0.05,
          default: 0.75,
        },
      ],
    }}
  />
);
