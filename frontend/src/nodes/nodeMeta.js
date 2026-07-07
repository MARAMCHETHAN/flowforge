// Per-node metadata + non-technical info copy used by the ⓘ button.
//
// info structure:
//   description — single-paragraph "what this node does" for a layperson
//   inputs[]    — each input handle, with a non-technical description
//   outputs[]   — each output handle, with a non-technical description
//   useCase     — concrete example sentence ("Use this when ...")

export const NODE_META = {
  customInput: {
    label: "INPUT",   color: "#22d3ee", icon: "▶",
    info: {
      description:
        "Starting point of your pipeline. Collects a value from the user — text they type, a number, a yes/no toggle, or a file they upload.",
      inputs: [],
      outputs: [
        { label: "Value", desc: "The value the user provides, ready to be sent to any downstream node." },
      ],
      useCase: "Use it as the entry door — e.g. ask the user to paste a document, then route it to an LLM.",
    },
  },

  customOutput: {
    label: "OUTPUT",  color: "#f87171", icon: "◆",
    info: {
      description:
        "The final stop of your pipeline. Captures the result and shows it back to the user. Pick the format (plain text, markdown, JSON) and the type (text, image, audio, video) so the result is rendered the right way.",
      inputs: [
        { label: "Value", desc: "The final value to display. Connect it from the last node in your flow." },
      ],
      outputs: [],
      useCase: "Use it at the end — e.g. show the LLM's answer to the user as Markdown.",
    },
  },

  llm: {
    label: "LLM",     color: "#d946ef", icon: "✦",
    info: {
      description:
        "Sends a prompt to a large language model (GPT-4o, Claude, Gemini) and gives you back its response. Pick the model, control creativity with Temperature, cap the response length with Max Tokens.",
      inputs: [
        { label: "System", desc: "Sets the AI's role or personality. E.g. \"You are a helpful summariser.\"" },
        { label: "Prompt", desc: "The actual question or instruction you want the model to answer." },
      ],
      outputs: [
        { label: "Response", desc: "The model's answer as plain text, ready to send onward." },
      ],
      useCase: "Use it for any task an AI can do — summarise, classify, translate, draft, answer.",
    },
  },

  text: {
    label: "TEXT",    color: "#facc15", icon: "A",
    info: {
      description:
        "A reusable text block. Type any string, and use {{variable}} placeholders to plug in values from other nodes. Each {{variable}} becomes a new input on the left side automatically.",
      inputs: [
        { label: "Variable handles", desc: "One input per {{variable}} in the text. They appear as you type." },
      ],
      outputs: [
        { label: "Output", desc: "The final filled-in text with all variables substituted." },
      ],
      useCase: "Use it to build prompts from pieces — e.g. \"Summarise this document: {{doc}} in {{language}}.\"",
    },
  },

  fileUpload: {
    label: "FILE",    color: "#38bdf8", icon: "▤",
    info: {
      description:
        "Lets the user attach a file (PDF, TXT, MD, CSV, JSON, DOCX). The file is then available to downstream nodes that can read it.",
      inputs: [],
      outputs: [
        { label: "File", desc: "The uploaded file's contents, ready for any node that processes documents." },
      ],
      useCase: "Use it as the first step of a RAG pipeline — upload a knowledge document the AI can search.",
    },
  },

  promptTemplate: {
    label: "PROMPT",  color: "#c084fc", icon: "✎",
    info: {
      description:
        "A reusable prompt template tied to a specific model. Drop {{variables}} into the template and the node detects them automatically. Plug in context from upstream, get a finished prompt out.",
      inputs: [
        { label: "Context", desc: "Dynamic content to inject into the template, e.g. retrieved documents or user input." },
      ],
      outputs: [
        { label: "Prompt", desc: "The finished prompt with the context filled in, ready to send to an LLM." },
      ],
      useCase: "Use it to keep prompts tidy and reusable across pipelines — e.g. a single summariser prompt that takes any document.",
    },
  },

  vectorSearch: {
    label: "VECTOR",  color: "#4ade80", icon: "◎",
    info: {
      description:
        "Finds the most relevant chunks in a knowledge base, given a query. Powers the \"R\" in RAG (Retrieval-Augmented Generation). Pick the embedding model, control how many results (Top K) and how strict the match (Similarity).",
      inputs: [
        { label: "Query", desc: "What you're searching for — a question or phrase." },
        { label: "Knowledge Base", desc: "The collection of documents to search through, typically from a File Upload." },
      ],
      outputs: [
        { label: "Results", desc: "The top-K most similar passages, ranked by relevance." },
      ],
      useCase: "Use it when an LLM needs to ground its answers in your own documents.",
    },
  },

  router: {
    label: "ROUTER",  color: "#fb923c", icon: "⇄",
    info: {
      description:
        "Branches the pipeline based on a condition. Write something like value > 10 or value == \"yes\" and the True/False outputs decide where the flow goes next.",
      inputs: [
        { label: "Input", desc: "The value to test against the condition." },
      ],
      outputs: [
        { label: "True", desc: "Fires when the condition holds — connect the success path here." },
        { label: "False", desc: "Fires when the condition fails — connect the fallback path here." },
      ],
      useCase: "Use it to send results down different paths — e.g. spam vs ham, paid plan vs free plan.",
    },
  },

  note: {
    label: "NOTE",    color: "#a3a3a3", icon: "♪",
    info: {
      description:
        "A pixel sticky note. No inputs, no outputs — purely for leaving comments or labelling sections of a pipeline so teammates understand what it does. Pick a colour to colour-code your notes.",
      inputs: [],
      outputs: [],
      useCase: "Use it to document anything tricky — e.g. \"TODO: tune the temperature once we have eval results.\"",
    },
  },
};

export const TOOLBAR_ORDER = [
  "customInput",
  "customOutput",
  "text",
  "llm",
  "fileUpload",
  "promptTemplate",
  "vectorSearch",
  "router",
  "note",
];
