# TODO

Implementation plan for figma-guitar-tab.
Behavior is specified in [docs/spec.md](docs/spec.md); conventions are in [AGENTS.md](AGENTS.md).

This file defines the milestone boundaries and their order — nothing else.
Where the spec marks a block *illustrative after Mx*, this file is what `Mx` means.

## Done means

A milestone is done when all three hold:

1. The behavior it covers is implemented, with tests for everything in `src/core/`.
2. `pnpm check` passes.
3. **The spec blocks marked for that milestone are deleted**, leaving the surrounding rationale, and the module named in the marker is authoritative from then on.

Condition 3 is not bookkeeping: it is what keeps the spec's facts from drifting away from the code.
From M1 onward, `docs/spec.md` should get *shorter* in every implementation commit.

## Milestones

Build in this order; each one is independently verifiable.

| # | Milestone | Done when | Status |
| --- | --- | --- | --- |
| M0 | Scaffold | Scripts, `tsconfig` with `strict` and `noUncheckedIndexedAccess`, oxlint, Vitest, the esbuild build that inlines Tailwind into one `dist/ui.html`, and `manifest.json`. `pnpm check` passes; the plugin sideloads and opens an empty UI | done |
| M1 | Tablature parser | The **parse result** of every tablature test case — row groups, slots, cells, labels — and every tablature diagnostic, asserted by `code`, `line` and `column`. No geometry. Adds `tsconfig.core.json` — M0 could not, as `tsc` rejects an `include` matching no files — and removes `--passWithNoTests` from the `test` script | not started |
| M2 | Tablature layout | The **geometry** of every tablature test case — slot advances and positions, knockouts, row extents — computed through the injected `measure`, with core's analytic measure in tests. Plus the settings module: defaults, ranges, clamping and `setting-out-of-range` | not started |
| M3 | Tablature renderer | A frame appears in Figma matching M2's scene: node kinds, 0-based layer names, z-order, fonts loaded with `lineHeight` pinned, placed at the default location and left selected. Driven by a hardcoded source in the sandbox, which M4 deletes | not started |
| M4 | UI shell and protocol | The shared protocol module and every message in it, including `close`. Source field, settings controls carrying their ranges as input attributes, live diagnostics that select the offending range when clicked, render button disabled while any diagnostic is an error. Labels come from the spec's naming table. Replaces M3's hardcoded source | not started |
| M5 | Persistence and re-edit | Plugin data written and read; all three `SelectionState` cases, including refusing a newer `schemaVersion` and disabling render while such a frame is selected; the editor clobbered by an editable selection and left alone otherwise; render target following the selection; relaunch button via `setRelaunchData` plus its manifest entry; `clientStorage` defaults written while handling `render`; `figma.notify` for outcomes outside the iframe | not started |
| M6 | Fretboard parser and layout | Parse results and geometry for every fretboard test case, the fret-window worked examples including the clamps at both ends, and every fretboard diagnostic | not started |
| M7 | Fretboard renderer and UI tab | The Fretboard tab renders: nut versus ordinary boundary, dots, open discs with their knockout fill, fret labels carrying absolute fret numbers, string labels. Mode switching, and per-mode last-used settings | not started |

Two notes on the shape of this list:

- **M1 and M2 split one spec section.** The tablature test cases assert both a parse result and a geometry, so each case is exercised twice — by M1 for what it parses to, by M2 for where it lands. Neither milestone passes a case alone, which is why the spec marks that section for both.
- **M6 does not split the same way.** The fretboard has no slot model, so its parse and layout are small enough to land together.

There is no "polish" milestone.
Settings clamping belongs to M2, where settings first arrive, and selection-change behavior to M5, where selection is first read; a milestone that collects them later would just be a license for the earlier ones to ship unfinished.

## Module map

The paths the spec's *authoritative* markers point at.
Renaming one means updating its marker.

| Path | Holds | From |
| --- | --- | --- |
| `src/core/settings.ts` | Defaults, ranges, clamping, serialization for both modes | M2, extended M6 |
| `src/core/measure.ts` | The `measure` signature and core's analytic monospace implementation | M2 |
| `src/core/protocol.ts` | `UiMessage`, `SandboxMessage`, `Diagram`, `SelectionState` | M4 |
| `src/core/tablature/layout.ts` | Tablature scene geometry | M2 |
| `src/core/fretboard/layout.ts` | Fretboard scene geometry, including the window computation | M6 |
| `src/plugin/pluginData.ts` | Reading and writing plugin data, and schema migration | M5 |

## Open questions, by milestone

Decisions the spec deliberately leaves open, to be settled when the code forces them.

| Milestone | Question |
| --- | --- |
| M5 | What `SelectionState` does a frame get when `schemaVersion` and `mode` are readable — so it is recognized — but `source` is missing or `settings` is not valid JSON? The three current cases don't cover it |
