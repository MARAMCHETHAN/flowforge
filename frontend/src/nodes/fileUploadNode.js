import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

export const FileUploadNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.fileUpload.label,
      icon: NODE_META.fileUpload.icon,
      color: NODE_META.fileUpload.color,
      outputs: [{ id: `${id}-file`, label: "File", position: "right" }],
      fields: [
        {
          type: "file",
          key: "file",
          label: "File",
          accept: ".pdf,.txt,.md,.csv,.json,.docx",
        },
      ],
    }}
  />
);
