import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

export const InputNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.customInput.label,
      icon: NODE_META.customInput.icon,
      color: NODE_META.customInput.color,
      outputs: [{ id: `${id}-value`, label: "Value", position: "right" }],
      fields: [
        {
          type: "text",
          key: "inputName",
          label: "Name",
          default: id.replace("customInput-", "input_"),
        },
        {
          type: "select",
          key: "inputType",
          label: "Type",
          options: ["Text", "Number", "Boolean", "File"],
          default: "Text",
        },
        {
          type: "textarea",
          key: "value",
          label: "Default Value",
          default: "",
        },
      ],
    }}
  />
);
