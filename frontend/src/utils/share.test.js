import { decodePipeline, encodePipeline } from "./share";

const nodes = [
  {
    id: "customInput-1",
    type: "customInput",
    position: { x: 100, y: 200 },
    data: { id: "customInput-1", nodeType: "customInput", value: "héllo ✓ {{x}}", lastValue: "should be stripped" },
    selected: true,
  },
];
const edges = [
  {
    id: "e1",
    source: "customInput-1",
    target: "llm-1",
    sourceHandle: "customInput-1-value",
    targetHandle: "llm-1-prompt",
    type: "smoothstep",
    animated: true,
    selected: true,
  },
];

describe("pipeline share codec", () => {
  test("round-trips nodes and edges", async () => {
    const decoded = await decodePipeline(await encodePipeline(nodes, edges));
    expect(decoded.nodes[0].id).toBe("customInput-1");
    expect(decoded.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(decoded.nodes[0].data.value).toBe("héllo ✓ {{x}}"); // unicode-safe
    expect(decoded.edges[0].targetHandle).toBe("llm-1-prompt");
  });

  test("strips runtime-only fields (lastValue, selected)", async () => {
    const decoded = await decodePipeline(await encodePipeline(nodes, edges));
    expect(decoded.nodes[0].data.lastValue).toBeUndefined();
    expect(decoded.nodes[0].selected).toBeUndefined();
    expect(decoded.edges[0].selected).toBeUndefined();
  });

  test("produces URL-safe output", async () => {
    const encoded = await encodePipeline(nodes, edges);
    expect(encoded).toMatch(/^[01][A-Za-z0-9_-]+$/);
  });

  test("rejects garbage", async () => {
    await expect(decodePipeline("0notbase64!!!")).rejects.toThrow();
    const notPipeline = "0" + btoa(JSON.stringify({ foo: 1 })).replace(/=+$/, "");
    await expect(decodePipeline(notPipeline)).rejects.toThrow("Not a pipeline");
  });
});
