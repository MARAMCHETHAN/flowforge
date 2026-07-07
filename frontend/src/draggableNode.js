import { useStore } from "./store";

export const DraggableNode = ({ type, label, color, icon }) => {
  const requestAddNode = useStore((s) => s.requestAddNode);
  const onDragStart = (event, nodeType) => {
    event.target.style.cursor = "grabbing";
    event.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ nodeType })
    );
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className="vs-chip"
      style={{ "--chip-color": color }}
      onDragStart={(event) => onDragStart(event, type)}
      onDragEnd={(event) => (event.target.style.cursor = "grab")}
      onClick={() => requestAddNode(type)}
      title="Click to add — or drag onto the canvas"
      draggable
    >
      <span className="vs-chip-icon">{icon}</span>
      <span className="vs-chip-label">{label}</span>
    </div>
  );
};
