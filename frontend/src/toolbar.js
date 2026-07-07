import { useEffect, useMemo, useRef, useState } from "react";
import { DraggableNode } from "./draggableNode";
import { NODE_META, TOOLBAR_ORDER } from "./nodes/nodeMeta";
import { useStore } from "./store";
import { TEMPLATES } from "./templates";

const relativeTime = (ts) => {
  if (!ts) return null;
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

const SavedIndicator = () => {
  const savedAt = useStore((s) => s.savedAt);
  const historyIndex = useStore((s) => s.historyIndex);
  const historyLen = useStore((s) => s.history.length);
  const [, force] = useState(0);

  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="vs-saved" title="Pipeline auto-saved to your browser">
      <span className="vs-saved-dot" />
      <span className="vs-saved-text">
        {savedAt ? `SAVED ${relativeTime(savedAt)}` : "UNSAVED"}
      </span>
      <span className="vs-saved-hist" title="Undo / redo history">
        {historyIndex + 1}/{historyLen}
      </span>
    </div>
  );
};

// Generic dropdown wrapper that closes on outside click
const useDropdown = () => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  return { open, setOpen, wrapRef };
};

const TemplatesMenu = () => {
  const { open, setOpen, wrapRef } = useDropdown();
  const loadTemplate = useStore((s) => s.loadTemplate);
  const nodes = useStore((s) => s.nodes);

  const pick = (build) => {
    if (
      nodes.length > 0 &&
      !window.confirm("Replace the current pipeline with this template?")
    ) {
      setOpen(false);
      return;
    }
    loadTemplate(build);
    setOpen(false);
  };

  return (
    <div className="vs-menu-wrap" ref={wrapRef}>
      <button
        className="vs-pixel-btn"
        onClick={() => setOpen((o) => !o)}
        title="Insert a pre-built pipeline template"
      >
        ▣ TEMPLATES
      </button>
      {open && (
        <div className="vs-menu">
          <div className="vs-menu-title">PIPELINE TEMPLATES</div>
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              className="vs-menu-item"
              onClick={() => pick(t.build)}
            >
              <span className="vs-menu-icon">{t.icon}</span>
              <span className="vs-menu-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ActionsMenu = () => {
  const { open, setOpen, wrapRef } = useDropdown();
  const autoLayout = useStore((s) => s.autoLayout);
  const clearPipeline = useStore((s) => s.clearPipeline);
  const importPipeline = useStore((s) => s.importPipeline);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const fileInputRef = useRef(null);

  const onExport = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowforge-pipeline-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      importPipeline(JSON.parse(text));
    } catch (err) {
      alert(`Could not import: ${err.message}`);
    } finally {
      e.target.value = "";
      setOpen(false);
    }
  };

  const onClear = () => {
    if (window.confirm("Clear the entire pipeline?")) clearPipeline();
    setOpen(false);
  };

  const hasNodes = nodes.length > 0;

  return (
    <div className="vs-menu-wrap" ref={wrapRef}>
      <button
        className="vs-pixel-btn"
        onClick={() => setOpen((o) => !o)}
        title="More actions"
      >
        ··· ACTIONS
      </button>
      {open && (
        <div className="vs-menu">
          <div className="vs-menu-section">LAYOUT</div>
          <button
            className="vs-menu-item"
            onClick={() => { autoLayout(); setOpen(false); }}
            disabled={!hasNodes}
          >
            <span className="vs-menu-icon">⇆</span>
            <span className="vs-menu-label">Auto-arrange</span>
          </button>

          <div className="vs-menu-section">FILE</div>
          <button
            className="vs-menu-item"
            onClick={onExport}
            disabled={!hasNodes}
          >
            <span className="vs-menu-icon">↓</span>
            <span className="vs-menu-label">Export JSON</span>
          </button>
          <button
            className="vs-menu-item"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="vs-menu-icon">↑</span>
            <span className="vs-menu-label">Import JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onImportFile}
            style={{ display: "none" }}
          />

          <div className="vs-menu-section">DANGER</div>
          <button
            className="vs-menu-item vs-menu-item-danger"
            onClick={onClear}
            disabled={!hasNodes}
          >
            <span className="vs-menu-icon">✕</span>
            <span className="vs-menu-label">Clear all nodes</span>
          </button>
        </div>
      )}
    </div>
  );
};

export const PipelineToolbar = () => {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLBAR_ORDER.filter((type) =>
      q ? NODE_META[type].label.toLowerCase().includes(q) : true
    );
  }, [query]);

  return (
    <header className="vs-toolbar">
      <div className="vs-toolbar-brand">
        <span className="vs-brand-mark">F</span>
        <span className="vs-brand-text">FLOWFORGE ◆ PIPELINES</span>
      </div>

      <input
        className="vs-toolbar-search nodrag"
        type="text"
        placeholder="> search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="vs-toolbar-chips">
        {items.map((type) => (
          <DraggableNode
            key={type}
            type={type}
            label={NODE_META[type].label}
            color={NODE_META[type].color}
            icon={NODE_META[type].icon}
          />
        ))}
        {items.length === 0 && (
          <span className="vs-toolbar-empty">No nodes match.</span>
        )}
      </div>

      <div className="vs-toolbar-meta">
        <SavedIndicator />
        <TemplatesMenu />
        <ActionsMenu />
      </div>
    </header>
  );
};
