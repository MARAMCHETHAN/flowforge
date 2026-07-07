import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";

const LS_KEY = "flowforge-learn-v1";

const loadProgress = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
};

const saveProgress = (patch) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...loadProgress(), ...patch }));
  } catch {
    /* ignore */
  }
};

// Each step watches the real canvas state and completes itself.
// `hint` says exactly what to do; `why` teaches the concept behind it.
const STEPS = [
  {
    id: "add-input",
    title: "Add an INPUT node",
    hint: "Drag the ▶ INPUT chip from the top bar onto the canvas (or press ⌘K and type “input”).",
    why: "Every pipeline starts with data. An Input node is the door where your text enters.",
    check: ({ nodes }) => nodes.some((n) => n.type === "customInput"),
  },
  {
    id: "add-llm",
    title: "Add an LLM node",
    hint: "Drag the ✦ LLM chip onto the canvas, next to your Input.",
    why: "LLM stands for Large Language Model — the AI (like ChatGPT, Claude or Gemini) that reads text and writes a response.",
    check: ({ nodes }) => nodes.some((n) => n.type === "llm"),
  },
  {
    id: "connect-input-llm",
    title: "Connect INPUT → LLM",
    hint: "Drag from the dot on the Input's right edge to the “Prompt” dot on the LLM's left edge.",
    why: "Edges are pipes: whatever comes out of Input flows into the LLM as its prompt (its instructions).",
    check: ({ nodes, edges }) => {
      const typeOf = Object.fromEntries(nodes.map((n) => [n.id, n.type]));
      return edges.some(
        (e) => typeOf[e.source] === "customInput" && typeOf[e.target] === "llm"
      );
    },
  },
  {
    id: "add-output",
    title: "Add an OUTPUT node and connect LLM → OUTPUT",
    hint: "Drag the ◆ OUTPUT chip onto the canvas, then connect the LLM's “Response” dot to the Output's “Value” dot.",
    why: "The Output node is where results land — without it, the AI's answer has nowhere to go.",
    check: ({ nodes, edges }) => {
      const typeOf = Object.fromEntries(nodes.map((n) => [n.id, n.type]));
      return (
        nodes.some((n) => n.type === "customOutput") &&
        edges.some(
          (e) => typeOf[e.source] === "llm" && typeOf[e.target] === "customOutput"
        )
      );
    },
  },
  {
    id: "give-value",
    title: "Type something into the Input",
    hint: "Click inside the Input node's “Default Value” box and write anything — try “Summarize: robots are learning to cook.”",
    why: "This is the actual data your pipeline will process when it runs.",
    check: ({ nodes }) =>
      nodes.some(
        (n) => n.type === "customInput" && String(n.data?.value || "").trim()
      ),
  },
  {
    id: "run",
    title: "Press ► RUN PIPELINE",
    hint: "The big button at the bottom. Watch the nodes light up in order as each step executes.",
    why: "The server checks your graph has no loops, then runs each node in order, passing values along the edges.",
    check: ({ runStatuses }) =>
      Object.values(runStatuses).some((s) => s === "executed"),
  },
];

const selector = (s) => ({
  nodes: s.nodes,
  edges: s.edges,
  runStatuses: s.runStatuses,
  learnOpen: s.learnOpen,
  setLearnOpen: s.setLearnOpen,
});

export const LearnPanel = () => {
  const { nodes, edges, runStatuses, learnOpen, setLearnOpen } = useStore(
    useShallow(selector)
  );

  // First visit with an empty canvas → open automatically.
  useEffect(() => {
    const p = loadProgress();
    if (!p.dismissed && !p.completed && nodes.length === 0) setLearnOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = { nodes, edges, runStatuses };
  const done = useMemo(() => STEPS.map((s) => s.check(state)), [nodes, edges, runStatuses]); // eslint-disable-line react-hooks/exhaustive-deps
  const allDone = done.every(Boolean);
  const currentIdx = done.findIndex((d) => !d);

  useEffect(() => {
    if (allDone) saveProgress({ completed: true });
  }, [allDone]);

  if (!learnOpen) return null;

  const close = () => {
    saveProgress({ dismissed: true });
    setLearnOpen(false);
  };

  return (
    <aside className="vs-learn" aria-label="Guided tutorial">
      <div className="vs-learn-header">
        <span className="vs-learn-title">🎓 LEARN MODE</span>
        <span className="vs-learn-progress">
          {done.filter(Boolean).length}/{STEPS.length}
        </span>
        <button className="vs-learn-x" onClick={close} aria-label="Close tutorial">
          ×
        </button>
      </div>

      {allDone ? (
        <div className="vs-learn-body">
          <div className="vs-learn-done">🎉 YOU BUILT AN AI PIPELINE!</div>
          <p className="vs-learn-why">
            You just did what tools like n8n and Langflow do under the hood:
            data flowed from your Input, through an AI model, to an Output —
            in dependency order, with every step traced.
          </p>
          <p className="vs-learn-why">
            Keep exploring: press <b>⌘K</b> and insert the <b>RAG Pipeline</b>{" "}
            template, type <b>{"{{variables}}"}</b> inside a Text node, or click
            any node's <b>ⓘ</b> button to learn what it does.
          </p>
          <button className="vs-learn-restart" onClick={close}>
            FINISH
          </button>
        </div>
      ) : (
        <div className="vs-learn-body">
          {STEPS.map((step, i) => {
            const isDone = done[i];
            const isCurrent = i === currentIdx;
            return (
              <div
                key={step.id}
                className={`vs-learn-step ${isDone ? "vs-learn-step-done" : ""} ${
                  isCurrent ? "vs-learn-step-current" : ""
                }`}
              >
                <div className="vs-learn-step-title">
                  <span className="vs-learn-check">{isDone ? "✓" : isCurrent ? "▶" : "·"}</span>
                  {step.title}
                </div>
                {isCurrent && (
                  <>
                    <div className="vs-learn-hint">{step.hint}</div>
                    <div className="vs-learn-why">💡 {step.why}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};
