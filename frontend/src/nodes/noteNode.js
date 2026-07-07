import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

const NOTE_COLORS = [
  { name: "yellow", color: "#facc15" },
  { name: "pink",   color: "#ec4899" },
  { name: "cyan",   color: "#22d3ee" },
  { name: "green",  color: "#4ade80" },
];

export const NoteNode = ({ id, data }) => {
  const variant = data?.color ?? "yellow";
  return (
    <BaseNode
      id={id}
      data={data}
      className={`vs-node-note vs-note-${variant}`}
      config={{
        title: NODE_META.note.label,
        icon: NODE_META.note.icon,
        color: NODE_META.note.color,
        fields: [
          {
            type: "swatch",
            key: "color",
            label: "Color",
            options: NOTE_COLORS,
            default: "yellow",
          },
          {
            type: "textarea",
            key: "content",
            label: "",
            default: "Add a note...",
          },
        ],
      }}
    />
  );
};
