# Specification

Normative specification for the figma-guitar-tab plugin.
See [../README.md](../README.md) for orientation and [../AGENTS.md](../AGENTS.md) for engineering conventions.

## Glossary

Terms are used with these meanings throughout this document.
Note in particular that *string* and *fret* are distinct: a number appearing in ASCII source is always a fret number, and the string it applies to is determined by which line it appears on.

| Term | Meaning |
| --- | --- |
| **string** | One of the guitar's strings. Identified by its **string index**: line 1 of a group of ASCII lines is the highest-pitched string, and the last line is the lowest-pitched. Rendered as a horizontal line node in both modes. |
| **fret number** | A position along a string, counted from the nut. `0` means the open string. This is what the numbers in ASCII source denote. |
| **note cell** | The text occupying one slot on one string: a run of ASCII characters denoting what is played there — a bare fret number (`4`), or one decorated with technique notation (`4/6`, `2h3p2`). A cell may encode more than one note. Its rendering is a single text node. |
| **slot** | One moment in time in a tablature row: the note cells played simultaneously, at most one per string. Slots are ordered left to right and are the unit of horizontal position — which cells share a slot is decided by column overlap, not by ordinal position. |
| **slot advance** | The horizontal distance from one slot's left edge to the next slot's left edge, written `A(n)`. Borrowed from typography, where a glyph's advance is the distance from its origin to the next glyph's. It is not constant: a slot advances by `slotPitch` unless its widest cell needs more room, in which case the slot widens to fit. |
| **row** | A horizontal band of tablature containing one set of string lines. A tab too long to fit one line of ASCII is split across several rows. |
| **row frame** | The Figma frame holding one row's line nodes and text nodes. |
| **row group** | The block of source lines that produces one row: the lines between two blank lines, one line per string. *Row* is the rendered band, *row group* its source. |
| **playable region** | What remains of a source line after its string label and any leading whitespace or pipes are stripped. Column indices are measured from its first character, so prefixes of differing widths don't skew alignment. |
| **parent frame** | The Figma frame containing all row frames (tablature) or the whole diagram (fretboard). Carries the plugin data. |
| **hyphenspace** | Runs of `-` characters separating note cells in tablature source. Their length does not affect rendered geometry. |
| **string label** | Optional text at the start of a source line naming the string's tuning (`e`, `B`, `G`, ...), rendered as a text node when present. |
| **fret boundary** | In a fretboard diagram, a vertical line node marking the division between two frets. |
| **fret gap** | In a fretboard diagram, the horizontal space between two adjacent fret boundaries — the region in which a dot may be drawn. |

## Naming and UI copy

Three registers of naming, which this document keeps separate.

| Register | Audience | Rule |
| --- | --- | --- |
| **Spec term** | this document | Precise, even when clunky. `traditional tablature`, `slot`, `note cell`, `playable region`. |
| **Identifier** | code, plugin data, messages | The spec term in the codebase's casing: `"tablature"`, `slotPitch`, `cellGap`. Identifiers are contracts, so they change only with a schema version. |
| **UI label** | the person using the plugin | What a guitarist would say. Short, no spec vocabulary. |

The governing rule: **no spec internal ever reaches the UI.** A user never sees *slot*, *note cell*, *slot advance*, *playable region*, *row group* or *hyphenspace*, and never sees a diagnostic `code`.
Diagnostics show their `message`, phrased in the user's own text — "`2h` has no fret number on line 3", not `cell-without-digit`.

Note the inversion in the first row below: *tab* is a poor spec term because this document also uses "tab" for a UI tab, but it is the right UI label, because that is what guitarists call the notation.

| Concept | Spec term | Identifier | UI label |
| --- | --- | --- | --- |
| Tablature mode | traditional tablature | `"tablature"` | **Tab** |
| Fretboard mode | fretboard diagram | `"fretboard"` | **Fretboard** |
| Minimum slot advance | slot pitch | `slotPitch` | Note spacing |
| Vertical gap between strings | — | `stringGap` | String spacing |
| String line stroke weight | — | `strokeWeight` | String weight |
| Text size | — | `fontSize` | Text size |
| Vertical gap between rows | — | `rowGap` | Row spacing |
| Width of a drawn fret | fret gap | `fretGapWidth` | Fret width |
| Fret window mode | fret window | `windowMode` | Fret range: **Full neck** / **Custom** |
| Leading and trailing frets | — | `leading`, `trailing` | Frets before / after |

Within this document, **tablature** always means the notation and **UI tab** always means the control in the plugin's interface.
Unqualified "tab" is avoided except in the established phrase *ASCII tab*, which names the source format.

## Modes

The plugin has two modes, each occupying its own UI tab.

## Traditional tablature

This allows you to render traditional guitar tab, where the horizontal axis is time, and the vertical axis is guitar string, with highest on top and lowest on bottom.
Frets are indicated by numbers.

The plugin will convert user-provided ASCII tab into a nicely-formatted set of line nodes and text nodes, with the string lines broken around the text so that they don't make it hard to read (see [Tablature render model](#tablature-render-model)).
For now, the plugin will only support string lines and note cells, meaning we will not attempt to render fancy notation like slides and hammer-ons: the technique characters inside a cell are rendered as literal text, not as graphics.

### Parsing

Parsing is a pure function from source text to a row/slot structure.
It is independent of geometry: the same parse result rendered with different settings differs only in spacing.

**Step 1 — split into rows.** The source is split into *row groups* on blank lines (lines containing only whitespace).
Runs of consecutive blank lines count as one separator, and leading/trailing blank lines are discarded.
Each row group SHOULD contain exactly six lines, one per string, ordered highest-pitched first.

**Step 2 — strip each line's prefix.** A line may begin with a string label followed by whitespace and/or pipe characters, in any order (see [String labels](#string-labels)).
Everything up to and including that prefix is removed; what remains is the line's *playable region*.
Column indices in step 4 are measured from the first character of the playable region, so lines whose prefixes differ in width (`e |`, `B|`) still align.

**Step 3 — tokenize.** Within a playable region, a *note cell* is a maximal run of characters that are none of: `-`, whitespace, `|`.
Hyphens, spaces and pipes carry no meaning beyond separating cells, which is why hyphenspace collapses (TC-2).
Each cell MUST contain at least one digit; a cell that does not is a validation error.
All other characters in a cell are technique notation and are preserved verbatim in the rendered text.

**Step 4 — assign slots.** Each cell has a column span `[start, start + length)` within its playable region.
Two cells in the same row group belong to the same *slot* if their spans overlap, and slot membership is the transitive closure of that relation.
Slots are ordered by their lowest start column.
A slot represents one moment in time: every cell in it is played simultaneously.

Consequences worth stating explicitly, since they are the cases that break naive implementations:

- Slot identity is decided by **column overlap, not by ordinal position** within a string.
  A string that is silent for one chord does not shift its later cells into the wrong slot (TC-5).
- A multi-character cell occupies its full column span, so cells that begin after it on other strings land in a **later** slot (TC-3).
- Absolute column values never reach the renderer — only slot ordering — so hyphen runs of any length produce identical geometry (TC-2).

**Step 5 — emit structure.** The parse result is an ordered list of row groups; each row group holds its optional string labels and its ordered list of slots; each slot holds at most one cell per string index.

Rendering maps this structure to a parent frame containing one *row frame* per row group.
Each row frame contains one string line node per source line, at even vertical spacing, and one text node per note cell, left-aligned at its slot's left edge and vertically centered on its string's line.
Slot widths are not uniform — a slot is as wide as its widest cell needs — so slot positions accumulate left to right rather than being a multiple of a fixed pitch.
Node geometry, masking and defaults are specified in the [tablature render model](#tablature-render-model).

### String labels

By default, string names are not provided.
However, if the source ASCII provides string names, the plugin should render those as text nodes as well (TC-4).
The plugin should just read the string labels literally, to allow for alternate tunings.

A prefix is treated as a string label when the characters before the playable region include at least one character that is not whitespace and not `|`.
Pipes and whitespace alone are superfluous prefix characters: they don't contribute anything to rendering, but since they are conventions of tablature writing, we accommodate their presence (TC-6).

Pipe characters appearing *inside* the playable region are currently ignored rather than rendered as bar lines.
See [Non-goals](#non-goals).

### Tablature render model

All lengths are in Figma pixels.
Symbols below refer to the settings table in [Tablature render settings](#tablature-render-settings).

#### Node tree

```
Frame  "Guitar Tab"                 ← parent frame; carries the plugin data
├─ Frame  "Row 1"
│  ├─ Text  "Label e"               ← only when the source supplies string labels
│  ├─ …                               (one per string, top to bottom)
│  ├─ Line  "String 1 seg 1"        ← one or more segments per string
│  ├─ Line  "String 1 seg 2"
│  ├─ …
│  └─ Text  "Slot 3 String 2"       ← one per note cell; characters verbatim
└─ Frame  "Row 2"
   └─ …
```

- The parent frame uses vertical auto-layout with `itemSpacing` = **rowGap**, no padding, and no fill.
  Row frames are absolutely positioned internally (text overlaps the string lines' band), have no fill, and are resized to their computed extent.
- Layer names are for legibility and debugging, not identity: a re-render rebuilds the row frames wholesale rather than diffing them.
  Persistence and re-edit are specified in [Persistence and re-edit](#persistence-and-re-edit).
- A newly generated parent frame is placed at the center of the current viewport and left selected.

#### Coordinates

Let `N` be the number of slots in a row, `S` the number of strings in the row group (normally 6; see [Error handling and validation](#error-handling-and-validation)), `i` the 0-based string index from the top, and `n` the 0-based slot index.

| Quantity | Formula |
| --- | --- |
| Label column width `L` | `0` when no labels; otherwise `max(labelTextWidth) + labelGap` |
| String line `y` | `fontSize / 2 + clearance + i × stringGap` |
| Row height | `fontSize + 2 × clearance + (S − 1) × stringGap` |
| Cell width `W(n)` | the widest measured text width among slot `n`'s cells |
| Slot advance `A(n)` | `max(slotPitch, W(n) + cellGap)` — the distance from slot `n`'s left edge to slot `n + 1`'s |
| Slot left edge `X(n)` | `X(0) = L + slotPitch / 2`; `X(n) = X(n − 1) + A(n − 1)` |
| Row width | `X(N − 1) + W(N − 1) + slotPitch / 2` |
| Note cell text node | left edge at `X(n)`, vertically centered on its string's `y` |
| Label text node | right-aligned to `x = L − labelGap`, centered on its string's `y` |

The half-pitch lead-in and tail-out reproduce the leading and trailing hyphens of conventional ASCII tab.

Two properties of this model are worth stating, because the obvious simpler formula (`x = n × slotPitch`) breaks on the spec's own examples:

- **Slots widen to fit their contents.** `slotPitch` is a *minimum* advance, not a fixed one.
  A cell like `2h3p2` measures about 36 px at the default 12 px Roboto Mono, which is wider than the 24 px default pitch, so its slot advances by `W + cellGap` instead.
  Without this, a long cell overlaps its neighbor's text and its clearance interval erases string segments that belong to the next slot (TC-3, TC-7).
- **Cells are left-aligned, not centered.** Every cell in a slot starts at the same `X(n)`, which is what the ASCII source shows: all cells of one chord begin in the same character column.
  Centering would stagger them whenever a slot mixes widths — a `10` and a `5` on different strings would no longer line up (TC-7).
  Text nodes therefore use left horizontal alignment and are positioned by their left edge, never by a center point.

#### String lines and text clearance

Each string is drawn as one or more horizontal `LineNode`s rather than a single line, so text sits in a real gap:

1. For each note cell text node on string `i`, compute its clearance interval `[X(n) − clearance, X(n) + w + clearance]`, where `w` is that cell's measured text width.
2. Merge overlapping intervals.
3. Draw a segment across each remaining span of `[L, rowWidth]`, skipping spans shorter than `1`.

Segments carry a stroke of **strokeWeight** in **inkColor**, with no caps.

This supersedes any masking approach.
A knockout group or an opaque rectangle behind each text node would also hide the line, but both assume an opaque background and render incorrectly when the tablature is placed over artwork; segmenting is correct on any background and produces a flat node tree.

#### Measuring text

Slot widths depend on measured text, so layout cannot be computed from the parse result and settings alone.
Layout therefore takes a `measure(text, fontSize) => width` function as a parameter rather than reaching for a measurement API itself.
This keeps layout a pure function and keeps its output deterministic in tests.

- `src/core/` provides the default implementation: an analytic monospace measure, `width = text.length × fontSize × advanceRatio`.
  `advanceRatio` is one character's advance width as a fraction of the font size, which is `0.6` for Roboto Mono.
  This is the typographic sense of *advance* — per character — and is unrelated to a slot's advance.
  Tests and the UI's live preview use this one.
- The sandbox MAY supply a Figma-backed measure instead, which it implements by setting the characters on one reusable hidden `TextNode` and reading its `width`, then removing it after the render.
  It MUST do so when the font fell back to proportional `Roboto`, where the analytic measure is wrong.
- Both measures are monotonic in `text.length`, so a cell is never narrower than the pitch calculation assumed.

#### Fonts

Text nodes use **fontFamily** at **fontSize** in **inkColor**.
The font MUST be loaded with `figma.loadFontAsync` before any text node is created or its characters are set.
The default family is `Roboto Mono` Regular, falling back to `Roboto` Regular if the former fails to load — `Roboto` is always available in Figma.

### Tablature render settings

Settings are per-parent-frame and stored with the ASCII source as plugin data on the parent frame.

| Setting | Meaning | Default | Range |
| --- | --- | --- | --- |
| `slotPitch` | Minimum horizontal advance from one slot to the next; wider cells push their slot out | `24` | 4–200 |
| `strokeWeight` | Stroke weight of string lines | `1` | 0.25–8 |
| `stringGap` | Vertical gap between strings | `14` | 4–200 |
| `fontSize` | Font size of text | `12` | 4–200 |
| `rowGap` | Vertical gap between rows | `32` | 0–400 |

Fixed for v1, not user-configurable:

| Constant | Value | Notes |
| --- | --- | --- |
| `clearance` | `2` | Padding between text and the string-line segments around it |
| `cellGap` | `4` | Minimum whitespace between a cell and the start of the next slot |
| `labelGap` | `8` | Space between the string-label column and the string lines |
| `inkColor` | `#000000` | Lines and text |
| `fontFamily` | `Roboto Mono` Regular | Falls back to `Roboto` Regular |

### Tablature test cases

These are normative: the parser's unit tests SHOULD use these inputs by name.

**TC-1 — multiple rows.** Renders as two row frames, each with six line nodes.

```
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-

-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
-1-2-3-4-5-
```

**TC-2 — hyphenspace collapses.** These two row groups MUST parse to identical slot structures and therefore render with identical geometry (three slots each).

```
-2--0---0-
-2--1---0-
-0--0---0-
-0--2---2-
-2--3---2-
-3--3---0-

-2-0-0-
-2-1-0-
-0-0-0-
-0-2-2-
-2-3-2-
-3-3-0-
```

**TC-3 — long note cells.** A hammer-on-pull-off on the 2nd string, played simultaneously with a single note on the 1st string, followed by a chord of open strings.
Two slots: `2h3p2` spans columns 1–5, so both zeroes at column 7 land in the second slot and render to the right of it.
Slot 0 advances by `W(0) + cellGap` rather than `slotPitch`, since `2h3p2` is wider than the default pitch; assert that the second slot's zeroes start clear of the first slot's text, not merely one pitch along.

```
-3-----0-
-2h3p2-0-
---------
---------
---------
---------
```

**TC-4 — string labels.** Six label text nodes are rendered; labels are read literally so alternate tunings pass through unchanged.

```
e -----
B -----
G -1---
D -2---
A -2---
E -----
```

**TC-5 — sparse strings.** Three slots.
The `2` on the 4th string belongs to the second slot, not the first: ordinal alignment within a string would wrongly make it simultaneous with the first chord.

```
-0---0-
-------
-------
---2---
-------
-3---3-
```

**TC-6 — superfluous prefix characters.** Parses identically to TC-4 with the labels still recognized, and identically to a bare row group when labels are absent.

```
e |-----
B |-----
G |-1---
D |-2---
A |-2---
E |-----
```

**TC-7 — mixed cell widths and slot widening.** Three slots: `{10, 5, 3}`, `{12b14}`, `{7, 0}`.

```
-10-12b14----7-
-5-----------0-
---------------
---------------
---------------
-3-------------
```

Slot 0 mixes a two-character and two one-character cells, and all three share one left edge.
Slot 1's cell is wider than `slotPitch`, so that slot advances by `W + cellGap` and slot 2 starts clear of it.
At the default settings with the analytic monospace measure (7.2 px per character), the expected values are:

| `n` | cells | `W(n)` | `A(n)` | `X(n)` |
| --- | --- | --- | --- | --- |
| 0 | `10`, `5`, `3` | 14.4 | 24 | 12 |
| 1 | `12b14` | 36 | 40 | 36 |
| 2 | `7`, `0` | 7.2 | 24 | 76 |

Row width is 95.2. Assert these accumulated positions, not multiples of `slotPitch`.

## Fretboard diagram

This mode renders a fretboard diagram, where the horizontal axis is fret number, and the vertical axis is string index.
This allows us to visualize chord shapes and scale shapes that visually reflect the layout of the fretboard.

### ASCII input

The ASCII representation of these diagrams is minimal.
Like with tablature, consecutive lines of ASCII text represent strings from highest to lowest.
The horizontal axis simply represents frets on the fretboard, and the specified frets are whitespace-delimited.

Each line holds zero or more tokens:

| Token | Meaning |
| --- | --- |
| `1`–`24` | Fret this string at that fret. |
| `0` | Play this string open. |
| `x` or `X` | This string is muted / not played. |
| *(empty line)* | This string carries no marker. |

A line MUST contain at most one `0` or `x`, and a `0`/`x` MUST NOT be combined with a fret number on the same string.
Tokens on a line may appear in any order; duplicates are collapsed.
A group SHOULD contain exactly six lines.

For example, a G-major scale layout might look like this:

```
2 3
3 5
2 4 5
2 4 5
2 3 5
3 5
```

A G-major open chord might look like this:

```
3
3
0
0
2
3
```

### Fret window

The *window* is the inclusive range of frets `[lo, hi]` the diagram draws.
It is computed from the source frets (tokens `1`–`24` only; `0` and `x` are not frets) under one of two modes:

- **Default mode** — `lo = 1` and `hi = maxSourceFret`.
  The diagram always starts at the nut and extends to the highest fret in the source.
- **Custom mode** — `lo = minSourceFret − leading` and `hi = maxSourceFret + trailing`, where `leading` and `trailing` are user-supplied fret counts.

Then, in both modes:

1. `lo` is clamped to a minimum of `1`; no compensating widening is applied on the right.
2. If the source contains any `0` or `x`, `lo` is forced to `1`, since open and muted markers are drawn relative to the nut.
3. The window is widened rightward until it spans at least `minFrets` frets.

Worked examples, with `minFrets = 4`:

| Source frets | Mode | Window |
| --- | --- | --- |
| `2,3,4,5` | default | 1–5 |
| `3` (open chord, contains `0`) | custom, leading 1, trailing 1 | 1–4 (rule 2, then rule 3) |
| `7,9,10` | custom, leading 2, trailing 1 | 5–11 |
| `2,3` | custom, leading 3, trailing 0 | 1–4 (rule 1, then rule 3) |

### Fretboard render model

Let `M = hi − lo + 1` be the number of frets drawn.
*Fret boundary `j`* (for `j = 0…M`) is the vertical line at the left edge of fret `lo + j`, so boundary `M` is the right edge of the last fret.
Boundary `0` is the **nut** when `lo = 1`.

#### Node tree

```
Frame  "Fretboard Diagram"          ← parent frame; carries the plugin data
├─ Line     "Nut"                   ← boundary 0 when lo = 1; otherwise "Fret Boundary 0"
├─ Line     "Fret Boundary 1"
├─ …
├─ Line     "String 1"              ← one per string, top to bottom
├─ …
├─ Ellipse  "Dot String 4 Fret 2"   ← filled disc, one per fretted note
├─ Ellipse  "Open String 3"         ← unfilled ring left of the nut
├─ Text     "Mute String 6"         ← the character × left of the nut
└─ Text     "Fret Label 2"          ← one per drawn fret
```

#### Coordinates

`S` is the number of strings, `i` the 0-based string index from the top, and `f` a fret in the window.
`X0` is `openMarkerDiameter + openMarkerGap` when the source contains any `0` or `x`, else `0`.

| Quantity | Formula |
| --- | --- |
| Fret boundary `j` `x` | `X0 + j × fretGapWidth` |
| String `i` `y` | `i × stringGap` |
| Board height `B` | `(S − 1) × stringGap` |
| Board width | `X0 + M × fretGapWidth` |
| Fret gap center for fret `f` | `X0 + (f − lo + 0.5) × fretGapWidth` |
| Dot for fret `f` on string `i` | circle of `dotDiameter`, centered on that gap center and on the string's `y` |
| Open/mute marker, string `i` | centered at `x = openMarkerDiameter / 2` and the string's `y` |
| Fret label for fret `f` | text centered on the fret gap center, top edge at `y = B + labelGap` |

- Boundary lines span `y` from `0` to `B`; string lines span `x` from `X0` to the board width.
- Fret labels sit **beneath each fret gap**, not beneath each boundary line, so a label is directly under the dots it applies to.
  This supersedes any reading of "below each vertical line".
- The nut is drawn with `nutStrokeWeight`; every other boundary and every string uses `strokeWeight`.
- An open string is an unfilled circle of `openMarkerDiameter` with a `strokeWeight` stroke; a muted string is the character `×` at `fontSize`.

### Fretboard render settings

Settings are per-parent-frame and stored with the ASCII source as plugin data on the parent frame.

| Setting | Meaning | Default | Range |
| --- | --- | --- | --- |
| `fretGapWidth` | Width of each drawn fret | `36` | 8–200 |
| `stringGap` | Vertical gap between strings | `16` | 4–200 |
| `strokeWeight` | Stroke weight of strings and fret boundaries | `1` | 0.25–8 |
| `fontSize` | Font size of fret labels and mute markers | `11` | 4–200 |
| `windowMode` | `default` or `custom` | `default` | — |
| `leading` | Frets drawn before the lowest source fret (custom mode) | `1` | 0–24 |
| `trailing` | Frets drawn after the highest source fret (custom mode) | `1` | 0–24 |

Fixed for v1, not user-configurable:

| Constant | Value |
| --- | --- |
| `minFrets` | `4` |
| `nutStrokeWeight` | `4` |
| `dotDiameter` | `10` |
| `labelGap` | `6` |
| `openMarkerDiameter` | `8` |
| `openMarkerGap` | `10` |
| `inkColor` | `#000000` |
| `fontFamily` | `Roboto Mono` Regular, falling back to `Roboto` Regular |

Both the ASCII source and the render settings are stored as plugin data on the parent frame; see [Persistence and re-edit](#persistence-and-re-edit).

### Fretboard test cases

**TC-F1 — scale shape.** The G-major scale source above, in default mode: window 1–5, six boundary lines, six string lines, fifteen dots, five fret labels, no open markers, nut drawn at boundary 0.

**TC-F2 — open chord.** The G-major chord source above, in default mode: window 1–4 (highest source fret is 3, widened to `minFrets`), four dots, two open-string rings left of the nut, `X0` non-zero.

## Persistence and re-edit

Both modes render into a parent container frame that stores its own ASCII source and render settings as plugin data, so a generated diagram can be re-edited in place.

### Plugin data keys

Written with `node.setPluginData` on the parent frame — private plugin data, not shared plugin data.
Figma stores only strings, so non-string values are JSON-encoded.

| Key | Value |
| --- | --- |
| `schemaVersion` | Integer as a decimal string. Currently `"1"`. |
| `mode` | `"tablature"` or `"fretboard"`. |
| `source` | The ASCII source, verbatim, including newlines. |
| `settings` | JSON object of the mode's render settings. |

A frame is recognized as plugin-generated when `schemaVersion` and `mode` are both present and readable.
No other node carries plugin data.

### Schema versioning

- On read, a `schemaVersion` **lower** than the current version is upgraded through a chain of migration functions, one per version step, before the data is used.
- A `schemaVersion` **higher** than the current version MUST NOT be edited.
  The UI reports that the frame was made by a newer version of the plugin and offers no re-render.
- Within a version, unknown keys in `settings` are ignored and missing keys fall back to that setting's default, so adding a setting does not require a version bump.

### In-place edit flow

1. On launch and on every `selectionchange`, the plugin inspects the selection.
   A single selected frame carrying recognizable plugin data puts the UI into **edit mode**: it activates that frame's mode in the UI and populates the source and settings controls from the stored values.
2. Any other selection puts the UI into **create mode**, with source and settings initialized from the user's last-used values for that mode (see below).
3. Re-rendering in edit mode **replaces all children** of the existing parent frame, then rewrites its plugin data.
   The frame's own id, name, position, size constraints and parent are preserved, so the diagram keeps its place in the document and inbound references survive.
4. Generated frames call `setRelaunchData(node, { edit: "Edit source and settings" })`, which gives the frame an Edit button in Figma's design panel.
   The manifest MUST declare a matching `relaunchButtons` entry, and on relaunch the plugin reads `figma.command === "edit"` and starts directly in edit mode on that frame.

### Override policy

Manual edits to the *contents* of a generated frame — moving a text node, restyling a line, adding a child — are discarded on the next re-render, because step 3 replaces children wholesale.
This is deliberate: the plugin data is the source of truth, and diffing hand edits against regenerated geometry is out of scope.
The UI SHOULD warn before re-rendering a frame whose child count or child names don't match what the stored source and settings would produce.

Edits to the parent frame itself (position, name, rotation, opacity, effects, locking) are preserved.

### Last-used settings

Settings for *new* diagrams are per-user, not per-document, and are stored in `figma.clientStorage` under `defaults:tablature` and `defaults:fretboard`.
They are updated every time the user renders.
They are never read for a frame that already has plugin data — that frame's own stored settings always win.

## UI and sandbox protocol

A Figma plugin runs in two halves: the React UI in an iframe and the plugin code in Figma's sandbox, which alone can touch the document.
They communicate only by message passing, so the message union below is a contract both halves compile against.
It lives in one shared module and neither half defines its own copy.

The parser is pure TypeScript with no Figma dependency, and is imported by both halves: the UI runs it on every keystroke for live validation and preview counts, the sandbox runs it again as the authority for what gets rendered.
Settings validation works the same way.

```ts
type Mode = "tablature" | "fretboard";

/** UI → sandbox, via parent.postMessage({ pluginMessage: … }, "*") */
type UiMessage =
  /** Sent once when the React tree mounts; prompts an InitMessage reply. */
  | { type: "ui-ready" }
  /** Render into a new frame, or re-render the frame identified by frameId. */
  | { type: "render"; mode: Mode; source: string; settings: Settings;
      target: { kind: "new" } | { kind: "existing"; frameId: string } }
  /** Persist these as the user's last-used settings for new diagrams. */
  | { type: "save-defaults"; mode: Mode; settings: Settings }
  /** Scroll and zoom the viewport to a frame the UI is editing. */
  | { type: "focus-frame"; frameId: string }
  | { type: "close" };

/** sandbox → UI, via figma.ui.postMessage(…) */
type SandboxMessage =
  /** Reply to ui-ready: how the plugin was launched and the per-user defaults. */
  | { type: "init"; command: "run" | "edit";
      defaults: Record<Mode, Settings>; selection: SelectionState }
  /** Pushed on every selectionchange, and once as part of init. */
  | { type: "selection"; selection: SelectionState }
  | { type: "render-done"; frameId: string }
  /** Rendering was refused or failed; message is user-facing. */
  | { type: "render-failed"; message: string; errors: ParseError[] };

/** What the current selection means for the UI's mode. */
type SelectionState =
  /** Create mode: nothing editable is selected. */
  | { kind: "none" }
  /** Edit mode: a recognized generated frame is selected. */
  | { kind: "editable"; frameId: string; mode: Mode; source: string; settings: Settings }
  /** A generated frame whose schemaVersion is newer than this plugin supports. */
  | { kind: "unsupported-version"; frameId: string; schemaVersion: number };
```

Rules:

- The sandbox never pushes unsolicited state before receiving `ui-ready`; the iframe may not be mounted yet.
- `render` is idempotent: sending it twice with identical payloads for an `existing` target produces the same document state.
- The UI MUST NOT block its own input on a round trip.
  Validation shown while typing comes from the local parser, not from a sandbox reply.
- `Settings` is the mode's settings object from its Render settings table.
  `ParseError` is defined in [Error handling and validation](#error-handling-and-validation).

## Error handling and validation

Validation runs in the pure parser, so the UI and the sandbox reach identical verdicts.
A **warning** renders anyway; an **error** blocks rendering.

```ts
type Severity = "error" | "warning";

interface ParseError {
  severity: Severity;
  /** Stable kebab-case identifier from the tables below, for tests and i18n. */
  code: string;
  /** One sentence, user-facing, naming the offending text where useful. */
  message: string;
  /** 1-based line number within the whole source. */
  line: number;
  /** 0-based column within the line, plus the run's length, when localizable. */
  column?: number;
  length?: number;
}
```

### Shared

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
| `empty-source` | Source is empty or whitespace only | error | Render button disabled, no message shown until the user has typed something |
| `tab-character` | Source contains a horizontal tab | error | Tabs make column alignment unknowable; the message tells the user to use spaces |
| `source-too-large` | Source exceeds 50,000 characters | error | Keeps the serialized plugin data well inside Figma's per-key limit |
| `string-count` | A group has a number of lines other than 6 | warning | Renders that many strings, which is how 4-string bass and 7-string guitar work; `S` in the render model is the group's line count |

### Traditional tablature

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
| `inconsistent-string-count` | Row groups in one source have differing line counts | error | Almost always a paste error, and the rows could not align |
| `cell-without-digit` | A note cell contains no digit (`h`, `~`) | error | Anchored at the cell |
| `fret-out-of-range` | A cell's leading number exceeds 24 | warning | Rendered verbatim; tab text is literal |
| `too-many-slots` | A row group resolves to more than 400 slots | error | Guards against pathological render times |
| `too-many-rows` | More than 64 row groups | error | Same |
| — | A pipe inside the playable region | silent | Ignored; see [Non-goals](#non-goals) |
| — | A row group with no note cells at all | silent | Renders bare string lines, as in TC-3 |

### Fretboard diagram

Blank lines are **significant** in this mode: a blank line is a string with no marker, not a group separator.
Trailing blank lines are trimmed; a leading blank line is a markerless first string, so a stray leading newline surfaces as a `string-count` warning.

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
| `bad-token` | A token is not `0`–`24` or `x`/`X` | error | Anchored at the token |
| `fret-out-of-range` | A fret number exceeds 24 | error | Unlike tablature, these numbers are semantic — they position a dot |
| `open-with-fret` | A line combines `0` or `x` with a fret number | error | The string is either played open, muted, or fretted |
| `duplicate-marker` | A line repeats a fret, or carries more than one `0`/`x` | warning | Collapsed to one |
| `no-frets` | No line carries any marker | error | There is nothing to draw |

### Presentation

- The UI lists the current diagnostics beneath the source field, errors first, each showing its line number and message.
  Clicking one selects the offending range in the source field.
- The render button is disabled while any diagnostic has severity `error`.
- The sandbox re-validates on `render` and replies `render-failed` if any error is present, rather than trusting the UI.
  A `render-failed` that the UI did not predict is a bug, and the message says so.
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
| Bar lines | Pipes inside the playable region are currently ignored. Rendering them as vertical separators is a plausible v2, and the parser already discards them at a single known point. |
| Color and theme settings | `inkColor` is fixed black. Exposing stroke and text color is a settings-table addition and a schema-compatible change. |
| Fretboard string labels | Tablature supports labels; the fretboard diagram has no label column yet. |
| Fretboard position label (`5fr` style) | Every drawn fret is labeled instead. |
| Finger numbers inside fretboard dots | Would need new ASCII syntax. |
| Barre indicators | Same. |
| Multi-string-count sources in one tablature render | Currently `inconsistent-string-count`, an error. |
