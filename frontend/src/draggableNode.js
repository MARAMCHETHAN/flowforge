export const DraggableNode = ({ type, label, color, icon }) => {
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
      draggable
    >
      <span className="vs-chip-icon">{icon}</span>
      <span className="vs-chip-label">{label}</span>
    </div>
  );
};
