# 05 — Styling: the Pixel-Arcade design system

The brief says "an appealing, unified design" — free choice. Six directions
were prototyped (Synthwave, Whiteboard, Glass, Isometric, Brutalist,
Pixel-Arcade); Pixel-Arcade won because it is **instantly memorable** in a
portfolio, and its hard-edged geometry is actually *easier* to keep
consistent than soft glassmorphism.

Everything lives in one file: [`index.css`](../frontend/src/index.css). No
Tailwind, no styled-components — deliberate, to show raw CSS architecture.

## The token layer (design system in `:root`)

All color and type decisions are CSS variables:

```css
:root {
  --sky-deep: #1a1340;   /* night sky */    --win-body: #fff5e0;  /* cream card */
  --win-border: #2a1a55; /* outline */      --win-shadow: #1a1340;/* hard shadow */
  --lime: #9aff70;  --butter: #ffd84a;  --coral: #ff6b6b;  --hot-pink: #ff5c95;
  --font-pixel: "Press Start 2P", monospace;  /* headings/labels */
  --font-mono:  "VT323", monospace;           /* body/inputs */
}
```

Change `--win-body` once and every node, modal, and menu re-skins. That *is*
the "apply styles across nodes in the future" requirement, solved at the CSS
layer.

## The signature look, deconstructed

- **Y2K window chrome** — every card is a "window": cream body, 2px dark
  outline, and the key trick, a **hard offset shadow** (`box-shadow:
  6px 6px 0 var(--win-shadow)` — zero blur). Blur reads "soft modern"; zero
  blur reads "1998 OS", instantly.
- **Bevel edges** — light top/left, dark bottom/right border colors fake a
  raised 3D button the way old UI toolkits did.
- **Two-font hierarchy** — Press Start 2P is unreadable below ~8px and
  exhausting in paragraphs, so it's reserved for titles/labels; VT323 (a
  taller, readable terminal face) carries body text at 16–17px.
- **The sunset gradient canvas** with a dotted ReactFlow grid tinted to match.

## Per-node theming through one custom property

`BaseNode` sets `style={{ "--node-color": config.color }}` on the root.
CSS then derives the header background, handle color, and selection ring from
`var(--node-color)`. **One prop themes the whole node** — no per-type CSS.

## Component conventions

- Every class is prefixed `vs-` (poor-man's scoping; no collisions with
  ReactFlow's classes).
- ReactFlow's own UI (`.vs-controls`, minimap) is restyled to match the theme
  — a unified design means *no element left on defaults*.
- States are modifier classes: `.vs-swatch-active`, `.vs-cmdk-item-active`,
  `.vs-run-executed`. JS toggles class names; CSS owns appearance.

## Motion

Used sparingly, and always meaningful:

- animated dashed edges (data direction),
- the invalid-connection banner flash (2.5s, then auto-clears),
- the run sweep: `.vs-run-running` pulses a butter-yellow ring
  (`@keyframes vs-run-pulse`), then nodes settle into lime (executed),
  desaturated (skipped), or coral (error). The animation isn't decoration —
  it *shows topological order* on the canvas.

## Gotchas worth remembering

- **Dropdowns vs `overflow: hidden`** — the toolbar needs to clip its
  scrolling chip row but let menus escape downward. Fix:
  `clip-path: inset(0 0 -2000px 0)` (clip top/sides, open bottom).
- **`@media (hover: none)`** — the node delete button is hover-revealed on
  desktop but always visible on touch devices.
- **Pixel fonts need letter-spacing** and generous line-height or they
  smear together at small sizes.
