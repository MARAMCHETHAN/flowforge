import { buildStory } from "./runResults";

const nodesById = {
  "customInput-1": { id: "customInput-1", type: "customInput", data: { inputName: "doc" } },
  "llm-1": { id: "llm-1", type: "llm", data: { model: "Gemini 2.5 Flash" } },
  "customOutput-1": { id: "customOutput-1", type: "customOutput", data: { outputName: "answer" } },
  "customOutput-2": { id: "customOutput-2", type: "customOutput", data: { outputName: "other" } },
};

const run = (overrides = {}) => ({
  status: "success",
  execution_order: ["customInput-1", "llm-1", "customOutput-1"],
  node_results: {
    "customInput-1": { status: "executed", logs: [] },
    "llm-1": { status: "executed", logs: ["using simulation"] },
    "customOutput-1": { status: "executed", logs: [] },
  },
  ...overrides,
});

describe("buildStory", () => {
  test("narrates one sentence per executed node, in execution order", () => {
    const story = buildStory(run(), nodesById);
    expect(story).toHaveLength(3);
    expect(story[0]).toContain("INPUT node “doc”");
    expect(story[1]).toContain("Gemini 2.5 Flash");
    expect(story[2]).toContain("OUTPUT node “answer”");
  });

  test("says when the LLM answer was simulated", () => {
    expect(buildStory(run(), nodesById)[1]).toContain("simulated");
  });

  test("explains skipped nodes on the untaken branch", () => {
    const data = run({
      execution_order: ["customInput-1", "customOutput-2"],
      node_results: {
        "customInput-1": { status: "executed", logs: [] },
        "customOutput-2": { status: "skipped", logs: [] },
      },
    });
    const story = buildStory(data, nodesById);
    expect(story[1]).toContain("skipped");
  });

  test("returns nothing for failed runs", () => {
    expect(buildStory({ status: "invalid" }, nodesById)).toEqual([]);
  });
});
