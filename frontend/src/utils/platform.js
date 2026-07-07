// Platform-aware labels: the shortcut handlers already accept both
// metaKey and ctrlKey; only what we DISPLAY differs.
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

export const MOD_K = isMac ? "⌘K" : "Ctrl+K";
