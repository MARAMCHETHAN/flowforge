import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

const PreviewSlot = ({ data }) => {
  const last = data?.lastValue;
  return (
    <div className="vs-output-preview">
      <div className="vs-output-preview-label">LAST VALUE</div>
      <div className="vs-output-preview-body">
        {last ? String(last) : "— awaiting upstream —"}
      </div>
    </div>
  );
};

export const OutputNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.customOutput.label,
      icon: NODE_META.customOutput.icon,
      color: NODE_META.customOutput.color,
      inputs: [{ id: `${id}-value`, label: "Value", position: "left" }],
      fields: [
        {
          type: "text",
          key: "outputName",
          label: "Name",
          default: id.replace("customOutput-", "output_"),
        },
        {
          type: "select",
          key: "outputType",
          label: "Type",
          options: ["Text", "Image", "Audio", "Video"],
          default: "Text",
        },
        {
          type: "select",
          key: "format",
          label: "Format",
          options: ["Plain", "Markdown", "JSON"],
          default: "Plain",
        },
      ],
    }}
  >
    <PreviewSlot data={data} />
  </BaseNode>
);
