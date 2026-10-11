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
| M1 | Tablature parser | The **parse result** of every tablature test case — row groups, slots, cells, labels — and every tablature diagnostic, asserted by `code`, `line` and `column`. No geometry. Adds `tsconfig.core.json` — M0 could not, as `tsc` rejects an `include` matching no files — and removes `--passWithNoTests` from the `test` script | done |
| M2 | Tablature layout | The **geometry** of every tablature test case — slot advances and positions, knockouts, row extents — computed through the injected `measure`, with core's analytic measure in tests. Plus the settings module: defaults, ranges, clamping and `setting-out-of-range` | done |
| M3 | Tablature renderer | A frame appears in Figma matching M2's scene: node kinds, 0-based layer names, z-order, fonts loaded with `lineHeight` pinned, placed at the default location and left selected. Driven by a hardcoded source in the sandbox, which M4 deletes | done |
| M4 | UI shell and protocol | The shared protocol module and every message in it, including `close`. Source field, settings controls carrying their ranges as input attributes, live diagnostics that select the offending range when clicked, render button disabled while any diagnostic is an error. Labels come from the spec's naming table. Replaces M3's hardcoded source | done |
| M5 | Persistence and re-edit | Plugin data written and read; all three `SelectionState` cases, including refusing a newer `schemaVersion` and disabling render while such a frame is selected; the editor clobbered by an editable selection and left alone otherwise; render target following the selection; relaunch button via `setRelaunchData` plus its manifest entry; `clientStorage` defaults written while handling `render`; `figma.notify` for outcomes outside the iframe | done |
| M5a | Tablature string gaps | String lines are cut into segments around each note cell, as [String lines and gaps](docs/spec.md#string-lines-and-gaps) describes, and the knockout rectangles are gone from tablature scenes. Each gap is the horizontal span its knockout covered — the cell's own measured width plus `clearance` on each side — so the visual spacing is unchanged. Overlapping or touching gaps merge, and a zero-length segment is never emitted. TC-1, TC-5, TC-8 and TC-9 assert segments instead of rectangles, and the z-order test drops knockouts | done |
| M6 | Fretboard parser and layout | Parse results and geometry for every fretboard test case, the fret-window worked examples including the clamps at both ends, and every fretboard diagnostic | done |
| M7 | Fretboard renderer and UI tab | Widens `Diagram`, `Defaults` and `Mode` in `src/core/protocol.ts` to both modes, which M4 left tablature-only. The Fretboard tab renders: nut versus ordinary boundary, dots, open discs with their knockout fill, fret labels carrying absolute fret numbers, string labels. Mode switching, and per-mode last-used settings | not started |

Two notes on the shape of this list:

- **M1 and M2 split one spec section.** The tablature test cases assert both a parse result and a geometry, so each case is exercised twice — by M1 for what it parses to, by M2 for where it lands. Neither milestone passes a case alone, which is why the spec marks that section for both.
- **M6 does not split the same way.** The fretboard has no slot model, so its parse and layout are small enough to land together.

**Measure breaks landed out of band, after M5.** Pipes in ASCII tab are now parsed as measure breaks and rendered as vertical lines, which was previously listed under the spec's *Not in v1*. It is not a milestone — it cuts across M1, M2 and M3's work — but two things it left behind matter to what follows:

- The renderer draws **axis-aligned lines in either orientation**, so M7's fret boundaries and nut need no new mechanism.
- A tablature slot is now **notes or a break**, so M6 and M7 should not assume a slot holds cells.

**M5a landed ahead of M6.** It is lettered rather than numbered so that the spec's *illustrative after M6* and *M7* markers keep meaning what they say.
It replaces the shortcut M2 and M3 took for text over string lines: an opaque white rectangle behind each cell, which showed as a white bar on Figma's grey canvas and on any frame that wasn't white.
The layout already computes everything the cut needs — each knockout was sized from its own cell — so this is a change to `src/core/tablature/layout.ts` and its tests, and the renderer is untouched.
What it leaves for later milestones:

- The fretboard's open disc is now the only node filled with `knockoutFill`.
  M7 keeps that as the spec describes, a known v1 limit, rather than inventing a fix the spec doesn't ask for.
- Scene line items that represent one string may now be several, so M7 should not assume one line per string.

**What M6 leaves for M7.**

- Fretboard layout emits a `disc` scene item, which tablature never does. Scene item types now live in `src/core/scene.ts`, and each mode's layout declares the union it emits, so `src/plugin/render.ts` compiles unchanged until M7 adds a `disc` case.
- The UI still parses tablature only, and `protocol.ts`, `pluginData.ts` and `clientStorage` know only tablature settings. `FretboardSettings` and its clamp are in `src/core/settings.ts`, ready to be paired with `"fretboard"` in `Diagram`.
- `leadingFrets` and `trailingFrets` are whole numbers: the fretboard clamp rounds a fraction and warns, so their number inputs should use `step` 1, as `fretboardRanges` says.

There is no "polish" milestone.
Settings clamping belongs to M2, where settings first arrive, and selection-change behavior to M5, where selection is first read; a milestone that collects them later would just be a license for the earlier ones to ship unfinished.

## Module map

The paths the spec's *authoritative* markers point at.
Renaming one means updating its marker.

| Path | Holds | From |
| --- | --- | --- |
| `src/core/diagnostics.ts` | `Severity`, `ParseError`, and the union of diagnostic codes | M1, extended M6 |
| `src/core/tablature/parse.ts` | Tablature parse result: row groups, slots, cells, labels | M1 |
| `src/core/fretboard/parse.ts` | Fretboard parse result: per-string markers and labels | M6 |
| `src/core/settings.ts` | Defaults, ranges, clamping, serialization for both modes | M2, extended M6 |
| `src/core/measure.ts` | The `measure` signature and core's analytic monospace implementation | M2 |
| `src/core/protocol.ts` | `UiMessage`, `SandboxMessage`, `Diagram`, `SelectionState` | M4 |
| `src/core/pluginData.ts` | Encoding and decoding a stored diagram; version policy | M5 |
| `src/core/tablature/layout.ts` | Tablature scene geometry | M2 |
| `src/core/scene.ts` | Scene item types shared by both modes' layouts | M6 |
| `src/core/fretboard/layout.ts` | Fretboard scene geometry, including the window computation | M6 |
| `src/plugin/pluginData.ts` | Reading and writing plugin data, and schema migration | M5 |
