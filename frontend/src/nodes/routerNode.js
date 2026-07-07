import { BaseNode } from "./BaseNode";
import { NODE_META } from "./nodeMeta";

const OPS = ["==", "!=", ">=", "<=", ">", "<", "includes"];

const evalCondition = (cond, valRaw) => {
  if (!cond || valRaw === undefined || valRaw === "") return null;
  const op = OPS.find((o) => cond.includes(o));
  if (!op) return null;
  const [lhs, rhs] = cond.split(op).map((s) => s.trim());
  if (lhs !== "value") return null;

  let rhsParsed = rhs;
  let valParsed = valRaw;
  const isQuoted =
    (rhs.startsWith('"') && rhs.endsWith('"')) ||
    (rhs.startsWith("'") && rhs.endsWith("'"));
  if (isQuoted) {
    rhsParsed = rhs.slice(1, -1);
  } else if (!isNaN(parseFloat(rhs))) {
    rhsParsed = parseFloat(rhs);
    valParsed = parseFloat(valRaw);
    if (isNaN(valParsed)) return null;
  }

  switch (op) {
    case ">":        return valParsed >  rhsParsed;
    case "<":        return valParsed <  rhsParsed;
    case ">=":       return valParsed >= rhsParsed;
    case "<=":       return valParsed <= rhsParsed;
    case "==":       return valParsed == rhsParsed; // eslint-disable-line eqeqeq
    case "!=":       return valParsed != rhsParsed; // eslint-disable-line eqeqeq
    case "includes": return String(valParsed).includes(String(rhsParsed));
    default:         return null;
  }
};

const RouterStatus = ({ data }) => {
  const result = evalCondition(data?.condition, data?.testValue);
  if (result === null) {
    return (
      <div className="vs-router-status vs-router-pending">
        ⟳ enter test value
      </div>
    );
  }
  return (
    <div
      className={`vs-router-status ${result ? "vs-router-true" : "vs-router-false"}`}
    >
      → routes to {result ? "TRUE" : "FALSE"}
    </div>
  );
};

export const RouterNode = ({ id, data }) => (
  <BaseNode
    id={id}
    data={data}
    config={{
      title: NODE_META.router.label,
      icon: NODE_META.router.icon,
      color: NODE_META.router.color,
      inputs: [{ id: `${id}-input`, label: "Input", position: "left" }],
      outputs: [
        { id: `${id}-true`, label: "True", position: "right", style: { top: "33%" } },
        { id: `${id}-false`, label: "False", position: "right", style: { top: "66%" } },
      ],
      fields: [
        {
          type: "text",
          key: "condition",
          label: "Condition",
          default: "value > 0",
        },
        {
          type: "text",
          key: "testValue",
          label: "Test Value",
          default: "",
        },
      ],
    }}
  >
    <RouterStatus data={data} />
  </BaseNode>
);
