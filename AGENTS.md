# Conventions for figma-guitar-tab

[docs/spec.md](docs/spec.md) is the normative specification for plugin behavior.
When code and spec disagree, the spec wins — or the spec is wrong and should be changed first, in the same change set.
Do not implement behavior the spec doesn't describe; see its [Non-goals](docs/spec.md#non-goals).

This file holds invariants, workflow and conventions — how to work in this repo — and points at the spec for anything the spec defines.
If a sentence here would need editing because the spec gained a test case, a setting or a diagnostic code, it is restating the spec and belongs there instead.

## Planning and approval

Exiting plan mode is not approval to implement.
When a plan is finished, stop and wait for an instruction that names what to build.

Treat an ambiguous signal — a mode change, a "continue", a plan file that now exists — as *the plan is ready*, never as *start building*.
A milestone in [TODO.md](TODO.md) is a description of work, not a go-ahead for it.

## Stack

- **UI:** React and TailwindCSS, rendered in the plugin's HTML iframe.
- **Build:** esbuild for TypeScript/JSX transpilation and bundling, driven by `scripts/build.mjs`.
  A small custom esbuild plugin compiles `src/ui/index.css` with Tailwind and inlines the result, along with the bundled UI script, into a single `dist/ui.html` — Figma requires the UI to be one self-contained HTML file.
- **Format:** oxfmt, configured by `.oxfmtrc.json`, pinned to an exact version — a floating range on a pre-1.0 formatter reformats files nobody touched and buries the real diff.
  It formats **TypeScript and JavaScript only.**
  Markdown is excluded because prose uses semantic line breaks (see Docs style) and because `src/core/tablature/fixtures.ts` is extracted byte-for-byte from `docs/spec.md`'s ASCII blocks, so reflowing one would silently change a slot structure.
  JSON, CSS and HTML are excluded because oxfmt sorts `package.json` fields, `src/ui/index.css` carries Tailwind v4 directives, and `src/ui/index.html` carries the markers the build replaces by exact string match.
  Write code the formatter agrees with rather than fighting it: if it strips parentheses you wanted for clarity, restructure the expression instead of reinstating them.
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
  - **layout** — that structure, settings, and an injected `measure(text, fontSize)` → a *scene*: a flat list of plain objects like `{ kind: "line", name, x1, y1, x2, y2, strokeWeight }`, `{ kind: "rect", name, x, y, width, height, fill }` and `{ kind: "text", name, x, y, characters, fontSize }`, in spec coordinates.
    Measurement is injected because slot widths depend on it: the sandbox passes a Figma-backed measure, tests pass core's analytic monospace one.
  - **measure** — the `measure(text, fontSize)` signature, and the analytic monospace implementation that tests inject
  - **settings** — defaults, ranges, clamping, serialization
  - **protocol** — the `UiMessage`/`SandboxMessage` types, imported by both halves
  - **diagnostics** — `Severity`, `ParseError` and the union of diagnostic codes, which every parser returns and both halves consume
- `src/plugin/` contains the only code that calls the Figma API.
  Its renderer walks a scene and creates nodes; it makes no layout decisions and does no arithmetic beyond translating coordinates onto a frame.
- Consequence: every geometry question is answerable in a unit test, with no Figma runtime and no screenshots.
  If a bug requires opening Figma to reproduce, it is probably a renderer bug, and the renderer should be made dumber.

## Tests

- Every `TC-*` case in the spec's test-case sections exists as a named fixture, and the test names reference the code (`TC-2 hyphenspace collapses`).
  Adding a spec test case means adding a fixture.
  The spec holds each case's **source and purpose**; its figures live in the tests, which is the copy that fails when it is wrong.
  `src/core/tablature/fixtures.ts` is extracted from the spec's fenced blocks verbatim, so a case's ASCII must stay byte-identical in both.
- Layout is asserted on the scene, not on rendered output: counts and kinds of scene items, and exact coordinates computed from the spec's formulas.
- Layout tests inject the analytic monospace measure, never a Figma-backed one, so slot widths and positions are deterministic.
  Every px figure in the spec's test cases is computed with that measure.
  Its advance ratio is a stub constant, not a font metric — the sandbox measures with Figma, so no render depends on it.
  Don't "correct" it against real font metrics; that would invalidate every fixture for no gain.
- Tests are co-located with the code they cover, as `*.test.ts` beside the module — `src/core/tablature/parse.test.ts`, not a separate `__tests__/` tree.
- Equivalence cases — two sources the spec says must parse identically — are asserted as deep equality between the two parses, not against a transcribed expectation, so they survive a change to defaults.
- Diagnostics are asserted by `code`, `line` and `column`, never by message text.

## Manifest

```json
{
  "name": "Guitar Tab",
  "id": "1234567890123456789",
  "api": "1.0.0",
  "main": "dist/plugin.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] },
  "relaunchButtons": [{ "command": "edit", "name": "Edit source and settings" }]
}
```

`editorType` is `figma` only: the plugin draws vector nodes, which FigJam and Slides don't support in the same way.

`id` is required, and the committed value is a **placeholder**: publication assigns the durable id and overwrites it.
Importing from a manifest accepts any well-formed value, verified at M0, so there is nothing to mint locally.
Don't mint one from the Figma app to look official — it would be replaced too, and a plausible value is harder to notice before publishing than an obviously synthetic one.

## What the UI does not do

The UI parses, to show diagnostics as the user types.
It does **not** run layout, measure text, or precompute any geometry — the sandbox is the only place layout happens.
Diagnostics are measurement-free, so the UI can predict every `render-failed` without knowing anything about font metrics, and there is nothing for the two halves to disagree about.
If you find yourself wanting layout in the UI, you are about to introduce a divergence; send a message and let the sandbox answer.

It also keeps no dirty flag and no unsaved-state tracking.
Selecting a generated frame overwrites the editor with that frame's stored diagram, by design; selections that carry no diagram leave the editor untouched.
Don't add a confirmation dialog for the overwrite — it was considered and rejected as more state than the loss is worth.

## Settings ranges

A setting's range lives in one place: `src/core/settings.ts`, which also holds each setting's UI label.
The UI renders number inputs with `min`, `max` and `step` read from that module, and takes their labels from it too rather than spelling them out; core clamps anything out of range on the way in.
A diagnostic about a setting names it the way the UI does — the labels live in the same module — and carries no source anchor, since it is wrong no matter what the source says.
Both, not either: the input attributes keep the normal path clean, and the clamp covers a UI bug, hand-edited plugin data, and values stored before a range narrowed.
Constraints spanning more than one value can't be an input attribute at all: the fret window's span depends on the source as much as on `leadingFrets` and `trailingFrets`.
Those are resolved by clamping inside core, not by a diagnostic — a setting the user can reach should not be able to produce an error.

## Figma specifics that bite

- `documentAccess` is `dynamic-page`, which Figma requires of new plugins.
  It restricts `getNodeById`, `getFileThumbnailNode`, `ComponentNode.instances`, and `PageNode`'s `appendChild` / `findAll` / `findChild` / `exportAsync` family.
  Node lookup by id is therefore async — `getNodeByIdAsync`, which M5 needs for an `existing` render target — and a `PageNode` member needs `await page.loadAsync()` first.
  `figma.viewport` and `selection` are unaffected.
- **Node creation auto-appends to `figma.currentPage`.** So move a new node into its frame with `FrameNode.appendChild` and never reach for `PageNode.appendChild`, which is one of the restricted members above.
- **Resolve the font once per render** and use it for measurement *and* drawing.
  Measuring in Roboto Mono while drawing in the Roboto fallback computes every width from a font that isn't on screen, and nothing fails, because `src/plugin/` has no tests.
- A `LineNode` has zero height and is drawn along its own x axis: `resize(length, 0)`.
  A vertical line needs a rotation, which the fretboard's fret boundaries will want at M7.
- `layoutSizingHorizontal` / `layoutSizingVertical` only mean anything once a node is already a child of an auto-layout frame.
  Append first, then size, or the parent hugs the child instead of honouring its computed extent.
- `figma.loadFontAsync` MUST resolve before any text node is created or any `characters` assignment.
  Load once per render, not per node.
- Set `lineHeight` to `fontSize` and `textAutoResize` to `WIDTH_AND_HEIGHT` on every text node.
  Figma's default auto line height is a font metric, so leaving it alone makes node heights unpredictable and the spec's vertical formulas wrong.
- Node z-order is creation order within a parent, so the renderer appends scene items in the order the spec lists them: labels, lines, knockouts, text.
  A knockout rectangle created before its string line would be hidden by it.
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
Don't invent labels, and don't leak spec or code vocabulary into the interface — the spec's Glossary is the list of words a user should never see, and a diagnostic surfaces its `message`, never its `code`.

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

`pnpm check` passes, and the spec is left consistent with the code.

Run `pnpm format` once you've stopped editing code, before `pnpm check`.
`check` gates formatting but does not fix it, and hand-editing code to match the formatter is a wasted round trip that tends to land close but not exact.
Expect the formatter to rewrite what you just wrote; read a file back after formatting it rather than assuming your version survived.

What consistency with the spec means depends on which part of it you touched:

- **Rules, decisions and rationale** stay in the spec, and a change in behavior updates them.
- **Facts marked *illustrative after Mx*** — formulas, pixel figures, type definitions, data tables — are **deleted** when `Mx` lands, and the module named in the marker becomes authoritative.
  Don't update a marked table to match new code: delete it and let the tests carry the numbers.
- Before its milestone lands, a marked block is still live, and a change that affects it updates it as usual.

Which blocks belong to which milestone is in [TODO.md](TODO.md), whose "Done means" is the full checklist.
From M1 onward `docs/spec.md` should get shorter in every implementation commit; if it grew, check whether you added a fact that belongs in code instead.
