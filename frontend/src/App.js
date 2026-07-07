import { useEffect } from "react";
import { PipelineToolbar } from "./toolbar";
import { PipelineUI } from "./ui";
import { SubmitButton } from "./submit";
import { LearnPanel } from "./learnMode";
import { useStore } from "./store";
import { decodePipeline } from "./utils/share";

// Visiting a share link (#p=...) loads that pipeline onto the canvas.
const useSharedPipeline = () => {
  useEffect(() => {
    const match = window.location.hash.match(/^#p=(.+)$/);
    if (!match) return;
    const clearHash = () =>
      window.history.replaceState(null, "", window.location.pathname);
    decodePipeline(match[1])
      .then((data) => {
        const { nodes, importPipeline } = useStore.getState();
        if (
          nodes.length > 0 &&
          !window.confirm(
            "Someone shared a pipeline with you. Load it? (This replaces what's on your canvas — your work is auto-saved in this browser only.)"
          )
        ) {
          clearHash();
          return;
        }
        importPipeline(data);
        clearHash();
      })
      .catch(() => {
        window.alert("This share link looks invalid or corrupted.");
        clearHash();
      });
  }, []);
};

function App() {
  useSharedPipeline();
  return (
    <div className="vs-app">
      <PipelineToolbar />
      <PipelineUI />
      <SubmitButton />
      <LearnPanel />
      <div className="vs-mobile-note">
        📱 FlowForge needs drag-and-drop — open this page on a computer for
        the full experience.
      </div>
    </div>
  );
}

export default App;
