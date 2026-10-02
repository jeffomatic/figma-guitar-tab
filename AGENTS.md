# Conventions for figma-guitar-tab

[docs/spec.md](docs/spec.md) is the normative specification for plugin behavior.
When code and spec disagree, the spec wins — or the spec is wrong and should be changed first, in the same change set.
Do not implement behavior the spec doesn't describe; see its [Non-goals](docs/spec.md#non-goals).

## Stack

- **UI:** React and TailwindCSS, rendered in the plugin's HTML iframe.
- **Build:** esbuild for TypeScript/JSX transpilation and bundling, driven by `scripts/build.mjs`.
  A small custom esbuild plugin compiles `src/ui/index.css` with Tailwind and inlines the result, along with the bundled UI script, into a single `dist/ui.html` — Figma requires the UI to be one self-contained HTML file.
- **Lint:** oxlint with the recommended type-aware rulesets.
- **Tests:** Vitest.
  `src/core/` is tested; `src/plugin/` and `src/ui/` are not, by design (see below).
- **Package manager:** pnpm.
  Node 20+.
- TypeScript `strict: true`, plus `noUncheckedIndexedAccess` — the parser indexes into lines and columns constantly.

## The core boundary

This is the most important rule in the repo.

```
src/core/     pure functions: text → diagnostics + layout        ← all the logic, all the tests
src/plugin/   layout → Figma nodes, document I/O, selection      ← thin, imperative, untested
src/ui/       React controls → messages                          ← thin, presentational
```

- `src/core/` MUST NOT import `figma`, React, or anything DOM.
  It is a library that happens to be used by a plugin.
  It exports:
  - **parsers** — source text → a row/slot or fretboard structure, plus `ParseError[]`
  - **layout** — that structure, settings, and an injected `measure(text, fontSize)` → a *scene*: a flat list of plain objects like `{ kind: "line", name, x1, y1, x2, y2, strokeWeight }` and `{ kind: "text", name, x, y, characters, fontSize }`, in spec coordinates.
    Text measurement is injected because tablature slot widths depend on it; core ships an analytic monospace measure, and the sandbox may pass a Figma-backed one.
  - **settings** — defaults, ranges, clamping, serialization
  - **protocol** — the `UiMessage`/`SandboxMessage` types, imported by both halves
- `src/plugin/` contains the only code that calls the Figma API.
  Its renderer walks a scene and creates nodes; it makes no layout decisions and does no arithmetic beyond translating coordinates onto a frame.
- Consequence: every geometry question is answerable in a unit test, with no Figma runtime and no screenshots.
  If a bug requires opening Figma to reproduce, it is probably a renderer bug, and the renderer should be made dumber.

## Tests

- Every `TC-*` case in the spec's test-case sections exists as a named fixture, and the test names reference the code (`TC-2 hyphenspace collapses`).
  Adding a spec test case means adding a fixture.
- Layout is asserted on the scene, not on rendered output: counts and kinds of scene items, and exact coordinates computed from the spec's formulas.
- Layout tests inject the analytic monospace measure, never a Figma-backed one, so slot widths and positions are deterministic.
- Equivalence cases (TC-2) are asserted as deep equality between two parses, not against a transcribed expectation — that way the assertion survives a change to defaults.
- Diagnostics are asserted by `code`, `line` and `column`, never by message text.

## Manifest

```json
{
  "name": "Guitar Tab",
  "id": "<assigned by Figma on first publish; omit until then>",
  "api": "1.0.0",
  "main": "dist/plugin.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "networkAccess": { "allowedDomains": ["none"] },
  "relaunchButtons": [{ "command": "edit", "name": "Edit source and settings" }]
}
```

`editorType` is `figma` only: the plugin draws vector nodes, which FigJam and Slides don't support in the same way.

## Figma specifics that bite

- `figma.loadFontAsync` MUST resolve before any text node is created or any `characters` assignment.
  Load once per render, not per node.
- Plugin data values are strings only.
  Everything structured is JSON.
- `setRelaunchData` requires a matching `relaunchButtons` entry in `manifest.json`.
- `manifest.json` declares `"networkAccess": { "allowedDomains": ["none"] }`.
  The plugin must stay offline: no font CDNs, no telemetry, no remote config.
- Re-render replaces a frame's children wholesale.
  Never mutate a node the previous render created; remove and rebuild.
- A render is one undo step.
  Do the work, then let the plugin close or idle — don't interleave document writes with awaits that could land in a separate undo group.

## UI copy

Every user-facing string comes from the spec's [Naming and UI copy](docs/spec.md#naming-and-ui-copy) table.
Don't invent labels, and don't leak spec or code vocabulary into the interface: no *slot*, *note cell*, *slot advance*, *playable region*, *row group*, *hyphenspace*, and no diagnostic `code`.
A diagnostic surfaces its `message` only.

The mode identifier is `"tablature"`, not `"tab"`, in types, plugin data and `clientStorage` keys.
In the UI that mode is labeled **Tab**.

## Docs style

Markdown prose uses **semantic line breaks**: one sentence per line, with a clause break allowed as its own line when a sentence is long.
Lines are never wrapped to a fixed column.
A sentence-level edit then shows up as a one-line diff instead of reflowing the rest of the paragraph, and review comments land on the sentence they're about.

- Don't hard-wrap, and don't reflow a paragraph you didn't change.
- Tables, code blocks and the ASCII examples are left exactly as they are.
- A sentence under about 25 characters stays on the line beside its neighbor rather than taking one of its own.
- `.editorconfig` turns off `max_line_length` for `*.md` so editors don't re-wrap.
  If Prettier is ever added, it needs `"proseWrap": "preserve"`.

## Definition of done

`pnpm check` passes, and the spec reflects any behavior that changed.
A change that alters rendered geometry also updates the affected formulas or defaults table in the spec.

## Milestones

Build in this order; each one is independently verifiable.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Scaffold | `pnpm check` passes on an empty-but-wired repo; the plugin sideloads and shows a blank UI |
| M1 | Tablature parser | TC-1 … TC-6 pass, plus the tablature diagnostics table |
| M2 | Tablature layout | Scene coordinates match the spec's formulas, including line segmentation around text |
| M3 | Tablature renderer | A frame appears in Figma matching M2's scene; fonts load; names match the node tree |
| M4 | UI shell and protocol | Source field, settings controls, live diagnostics, render round trip |
| M5 | Persistence and re-edit | Plugin data written and read, selection-driven edit mode, relaunch button |
| M6 | Fretboard parser and layout | TC-F1, TC-F2, window-mode worked examples, fretboard diagnostics |
| M7 | Fretboard renderer and UI tab | The Fretboard UI tab renders; nut, dots, open and mute markers, fret labels |
| M8 | Polish | Clamping and validation edge cases, empty and oversized input, warning before discarding overrides |
