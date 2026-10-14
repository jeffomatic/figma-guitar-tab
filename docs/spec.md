# Specification

Normative specification for the figma-guitar-tab plugin.
See [../README.md](../README.md) for orientation and [../AGENTS.md](../AGENTS.md) for engineering conventions.

The plugin has exactly two modes, each occupying its own UI tab, each with its own ASCII syntax, render model, settings and plugin data:

- **Traditional tablature** ([spec](#traditional-tablature)) — time on the horizontal axis.
  One source may hold several row groups, which render as several rows of one diagram.
- **Fretboard diagram** ([spec](#fretboard-diagram)) — fret number on the horizontal axis.
  One source is exactly one diagram; there is no way to render several fretboard diagrams from a single source.

Both modes support **4-, 6- and 7-string** instruments: bass, standard guitar, and seven-string guitar.
The string count comes from the number of source lines, and nothing in either render model is specific to six — `S` is a variable throughout.
Any other count is rejected rather than rendered, which keeps two useful invariants: every diagram has a default tuning to fall back on, and therefore a label for every string.

Sections after the two modes — [persistence](#persistence-and-re-edit), [text and measurement](#text-fonts-and-measurement), [the message protocol](#ui-and-sandbox-protocol), [validation](#error-handling-and-validation) and [non-goals](#non-goals) — apply to both.

### Spec and tests

This document holds the rules, the decisions and the reasoning behind them, and stays general on purpose.
Exact figures — pixel positions, node counts, defaults and ranges — live in the code and its tests, and the tests are what fail when a figure is wrong.
Where this document gives a figure, it is there to explain a rule; read the code for the value.

## Glossary

Terms are used with these meanings throughout this document.
Note in particular that *string* and *fret* are distinct: a number appearing in ASCII source is always a fret number, and the string it applies to is determined by which line it appears on.

| Term | Meaning |
| --- | --- |
| **string** | One of the guitar's strings. Identified by its **string index**: line 1 of a group of ASCII lines is the highest-pitched string, and the last line is the lowest-pitched. Rendered as a horizontal line in both modes. |
| **fret number** | A position along a string, counted from the nut. `0` means the open string. This is what the numbers in ASCII source denote. |
| **note cell** | The text occupying one slot on one string: a run of ASCII characters denoting what is played there — a bare fret number (`4`), one decorated with technique notation (`4/6`, `2h3p2`), or an `x` for a muted note. A cell may encode more than one note. Its rendering is a single text node. |
| **slot** | One position along a tablature row's horizontal axis, and the unit of horizontal spacing. A slot is either the note cells sounding together — at most one per string, decided by start column rather than by ordinal position — or a *measure break*, which has no cells and no width. Slots are ordered left to right. |
| **measure break** | A boundary between measures, written as a column of `|` characters spanning every string, and rendered as a vertical line joining the top and bottom string lines. Every row is bracketed by one whether or not the source writes it. |
| **slot advance** | The horizontal distance from one slot's left edge to the next slot's left edge. Borrowed from typography, where a glyph's advance is the distance from its origin to the next glyph's. It is not constant: a slot advances by its widest cell's width plus `noteGap`, so a slot holding a wide cell pushes the next one further out. |
| **row** | A horizontal band of tablature containing one set of string lines. A tab too long to fit one line of ASCII is split across several rows. |
| **row frame** | The Figma frame holding one row's string labels, string lines, measure breaks and note text. |
| **row group** | The block of source lines that produces one row: the lines between two blank lines, one line per string. *Row* is the rendered band, *row group* its source. |
| **playable region** | What remains of a tablature source line after its string label and any leading whitespace are stripped. It begins with an opening measure break if the line writes one, and otherwise with a `-`. Column indices are measured from its first character, so prefixes of differing widths don't skew alignment. |
| **parent frame** | The Figma frame containing all row frames (tablature) or the whole diagram (fretboard). Carries the plugin data. |
| **hyphenspace** | Runs of `-` characters separating note cells in tablature source. Their length does not affect rendered geometry. |
| **string label** | The text naming a string's tuning (`e`, `B`, `G`, ...), rendered as a text node to the left of the diagram. Always rendered: taken from the source line when it supplies one, otherwise from the default tuning for that string count. |
| **fret boundary** | In a fretboard diagram, a vertical line marking the division between two frets. |
| **fret gap** | In a fretboard diagram, the horizontal space between two adjacent fret boundaries — the region in which a dot may be drawn. |

## Naming and UI copy

Three registers of naming, which this document keeps separate.

| Register | Audience | Rule |
| --- | --- | --- |
| **Spec term** | this document | Precise, even when clunky. `traditional tablature`, `slot`, `note cell`, `playable region`. |
| **Identifier** | code, plugin data, messages | The spec term in the codebase's casing: `"tablature"`, `noteGap`, `stringLabelGap`. Identifiers are contracts, so they change only with a schema version. |
| **UI label** | the person using the plugin | What a guitarist would say. Short, no spec vocabulary. |

The governing rule: **no spec internal ever reaches the UI.** A user never sees *slot*, *note cell*, *slot advance*, *playable region*, *row group* or *hyphenspace*, and never sees a diagnostic `code`.
Diagnostics show their `message`, phrased in the user's own text — "`2h` has no fret number on line 3", not `cell-without-value`.

Note the inversion in the first row below: *tab* is a poor spec term because this document also uses "tab" for a UI tab, but it is the right UI label, because that is what guitarists call the notation.

| Concept | Spec term | Identifier | UI label |
| --- | --- | --- | --- |
| Tablature mode | traditional tablature | `"tablature"` | **Tab** |
| Fretboard mode | fretboard diagram | `"fretboard"` | **Fretboard** |
| Gap between a cell and the next slot | note gap | `noteGap` | Note spacing |
| Vertical gap between strings | — | `stringGap` | String spacing |
| Stroke weight of string lines, and on the fretboard also of fret boundaries and marker outlines | — | `strokeWeight` | String weight |
| Text size | — | `fontSize` | Text size |
| Vertical gap between rows | — | `rowGap` | Row spacing |
| Width of a drawn fret | fret gap | `fretGapWidth` | Fret width |
| Leading and trailing frets | fret window | `leadingFrets`, `trailingFrets` | Frets before / after |
| Boundary between measures | measure break | `"break"` | measure line |
| The source field | ASCII tab | `source` | ASCII tab |
| Link to the mode's section of `docs/examples.md` | — | — | examples |
| The folded section holding a mode's settings | — | — | Options |
| Drawing the diagram | render | `"render"` | Render |

Within this document, **tablature** always means the notation and **UI tab** always means the control in the plugin's interface.
Unqualified "tab" is avoided except in the established phrase *ASCII tab*, which names the source format.

## Traditional tablature

This allows you to render traditional guitar tab, where the horizontal axis is time, and the vertical axis is guitar string, with highest on top and lowest on bottom.
Frets are indicated by numbers.

The plugin will convert user-provided ASCII tab into a nicely-formatted set of lines and text, with the string lines broken around the text so that they don't make it hard to read (see [Tablature render model](#tablature-render-model)).
For now, the plugin will only support string lines and note cells, meaning we will not attempt to render fancy notation like slides and hammer-ons: the technique characters inside a cell are rendered as literal text, not as graphics.

### Parsing

Parsing is a pure function from source text to a row/slot structure, independent of geometry: the same parse rendered with different settings differs only in spacing.

**Step 1 — split into rows.** The source is split into *row groups* on blank lines; runs of blank lines count as one separator, and leading and trailing ones are discarded.
Each row group holds one line per string, highest-pitched first.
A row group MUST have 4, 6 or 7 lines (`unsupported-string-count`), and every row group must have the same count, or the rows could not align (`inconsistent-string-count`).

**Step 2 — split each line into prefix and playable region.** Every line has the form `label? whitespace* playable`:

| Part | Definition |
| --- | --- |
| `label` | Optional. A run of characters that are none of `-`, whitespace, `\|`. |
| `whitespace` | Any run of whitespace. Required if a `label` is present, optional otherwise. |
| `playable` | The *playable region*: the rest of the line. It begins with an optional opening measure break — a single `\|` — and then MUST have a `-` before anything else. |

Requiring a hyphen before any note cell is how real-world ASCII tab is written, and it is what makes the label boundary decidable; a line that doesn't fit is a `missing-leading-hyphen` error.
Columns are counted from the start of the playable region, so lines whose prefixes differ in width still align.
Because an opening break sits inside that region, a measure break must appear on every string or none, and an inconsistent one is caught as a misalignment rather than silently shifting a row's columns.

**Step 3 — tokenize.** Within a playable region, a *note cell* is a maximal run of characters other than `-`, whitespace and `|`.
Hyphens and spaces only separate cells, which is why hyphenspace collapses, and trailing whitespace is ignored.
Each cell MUST contain a digit or an `x`/`X`: a digit makes it a fret, and an `x` a muted note, as real-world tab writes them.
Every other character in a cell is technique notation, preserved verbatim in the rendered text.

A `|` is a measure break.
It must be flanked by hyphens unless it begins or ends the region (`measure-break-without-hyphens`), and must appear in the same column on every string of the row group (`misaligned-measure-break`), since a break spans the whole row.
Breaks at the region's edges are **absorbed**: every row is bracketed by an opening and a closing break whether or not the source writes them.

**Step 4 — assign slots.** Cells in a row group belong to the same *slot* when they share a **start column**, and each surviving measure break is a slot of its own; slots are ordered by column.
A note slot is one moment in time: every cell in it is played together.
A break slot holds no cells and has no width; it exists to take up a position, so the spacing rules give it a gap on each side.

Cells meant to sound together are therefore written flush.
A cell whose span overlaps a cell in a *different* slot is an `overlapping-cells` error: it would be simultaneous with both and with neither, and no rendering could honor it.
Deciding slots by start column rather than by overlap is what keeps this rule total, and it means:

- A string that is silent for one chord doesn't shift its later cells into the wrong slot, since identity is by column, not by ordinal position.
- Only slot order reaches the renderer, never absolute columns, so hyphen runs of any length produce identical geometry.

**Step 5 — emit structure.** The parse result is an ordered list of row groups, each holding the labels the source supplied, if any, and its slots in order; each note slot holds at most one cell per string.
Default-tuning labels are filled in by layout, not by the parser, so the parse records only what was written.

### String labels

Every diagram renders a label per string: the source's when it supplies one, otherwise the default tuning for the string count, so a label column is always present.
These rules are shared with the fretboard diagram, which has its own label syntax (see [Fretboard string labels](#fretboard-string-labels)):

- A source label is read verbatim, so any tuning works — `D`, `C#`, `Eb`, or a two-character name.
- A line that supplies no label gets the default tuning for its position: standard bass, guitar or seven-string tuning, from `src/core/settings.ts`.
- A source where some lines carry labels and others don't is a `partial-labels` **error**: the source disagrees with itself about what the strings are, and there is no basis for guessing which half to trust.

### Tablature render model

Lengths are in Figma pixels, and every formula lives in `src/core/tablature/layout.ts` and its tests.
Text measurement and fonts are covered once for both modes in [Text, fonts and measurement](#text-fonts-and-measurement).

#### Node tree

The renderer builds a parent frame, which carries the plugin data, holding one row frame per row group; each row frame holds that row's string labels, string lines, measure breaks and note text.

- The parent uses vertical auto-layout with `rowGap` between rows.
  Row frames position their children absolutely, since text overlaps the string lines' band.
- Layer names are for legibility and debugging, not identity, and indices in them are 0-based.
  A re-render rebuilds every child rather than diffing.
- A new parent frame is centered on the viewport, on the current page, and left selected.

#### Layout

A row is a label column of width `L` — the widest label in that row plus `stringLabelGap` — then a band of evenly spaced string lines, with the note cells along them.
`padY` pads above the first string and below the last, so text centered on an outer string isn't clipped and `rowGap` is the gap the user actually sees.
The fretboard pads the same way.

`L` is computed per row group, so rows whose labels differ in width don't align.
That is deliberate: the rendering respects what the ASCII says rather than imposing a column width.

Each row is bracketed by measure breaks, drawn whether or not the source wrote them.
Each slot advances from the previous one by its widest cell plus `noteGap`, and a break, having no cells, advances by `noteGap` alone.
Two properties follow, and they are why the obvious `x = n × noteGap` is wrong:

- **Slots widen to fit their contents, and the gap stays constant.** The whitespace between a cell and the next slot is exactly `noteGap` however wide the cells are, which is what makes a row read as evenly spaced.
- **Cells are left-aligned.** All cells of one chord begin in the same character column in the source, and centering would stagger them whenever a slot mixes widths.

#### String lines and gaps

Each string line stops short of every note cell on it and resumes after, leaving a gap sized from that cell's own text plus `clearance` on each side, not from the width of its slot.
So a string not played in a slot runs straight through it, and a narrow cell in a wide slot cuts only its own width.
Nothing is drawn in a gap, so the diagram makes no assumption about its background; an opaque rectangle hiding the line behind each cell would show as bars on anything that isn't white.

Measure breaks are vertical lines joining the top and bottom strings, overshooting each by half a stroke so the corners meet cleanly.
Every line is drawn as a rectangle rather than a `LineNode`, for the reason given in [AGENTS.md](../AGENTS.md).

### Tablature render settings

Settings are stored per parent frame, with the source, as plugin data.
Five are user-configurable: `noteGap`, `stringGap`, `rowGap`, `fontSize` (labels and note cells alike) and `strokeWeight`.
`noteGap`'s minimum is what keeps two cells from ever touching.
Defaults, ranges and every fixed constant are in `src/core/settings.ts`, which is also where the UI reads its input ranges.

### Tablature tests

`src/core/tablature/parse.test.ts` and `layout.test.ts` are authoritative for exact slot structures, positions and node counts.
They exercise the rules above with sources of their own, and this document deliberately doesn't list them.

## Fretboard diagram

This mode renders a fretboard diagram, where the horizontal axis is fret number, and the vertical axis is string index.
This allows us to visualize chord shapes and scale shapes that visually reflect the layout of the fretboard.

### ASCII input

The ASCII representation of these diagrams is minimal.
Like with tablature, consecutive lines of ASCII text represent strings from highest to lowest.
The horizontal axis simply represents frets on the fretboard, and the specified frets are whitespace-delimited.

Each line holds an optional leading string label, then zero or more tokens:

| Token | Meaning |
| --- | --- |
| `0` | Play this string open. |
| a positive integer, `1` to `maxFret` | Fret this string at that fret. |
| `x` or `X` | Don't play this string: it is muted. |
| *(empty line)* | This string carries no marker. |

A fret token is a plain integer with no leading zero; anything else, such as `00`, `3.5` or `3x`, is a `bad-token` error rather than a value the plugin guesses at.

The **first** whitespace-delimited token on a line is a string label when it does not begin with a digit and is not `x` or `X`.
So `e 2 3` labels the string `e` and frets 2 and 3, while `3` alone is a fret and `x` alone mutes the string.
Requiring a label not to start with a digit keeps a mistyped fret number a fret number rather than silently becoming a label.
No tuning is named `x`, so a muted marker is never mistaken for a label; a labeled muted string is written `E x`.
Only the first token can be a label; a token anywhere else that is not a fret or a muted marker is a `bad-token` error.

A string is open, fretted or muted, and only one of them: a `0` MUST NOT be combined with a fret number, and an `x` MUST NOT be combined with a `0` or a fret number.
Tokens on a line may appear in any order; duplicates are collapsed.
The number of lines is the string count, which MUST be 4, 6 or 7 (`unsupported-string-count`).
What the parser does with duplicates, out-of-range frets and blank lines is in [Error handling and validation](#fretboard-diagram-1).

See [examples.md](examples.md) for sample sources.

### Fret window

The *window* is the inclusive range of frets `[lo, hi]` the diagram draws.
It is computed from the source frets — tokens of `1` or more, since `0` is not a fret — by buffering the shape on each side:

1. `lo = minSourceFret − leadingFrets` and `hi = maxSourceFret + trailingFrets`.
   A source whose only markers are `0` or `x` has no frets to measure from; it takes `lo = 1`, `hi = minFrets`, and is done.
2. `lo` is clamped to a minimum of `1`: there is no fret 0 to draw, and none below it.
3. If the source contains any `0`, `lo` is forced to `1`, since an open-string marker is drawn relative to the nut.
   A muted marker does **not** force the nut: it says nothing about frets, and forcing it would stretch a muted barre chord high on the neck down to fret 1.
   It sits on the first fret line, which is the nut only when the window reaches it.
4. `hi` is clamped to `maxFret`, for the same reason in the other direction: the window may not extend past the last fret that exists.
5. If the window is narrower than `minFrets`, it is widened — rightward while `hi` is below `maxFret`, then leftward while `lo` is above `1`.

Clamping rather than rejecting means no setting the user can reach produces an error, and a source naming the highest fret still renders at the default settings.
A large `leadingFrets` doubles as a whole-neck view, since it clamps at the nut.
At the default of 1, the nut appears exactly when the shape sits within a fret of it, which is when it carries information; fret labels show absolute fret numbers, so a window without the nut is still unambiguous.

### Fretboard render model

Every formula lives in `src/core/fretboard/layout.ts` and its tests.

A single parent frame, with no auto-layout and no row frames, holds the string labels, fret lines, string lines, markers and fret labels directly, and is sized to fit them.
Re-rendering a frame that was tablature switches its auto-layout off.

- The board starts at `L`, the label column width as in tablature, with fret lines `fretGapWidth` apart and strings `stringGap` apart.
  The first fret line is the **nut**, drawn heavier, but only when the window starts at fret 1.
- Fret labels sit beneath each fret gap rather than each line, so a label is directly under the dots it applies to.
- A **fretted note** is a filled dot centered in its fret gap.
- An **open string** is an outlined disc on the nut.
  Its fill stops the nut and string line at its edge, which is what makes it read as open rather than fretted.
  There is no fret gap for it to sit in, which is why any `0` pulls the window to the nut.
- A **muted string** is a disc in the same place with no outline, carrying an X.
- Markers are drawn after the lines, so the nut can't hide them.
- The open and muted discs' fill assumes a white background, the one place either mode still does; see [Non-goals](#non-goals).

### Fretboard string labels

Labels work as they do in [tablature](#string-labels), with the same `partial-labels` and `unsupported-string-count` errors.
Only the syntax differs: a leading token rather than a prefix before a playable region, as described in [ASCII input](#ascii-input).

### Fretboard render settings

Settings are stored per parent frame, with the source, as plugin data.
Six are user-configurable: `fretGapWidth`, `stringGap`, `strokeWeight` (strings, fret lines and marker outlines), `fontSize` (string and fret labels), and `leadingFrets` and `trailingFrets`, which buffer the [fret window](#fret-window) and are whole numbers.
Defaults, ranges and every fixed constant are in `src/core/settings.ts`.

### Fretboard tests

`src/core/fretboard/parse.test.ts` and `layout.test.ts` are authoritative for exact markers, windows, positions and node counts.
As for tablature, they use sources of their own, and this document doesn't list them.

## Text, fonts and measurement

These rules are shared by both modes.

### Measuring text

Slot widths and the label column depend on measured text, so layout takes a `measure(text, fontSize)` function rather than reaching for a measurement API.
That keeps layout pure and its output deterministic in tests.
In the plugin, `measure` is backed by a Figma text node.
In tests it is an analytic monospace stub from `src/core/measure.ts`, whose ratio is not a font metric: the plugin never renders with it, so its value affects only the tests' arithmetic.

### Fonts and text nodes

Every text node is created through one helper, `src/plugin/font.ts`, so these hold in both modes:

- The font is `Roboto Mono`, falling back to `Roboto`, which Figma always has.
  It is resolved once per render and used for both measurement and drawing, since measuring in one font and drawing in another would get every width wrong without failing.
- Line height is pinned to the font size, so a text node's height is predictable rather than a font metric.
- Vertical centering is on the em box, so glyphs sit marginally high.
  That is accepted rather than corrected with a font-specific nudge.

## Persistence and re-edit

Both modes render into a parent container frame that stores its own ASCII source and render settings as plugin data, so a generated diagram can be re-edited in place.

### Plugin data keys

*Authoritative: `src/core/pluginData.ts` for the keys and the decoding, `src/plugin/pluginData.ts` for the I/O.*

Written with `node.setPluginData` on the parent frame — **private** plugin data, not shared plugin data.
A frame stores four keys: `schemaVersion`, `mode`, `source` and `settings`.
They live in users' documents, so they are a contract: renaming, removing or reinterpreting one needs a schema version bump.
Figma stores only strings, so the version is a decimal string and the settings are JSON.

A frame is recognized as ours when its version and mode are readable **and it carries a source**.
A frame of ours with no source has nothing to edit, so it is treated as unreadable: reported as if nothing were selected, with a notice telling the user.

No other node carries plugin data.

### Schema versioning

- On read, a `schemaVersion` **lower** than the current version is upgraded through a chain of migration functions, one per version step, before the data is used.
- A `schemaVersion` **higher** than the current version MUST NOT be edited.
  The UI reports that the frame was made by a newer version of the plugin and offers no re-render.
- Within a version, unknown keys in `settings` are ignored and missing keys fall back to that setting's default, so adding a setting does not require a version bump.
  Settings that will not parse at all are simply every key missing, so they degrade to defaults rather than making the frame unreadable.
- A stored value that is *out of range* is loaded as written, not silently corrected, so the clamp reports it.
  Quietly fixing hand-edited data on the way in would hide the one thing `setting-out-of-range` exists to say.

### In-place edit flow

1. On launch and on every `selectionchange`, the plugin inspects the selection and reports one of the three `SelectionState` cases to the UI.
   The three cases are exhaustive, and the UI has a mode for each:

   | Selection | `SelectionState` | UI |
   | --- | --- | --- |
   | A single frame with readable plugin data this version supports | `editable` | **Edit mode**: activates that frame's mode, populates source and settings from the stored values |
   | A single frame whose `schemaVersion` is newer than this plugin | `unsupported-version` | Reports that the frame was made by a newer version, and offers no re-render |
   | Anything else — nothing selected, several nodes, a node without plugin data, or a frame of ours whose stored source is unreadable | `none` | **Create mode**: on launch, settings start from the user's last-used values for each mode (see below), and the source starts empty — a source is only ever restored from a selected frame's plugin data, in edit mode; later in a session the editor keeps whatever it holds. An unreadable frame of ours also raises a `figma.notify`, since the user is looking at something the plugin made and declining to load it |

2. `init.command` is `"edit"` only when the selection is `editable`; a relaunch button can sit on a frame from a newer version, so the UI trusts `selection`, not the command.

3. **A selection that carries a diagram replaces the editor's contents, discarding unsaved edits.** Selecting an `editable` frame loads its source and settings over whatever the user had typed, with no prompt and no confirmation.
   The plugin keeps no dirty flag and tracks no unsaved state: a frame's plugin data is the source of truth, sources are usually pasted from elsewhere, and a confirmation flow would add more state machinery than the loss is worth.

4. **A selection that carries no diagram leaves the editor alone.** `none` and `unsupported-version` have nothing to load, so they change only what a render would do, not what the editor holds.
   This is what keeps a stray click on empty canvas from wiping a source the user is part-way through typing.

5. The render target follows the selection: `existing` with that frame's id while an `editable` frame is selected, and `new` while the selection is `none`.
   So editing a frame, then deselecting it, then rendering creates a second frame with the same content — a render always acts on what is selected now.
   The same holds across modes: rendering from the other mode's UI tab while a frame is selected converts that frame to the active mode.

   **Every successful render selects the frame it drew**, new or existing, and that selection change runs through step 1 like any other.
   The frame now holds readable plugin data, so the selection becomes `editable` and step 3 loads the stored diagram back into the editor.
   Two consequences follow.
   A render from create mode leaves the plugin in edit mode, so the next render updates that frame rather than creating another; deselecting is how the user starts a new one.
   And the editor shows what was stored rather than what was typed: settings come back clamped, so an out-of-range value the user entered is replaced by the value actually rendered.

   While an `unsupported-version` frame is selected, **rendering is unavailable** and the render button is disabled.
   The alternative — letting the render fall through to a `new` frame — would answer "I can't edit this one" by silently producing a different diagram somewhere else.
   Deselecting the frame is how the user gets back to creating one.
6. Re-rendering in edit mode **replaces all children** of the existing parent frame, then rewrites its plugin data.
   The frame's own id, name, position and parent are preserved, so the diagram keeps its place in the document and inbound references survive.
   Its layout properties are not: they are reset as for a new frame, as described in [Override policy](#override-policy).
7. Generated frames carry an **Edit** relaunch button in Figma's design panel, declared in the manifest.
   On relaunch the plugin resolves the selection as in step 1.

### Override policy

Manual edits to the *contents* of a generated frame — moving a text node, restyling a line, adding a child — are discarded on the next re-render, because step 6 replaces children wholesale.
This is deliberate: the plugin data is the source of truth, and diffing hand edits against regenerated geometry is out of scope.
Nothing inspects the existing subtree before a re-render: the plugin discards every child and renders afresh from the parsed source, so neither half needs to know what was there.

Edits to the parent frame itself are preserved only where the render doesn't set that property.
Position, name, rotation, opacity, effects and locking are kept.
Fill, clipping and padding are reset on every re-render — no fill, clipping on, zero padding — because both modes' geometry assumes them.
So is the frame's layout, which belongs to the mode being rendered: tablature turns on vertical auto-layout with `rowGap` as its spacing and hugs its rows, and fretboard turns auto-layout off and resizes the frame to the scene's extent.
A user's own auto-layout, spacing or sizing on the parent is therefore discarded, as is anything a conversion from the other mode left behind.

### Last-used settings

Settings for *new* diagrams are per-user, not per-document, and are stored in `figma.clientStorage` under `defaults:tablature` and `defaults:fretboard`.
The sandbox writes them itself as part of handling a `render`, taking the settings from the `Diagram` it was given.
There is no separate message for saving them: a render is the only moment at which the user has expressed a preference, so a second mechanism would only be a way for the two to disagree.
They are never read for a frame that already has plugin data — that frame's own stored settings always win.

## UI and sandbox protocol

A Figma plugin runs in two halves: the React UI in an iframe and the plugin code in Figma's sandbox, which alone can touch the document.
They communicate only by message passing, so the message union below is a contract both halves compile against.
It lives in one shared module and neither half defines its own copy.

The **parser** is pure TypeScript with no Figma dependency and is imported by both halves: the UI runs it on every keystroke to show diagnostics, and the sandbox runs it again as the authority for what gets rendered.
Settings validation works the same way.

**Layout is the sandbox's job alone.** The UI never runs layout, never measures text and never precomputes geometry, so there is nothing for the two halves to disagree about.
Diagnostics are measurement-independent, which is why the UI can predict every `render-failed` without knowing a thing about font metrics.

*Authoritative: `src/core/protocol.ts`, which holds the message union, `Diagram`, `Defaults` and `SelectionState`. The rules below are normative.*

UI to sandbox: `ui-ready`, sent once when the React tree mounts; `render`, carrying a `Diagram` and a target that is either a new frame or an existing frame's id; and `resize`, carrying the form's rendered height, sent whenever it changes so the window hugs the form.
The sandbox keeps the window's width fixed and sets its height from that message, clamped so a long list of diagnostics can't push it off screen.

Sandbox to UI: `init`, the reply to `ui-ready`, carrying how the plugin was launched, the per-user defaults and the current selection; `selection`, pushed on every selection change; and `render-done` or `render-failed`, the latter carrying a user-facing message and the offending error diagnostics, if any.

`SelectionState` is one of three cases — nothing editable selected, a recognized generated frame, or a generated frame whose `schemaVersion` is newer than this plugin supports — and what each means for the UI is described in [In-place edit flow](#in-place-edit-flow).

Rules:

- The sandbox never pushes unsolicited state before receiving `ui-ready`; the iframe may not be mounted yet.
- `render` is idempotent: sending it twice with identical payloads for an `existing` target produces the same node structure and properties.
  Node ids are not stable across renders, since every child is rebuilt.
- The UI MUST NOT block its own input on a round trip.
  Validation shown while typing comes from the local parser, not from a sandbox reply.
- Every message carries a `Diagram` rather than a loose mode and settings pair, so a fretboard can't be paired with tablature settings.
- A receiver narrows on a message's `type` before trusting its payload, since `postMessage` delivers `unknown`.
  Settings arriving over the wire are clamped regardless, so a hand-crafted message cannot put an out-of-range value into a render.

## Error handling and validation

Validation runs in the pure parser, so the UI and the sandbox reach identical verdicts.
A **warning** renders anyway; an **error** blocks rendering.

*Authoritative for the diagnostic type itself: `src/core/diagnostics.ts`; for each mode's codes and anchors, that mode's parser and its tests. Severities, and the reasoning for them, are normative.*

A diagnostic carries a severity, a stable `code`, a one-sentence user-facing `message`, and, where possible, an anchor: a line, and optionally a column and length.
A diagnostic about a setting has no anchor, since it is wrong whatever the source says.
The anchor is what lets the UI select the offending text when a diagnostic is clicked, so a code that *can* name a precise run should.

### Settings validation

Every setting's range is in `src/core/settings.ts`.
Those ranges are enforced in three places, deliberately overlapping:

1. **The UI control** carries the range as `min`, `max` and `step` on its number input, so the normal path cannot produce an out-of-range value.
2. **`src/core/`'s settings module clamps** any value outside its range when settings arrive from anywhere — a `render` message, stored plugin data, or `clientStorage` — and raises `setting-out-of-range`.
   This is the backstop for the UI constraint being wrong, for plugin data written by a buggy or hand-edited version, and for a stored value whose range has since narrowed.
3. **Constraints that span several values** cannot be expressed as a per-field range.
   The fret window is the case that tempted one: its span depends on the source as much as on `leadingFrets` and `trailingFrets`.
   It is resolved by clamping in the [fret window](#fret-window) computation instead of by a diagnostic, which is the better answer wherever a sensible value exists — a setting the user can reach should not be able to produce an error.

A setting that counts something — `leadingFrets` and `trailingFrets`, which count frets — is also rounded to a whole number there, with the same warning, since half a fret would give the [fret window](#fret-window) a fractional edge.
Settings that measure a distance are not rounded: a fractional `fretGapWidth` is a perfectly good width.

Clamping is a warning rather than an error because it always yields a sensible render.
A value that cannot be clamped — a missing key, or one whose type is wrong — falls back to that setting's default, as [Schema versioning](#schema-versioning) describes.

### Shared

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
| `empty-source` | Source is empty or whitespace only | error | Never shown, since an empty field explains itself; it exists to disable the render button and to stop parsing before other diagnostics misdescribe the empty source |
| `tab-character` | Source contains a horizontal tab | error | Tabs make column alignment unknowable; the message tells the user to use spaces |
| `source-too-large` | Source exceeds the size cap | error | Keeps the serialized plugin data well inside Figma's per-key limit |
| `partial-labels` | Some lines carry a string label and others don't | error | The source disagrees with itself about the strings; nothing is assumed |
| `unsupported-string-count` | The string count is not 4, 6 or 7 | error | The plugin supports bass, guitar and seven-string guitar; any other count has no default tuning, and the spec's "a label for every string" invariant would not hold |
| `setting-out-of-range` | A settings value falls outside its range, or a whole-number setting holds a fraction | warning | Clamped to the nearest end of the range, and the render proceeds |

### Traditional tablature

Every tablature diagnostic is an error.
The source either describes a tab that can be drawn or it doesn't, and none of these conditions has a sensible thing to fall back to — which is the distinction that keeps this list free of warnings.
`src/core/tablature/parse.ts` and its tests are authoritative for the codes and their anchors; what follows is why each condition is rejected rather than accommodated.

- A line whose playable region doesn't begin with `-`, or whose label isn't followed by a separator, has no decidable label boundary — see [step 2](#parsing).
- Row groups with differing line counts are almost always a paste error, and the rows could not be aligned if they were drawn.
- A note cell holding neither a digit nor an `x` — `h` or `~` alone — names nothing to play.
- A cell straddling two slots describes a simultaneity no renderer could honor; [step 4](#parsing) works the case through.
- Caps on slots per row group and on row groups per source guard against pathological render times.
- A row group with no slots at all has nothing to render, and the row width formula has no last slot to measure from. A row of nothing but measure breaks is fine: it has positions to draw.
- A `|` that is not flanked by hyphens is abutting a note cell or another pipe, and there is no reading of it as a boundary.
- A `|` on some strings but not all cannot be a measure break, since a break spans the row. It is also how an inconsistent *opening* break is caught, which would otherwise shift one string's columns relative to the rest.

### Fretboard diagram

Blank lines are **significant** in this mode: a blank line is a string with no marker, not a group separator.
Trailing blank lines are trimmed; a leading blank line is a markerless first string.
That makes a stray leading newline indistinguishable from an intentional markerless top string: a 6-line source with one extra leading newline is a perfectly valid 7-string source, so the string-count check cannot catch it.
Hence `leading-blank-line` below — it renders either way, but says what it assumed.

`src/core/fretboard/parse.ts` and its tests are authoritative for the codes and their anchors; what follows is why each condition is handled as it is.

- A token other than a leading string label that is not `0` or a positive integer is an error at that token. Guessing at `3.5` or `3x` would draw a dot the user didn't write.
- A line combining `0` with a fret number is an error: a string is either open or fretted.
- A line combining `x` with a `0` or a fret number is an error at the `x`: a muted string isn't played.
- A line repeating a fret, `0` or `x` is a **warning**, and the repeat is collapsed. Both copies mean the same thing, so there is a sensible render.
- A source where no line carries any marker is an error, since there is nothing to draw. It stays quiet when a line wrote a marker that failed to parse, which already has its own error.
- A leading blank line is a **warning**, taken as a markerless first string, because the string-count check cannot catch a stray newline.
- A fret past `maxFret` is an error, and the only fret rejection: the window itself is clamped rather than rejected.

### Presentation

- The UI lists the current diagnostics beneath the source field, errors first, each showing its message and, where possible, its line number.
  Clicking one selects the offending range in the source field.
- The render button is disabled while any diagnostic has severity `error`, and while the selection is `unsupported-version`.
- Settings controls carry their documented range as input attributes, which makes out-of-range values unreachable by normal use without being the only thing preventing them; see [Settings validation](#settings-validation).
- The sandbox re-validates on `render` and replies `render-failed` if any error is present, rather than trusting the UI.
  A `render-failed` that the UI did not predict is a bug, and the message says so.
- The one `render-failed` the UI cannot predict, and which is not a bug, is an `existing` target that is no longer renderable.
  Between selecting a frame and clicking render, the frame may have been deleted, or changed so it is no longer a generated frame this version can draw into.
  The sandbox then refuses rather than quietly creating a new frame elsewhere, and replies with a message saying the diagram is gone and suggesting the user deselect it to create a new one.
  This reply carries no diagnostics, since nothing is wrong with the source.
- Figma's own `figma.notify` is used only for outcomes the user sees outside the iframe, such as a successful render or an unreadable selection.

## Non-goals

Everything here is deliberately excluded, not overlooked.
An implementation that adds any of it is doing unrequested work.

### Out of scope permanently

| Not building | Why |
| --- | --- |
| Technique notation as graphics — curved slurs for hammer-ons, arrows for slides, bends drawn as hooks | Technique characters render as literal text inside the note cell. Graphical notation is a typesetting project, not a layout plugin. |
| Rhythm, note durations, stems, beams, time signatures | ASCII tab carries no duration information to render. |
| Round-tripping edited Figma nodes back into ASCII | The plugin data is the source of truth; see [Override policy](#override-policy). |

### Not in v1

| Deferred | Note |
| --- | --- |
| Fretboard open and muted markers on backgrounds that are not white | The discs' fill shows as white on anything that isn't white. The fix is a theme-aware fill, or cutting the lines around each disc as tablature does. |
| Color and theme settings | `inkColor` is fixed black. Exposing stroke and text color is a settings-table addition and a schema-compatible change. |
| Fretboard position label (`5fr` style) | Every drawn fret is labeled instead. |
| Finger numbers inside fretboard dots | Would need new ASCII syntax. |
| Barre indicators | Same. |
| Multi-string-count sources in one tablature render | Currently `inconsistent-string-count`, an error. |
