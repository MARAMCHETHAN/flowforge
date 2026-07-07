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
    </div>
  );
}

export default App;
