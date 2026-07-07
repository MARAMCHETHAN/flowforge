import { PipelineToolbar } from "./toolbar";
import { PipelineUI } from "./ui";
import { SubmitButton } from "./submit";
import { LearnPanel } from "./learnMode";

function App() {
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
