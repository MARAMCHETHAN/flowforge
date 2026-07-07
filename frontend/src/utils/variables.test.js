import { extractVariables } from "./variables";

describe("extractVariables", () => {
  test("finds variables in first-appearance order, deduplicated", () => {
    expect(extractVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  test("tolerates whitespace inside the braces", () => {
    expect(extractVariables("Hello {{ name }}!")).toEqual(["name"]);
  });

  test("accepts only valid JS identifiers", () => {
    expect(extractVariables("{{9lives}} {{foo-bar}} {{_ok}} {{$also}}"))
      .toEqual(["_ok", "$also"]);
  });

  test("handles empty and missing input", () => {
    expect(extractVariables("")).toEqual([]);
    expect(extractVariables(undefined)).toEqual([]);
    expect(extractVariables("no variables here")).toEqual([]);
  });

  test("is stateful-regex safe across repeated calls", () => {
    expect(extractVariables("{{x}}")).toEqual(["x"]);
    expect(extractVariables("{{x}}")).toEqual(["x"]); // same result second time
  });
});
