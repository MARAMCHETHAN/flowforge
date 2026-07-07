// Pre-built pipeline templates. Each template is a function that takes
// a `getNodeID` function and returns { nodes, edges } ready to inject.
//
// Positions are absolute; auto-layout can re-arrange after insertion.
//
// Edge IDs follow the format "e-<source>-<target>" so they're unique
// within the inserted bundle.

const GAP_X = 320;
const ROW_Y = 200;

const makeEdge = (source, target, sourceHandle, targetHandle) => ({
  id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: "smoothstep",
  animated: true,
});

const node = (id, type, col, row, data = {}) => ({
  id,
  type,
  position: { x: 80 + col * GAP_X, y: ROW_Y + row * 200 },
  data: { id, nodeType: type, ...data },
});

// ── RAG Pipeline ────────────────────────────────────────────
// FileUpload ─┐
//             ├─→ VectorSearch ─→ PromptTemplate ─→ LLM ─→ Output
// Input ──────┘
export const ragTemplate = (getNodeID) => {
  const file   = getNodeID("fileUpload");
  const input  = getNodeID("customInput");
  const vec    = getNodeID("vectorSearch");
  const prompt = getNodeID("promptTemplate");
  const llm    = getNodeID("llm");
  const out    = getNodeID("customOutput");

  return {
    nodes: [
      node(file,   "fileUpload",     0, 0),
      node(input,  "customInput",    0, 1, { inputName: "user_query", inputType: "Text" }),
      node(vec,    "vectorSearch",   1, 0, { topK: "5", threshold: "0.75", embedModel: "text-embedding-3-large" }),
      node(prompt, "promptTemplate", 2, 0, { model: "GPT-4o", template: "Use this context to answer: {{context}}" }),
      node(llm,    "llm",            3, 0, { model: "GPT-4o", temperature: "0.3", maxTokens: "1024" }),
      node(out,    "customOutput",   4, 0, { outputName: "answer", outputType: "Text", format: "Markdown" }),
    ],
    edges: [
      makeEdge(input,  vec,    `${input}-value`,  `${vec}-query`),
      makeEdge(file,   vec,    `${file}-file`,    `${vec}-kb`),
      makeEdge(vec,    prompt, `${vec}-results`,  `${prompt}-context`),
      makeEdge(prompt, llm,    `${prompt}-prompt`, `${llm}-prompt`),
      makeEdge(llm,    out,    `${llm}-response`,  `${out}-value`),
    ],
  };
};

// ── Summarization ──────────────────────────────────────────
// Input ─→ LLM ─→ Output
export const summarizeTemplate = (getNodeID) => {
  const input = getNodeID("customInput");
  const llm   = getNodeID("llm");
  const out   = getNodeID("customOutput");

  return {
    nodes: [
      node(input, "customInput",  0, 0, { inputName: "document", inputType: "Text", value: "Paste a long document here..." }),
      node(llm,   "llm",          1, 0, { model: "Claude Sonnet 4.6", temperature: "0.2", maxTokens: "512" }),
      node(out,   "customOutput", 2, 0, { outputName: "summary", outputType: "Text", format: "Markdown" }),
    ],
    edges: [
      makeEdge(input, llm, `${input}-value`, `${llm}-prompt`),
      makeEdge(llm,   out, `${llm}-response`, `${out}-value`),
    ],
  };
};

// ── Classifier ─────────────────────────────────────────────
// Input ─→ LLM ─→ Router ─→ Output (TRUE branch)
//                       └─→ Output (FALSE branch)
export const classifierTemplate = (getNodeID) => {
  const input = getNodeID("customInput");
  const llm   = getNodeID("llm");
  const router = getNodeID("router");
  const outT  = getNodeID("customOutput");
  const outF  = getNodeID("customOutput");

  return {
    nodes: [
      node(input,  "customInput",  0, 0, { inputName: "text", inputType: "Text" }),
      node(llm,    "llm",          1, 0, { model: "GPT-4o mini", temperature: "0", maxTokens: "32" }),
      node(router, "router",       2, 0, { condition: 'value == "spam"', testValue: "spam" }),
      node(outT,   "customOutput", 3, 0, { outputName: "spam_bucket", outputType: "Text" }),
      node(outF,   "customOutput", 3, 1, { outputName: "ham_bucket",  outputType: "Text" }),
    ],
    edges: [
      makeEdge(input,  llm,    `${input}-value`,   `${llm}-prompt`),
      makeEdge(llm,    router, `${llm}-response`,  `${router}-input`),
      makeEdge(router, outT,   `${router}-true`,   `${outT}-value`),
      makeEdge(router, outF,   `${router}-false`,  `${outF}-value`),
    ],
  };
};

export const TEMPLATES = [
  { key: "rag",        label: "RAG Pipeline",      icon: "🤖", build: ragTemplate },
  { key: "summarize",  label: "Summarization",     icon: "📝", build: summarizeTemplate },
  { key: "classifier", label: "Classifier",        icon: "🔀", build: classifierTemplate },
];
