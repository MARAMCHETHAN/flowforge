// Single source of truth for {{variable}} parsing.
// Matches valid JS identifiers inside double curly braces; the backend
// (backend/executors.py VAR_RE) must stay in sync with this pattern.
export const VAR_REGEX = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;

// Returns unique variable names in first-appearance order.
export const extractVariables = (text) => {
  const seen = new Set();
  const out = [];
  let m;
  const re = new RegExp(VAR_REGEX.source, "g"); // fresh lastIndex per call
  while ((m = re.exec(text || "")) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
};
