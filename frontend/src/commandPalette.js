import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "reactflow";
import { NODE_META, TOOLBAR_ORDER } from "./nodes/nodeMeta";
import { useStore } from "./store";
import { TEMPLATES } from "./templates";

// Cmd+K palette. Two action types:
//   { kind: "addNode", type } — drops a node at viewport center
//   { kind: "template", build } — loads a template
const buildActions = () => {
  const nodeActions = TOOLBAR_ORDER.map((type) => ({
    kind: "addNode",
    type,
    label: `Add ${NODE_META[type].label} node`,
    icon: NODE_META[type].icon,
    keywords: [NODE_META[type].label.toLowerCase(), type.toLowerCase()],
  }));
  const tmplActions = TEMPLATES.map((t) => ({
    kind: "template",
    build: t.build,
    label: `Insert template: ${t.label}`,
    icon: t.icon,
    keywords: ["template", t.label.toLowerCase(), t.key],
  }));
  return [...nodeActions, ...tmplActions];
};

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const addNode = useStore((s) => s.addNode);
  const getNodeID = useStore((s) => s.getNodeID);
  const loadTemplate = useStore((s) => s.loadTemplate);
  const rf = useReactFlow();

  const actions = useMemo(buildActions, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.includes(q))
    );
  }, [actions, query]);

  // Global Cmd+K to toggle
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Keep highlight valid
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1));
  }, [filtered, highlight]);

  // Auto-scroll the highlighted item into view
  useEffect(() => {
    const el = listRef.current?.children?.[highlight];
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const runAction = useCallback(
    (action) => {
      if (!action) return;
      if (action.kind === "addNode") {
        const id = getNodeID(action.type);
        // Drop at the current viewport center
        const wrapper = document.querySelector(".vs-canvas");
        const rect = wrapper?.getBoundingClientRect();
        const px = (rect?.width ?? 800) / 2;
        const py = (rect?.height ?? 500) / 2;
        const position = rf.project
          ? rf.project({ x: px, y: py })
          : { x: px, y: py };
        addNode({
          id,
          type: action.type,
          position,
          data: { id, nodeType: action.type },
        });
      } else if (action.kind === "template") {
        loadTemplate(action.build);
      }
      setOpen(false);
    },
    [addNode, getNodeID, loadTemplate, rf]
  );

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAction(filtered[highlight]);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="vs-cmdk-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="vs-cmdk">
        <div className="vs-cmdk-header">
          <span className="vs-cmdk-prompt">▶</span>
          <input
            ref={inputRef}
            className="vs-cmdk-input"
            placeholder="search nodes & templates..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
          />
          <span className="vs-cmdk-hint">↑↓ NAV · ⏎ RUN · ESC</span>
        </div>
        <div className="vs-cmdk-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="vs-cmdk-empty">No matches.</div>
          )}
          {filtered.map((a, i) => (
            <button
              key={`${a.kind}-${a.label}`}
              className={`vs-cmdk-item ${i === highlight ? "vs-cmdk-item-active" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => runAction(a)}
            >
              <span className="vs-cmdk-item-icon">{a.icon}</span>
              <span className="vs-cmdk-item-label">{a.label}</span>
              <span className="vs-cmdk-item-kind">
                {a.kind === "addNode" ? "NODE" : "TEMPLATE"}
              </span>
            </button>
          ))}
        </div>
        <div className="vs-cmdk-footer">
          <span>FLOWFORGE COMMAND</span>
          <span>⌘K toggles</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
