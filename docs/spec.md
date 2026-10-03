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

### Illustrative and normative

Rules, decisions and the reasoning behind them are normative, and stay in this document.

Sections marked ***Illustrative after Mx*** hold **facts** — formulas, pixel figures, type definitions, tables of data — that move into code and tests at the named milestone in [../TODO.md](../TODO.md).
Once that milestone lands, the named module is authoritative, this document's copy is no longer maintained, and the marked content should be deleted, leaving the surrounding rationale.
Until then the figures here are correct and worth checking against.

Nothing marked illustrative should be copied into a bug report or treated as a contract; read the code instead.

## Glossary

Terms are used with these meanings throughout this document.
Note in particular that *string* and *fret* are distinct: a number appearing in ASCII source is always a fret number, and the string it applies to is determined by which line it appears on.

| Term | Meaning |
| --- | --- |
| **string** | One of the guitar's strings. Identified by its **string index**: line 1 of a group of ASCII lines is the highest-pitched string, and the last line is the lowest-pitched. Rendered as a horizontal line node in both modes. |
| **fret number** | A position along a string, counted from the nut. `0` means the open string. This is what the numbers in ASCII source denote. |
| **note cell** | The text occupying one slot on one string: a run of ASCII characters denoting what is played there — a bare fret number (`4`), one decorated with technique notation (`4/6`, `2h3p2`), or an `x` for a muted note. A cell may encode more than one note. Its rendering is a single text node. |
| **slot** | One moment in time in a tablature row: the note cells played simultaneously, at most one per string. Slots are ordered left to right and are the unit of horizontal position — which cells share a slot is decided by start column, not by ordinal position. |
| **slot advance** | The horizontal distance from one slot's left edge to the next slot's left edge, written `A(n)`. Borrowed from typography, where a glyph's advance is the distance from its origin to the next glyph's. It is not constant: a slot advances by `slotPitch` unless its widest cell needs more room, in which case the slot widens to fit. |
| **row** | A horizontal band of tablature containing one set of string lines. A tab too long to fit one line of ASCII is split across several rows. |
| **row frame** | The Figma frame holding one row's line nodes and text nodes. |
| **row group** | The block of source lines that produces one row: the lines between two blank lines, one line per string. *Row* is the rendered band, *row group* its source. |
| **playable region** | What remains of a tablature source line after its string label and any leading whitespace or pipes are stripped. It always begins with a `-`. Column indices are measured from its first character, so prefixes of differing widths don't skew alignment. |
| **parent frame** | The Figma frame containing all row frames (tablature) or the whole diagram (fretboard). Carries the plugin data. |
| **hyphenspace** | Runs of `-` characters separating note cells in tablature source. Their length does not affect rendered geometry. |
| **string label** | The text naming a string's tuning (`e`, `B`, `G`, ...), rendered as a text node to the left of the diagram. Always rendered: taken from the source line when it supplies one, otherwise from the default tuning for that string count. |
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
Diagnostics show their `message`, phrased in the user's own text — "`2h` has no fret number on line 3", not `cell-without-value`.

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
| Leading and trailing frets | fret window | `leadingFrets`, `trailingFrets` | Frets before / after |

Within this document, **tablature** always means the notation and **UI tab** always means the control in the plugin's interface.
Unqualified "tab" is avoided except in the established phrase *ASCII tab*, which names the source format.

## Traditional tablature

This allows you to render traditional guitar tab, where the horizontal axis is time, and the vertical axis is guitar string, with highest on top and lowest on bottom.
Frets are indicated by numbers.

The plugin will convert user-provided ASCII tab into a nicely-formatted set of line nodes and text nodes, with the string lines knocked out behind the text so that they don't make it hard to read (see [Tablature render model](#tablature-render-model)).
For now, the plugin will only support string lines and note cells, meaning we will not attempt to render fancy notation like slides and hammer-ons: the technique characters inside a cell are rendered as literal text, not as graphics.

### Parsing

Parsing is a pure function from source text to a row/slot structure.
It is independent of geometry: the same parse result rendered with different settings differs only in spacing.

**Step 1 — split into rows.** The source is split into *row groups* on blank lines (lines containing only whitespace).
Runs of consecutive blank lines count as one separator, and leading/trailing blank lines are discarded.
Each row group holds one line per string, ordered highest-pitched first.
A row group MUST have 4, 6 or 7 lines (`unsupported-string-count`), and every row group in a source must have the same count, or the rows could not align (`inconsistent-string-count`).

**Step 2 — split each line into prefix and playable region.** Every line has the form `label? separators? playable`:

| Part | Definition |
| --- | --- |
| `label` | Optional. A run of characters that are none of `-`, whitespace, `\|`. |
| `separators` | Whitespace and `\|` characters. Required if a `label` is present, optional otherwise. |
| `playable` | The *playable region*: the rest of the line, which MUST begin with `-`. |

Requiring the playable region to begin with a hyphen is how real-world ASCII tab is written, and it is what makes the label boundary decidable: the playable region starts at the first `-` that follows the optional label and separators.
A line that doesn't fit the form is a `missing-leading-hyphen` error — `3-5-7` fails, because `3` is not followed by a separator, so the line neither starts with a hyphen nor carries a terminated label.
All of `-----`, `|-----`, `e -----`, `e|-----` and `E |-2-` fit.

Column indices in step 4 are measured from the first character of the playable region, so lines whose prefixes differ in width (`e |`, `B|`) still align.

**Step 3 — tokenize.** Within a playable region, a *note cell* is a maximal run of characters that are none of: `-`, whitespace, `|`.
Hyphens, spaces and pipes carry no meaning beyond separating cells, which is why hyphenspace collapses (TC-2).
Each cell MUST contain at least one digit or at least one `x`/`X`; a cell that contains neither is a validation error.
A digit makes it a fret, and an `x` makes it a muted or dead note — the standard ASCII notation for a string struck without being fretted, which real-world tab uses freely (`-x-x-x-`, a muted strum on every string).
All other characters in a cell are technique notation and are preserved verbatim in the rendered text, as are the `x` characters themselves.

**Step 4 — assign slots.** Each cell has a start column, and a column span `[start, start + length)`, within its playable region.
Cells in the same row group belong to the same *slot* when they share a **start column**, and slots are ordered by that column.
A slot represents one moment in time: every cell in it is played simultaneously.

Cells that are meant to sound together are therefore written flush, and a cell may not straddle the boundary between two slots: a cell whose span overlaps a cell in a *different* slot is an `overlapping-cells` error.
Cells sharing a start column may overlap freely, since they are one slot already — `10` and `5` beginning at the same column is TC-7's first slot.

The prohibition is what the alignment rule costs, and it is worth seeing the input it rejects:

```
column:  0123456
string1: -10-11-     `10` spans [1,3), `11` spans [4,6)
string2: --2345-     `2345` spans [2,6)
```

`2345` begins inside `10`'s span and ends inside `11`'s, so it is simultaneous with both and with neither.
There is no reading of that source a renderer could honor, and the fix is the one the writer meant: pad the lines so the cells line up.

Deciding slots by start column rather than by overlap is what makes the rule total.
Overlap would have to be transitive to define slots at all, and its transitive closure chains the example above into a single slot holding *two* cells of string 1 — contradicting step 5, and describing a moment in time in which one string is struck twice.

Consequences worth stating explicitly, since they are the cases that break naive implementations:

- Slot identity is decided by **start column, not by ordinal position** within a string.
  A string that is silent for one chord does not shift its later cells into the wrong slot (TC-5).
- A multi-character cell occupies its full column span, so a cell on another string either shares its start column or begins after that span ends — in which case it lands in a **later** slot (TC-3).
- Absolute column values never reach the renderer — only slot ordering — so hyphen runs of any length produce identical geometry (TC-2).

**Step 5 — emit structure.** The parse result is an ordered list of row groups; each row group holds the string labels the source supplied, if any, and its ordered list of slots; each slot holds at most one cell per string index.
Filling in default-tuning labels for the strings the source didn't name is a layout concern, not a parsing one, so the parse result records only what was written.

Rendering maps this structure to a parent frame containing one *row frame* per row group.
Each row frame contains one string line node per source line, at even vertical spacing, and one text node per note cell, left-aligned at its slot's left edge and vertically centered on its string's line.
Slot widths are not uniform — a slot is as wide as its widest cell needs — so slot positions accumulate left to right rather than being a multiple of a fixed pitch.
Node geometry and defaults are specified in the [tablature render model](#tablature-render-model).

### String labels

Every diagram renders a string label per string.
The source may supply them, and when it doesn't they come from the default tuning for the string count, so a label column is always present (TC-4).

These rules are shared with the fretboard diagram, which has its own label syntax (see [Fretboard string labels](#fretboard-string-labels)):

- A label supplied by the source is read verbatim, so any tuning works — `D`, `C#`, `Eb`, or a two-character name.
- A line that supplies no label gets the **default tuning** for its string count and position, from the table below.
- A source where some lines carry labels and others don't is a `partial-labels` **error**.
  Partial labeling means the source disagrees with itself about what the strings are, and the plugin has no basis for guessing which half to trust.

The default tunings, illustrative after M2 — authoritative: `src/core/settings.ts`:

| Strings | Default tuning, lowest to highest | Read top to bottom |
| --- | --- | --- |
| 4 | `E A D G` | `G D A E` |
| 6 | `E A D G B e` | `e B G D A E` |
| 7 | `B E A D G B e` | `e B G D A E B` |

These three counts are the instruments the plugin supports: four is standard bass tuning, six is standard guitar, and seven adds the conventional low `B` beneath it.
A source with any other string count is rejected, so every rendered diagram has a default tuning available and a label for every string.

The `label` part of the line grammar in [step 2](#parsing) is the label.
A prefix of pipes and whitespace alone carries no label: those characters don't contribute anything to rendering, but since they are conventions of tablature writing, we accommodate their presence (TC-6).

Pipe characters appearing *inside* the playable region are currently ignored rather than rendered as bar lines.
See [Non-goals](#non-goals).

### Tablature render model

All lengths are in Figma pixels.
Symbols below refer to the settings table in [Tablature render settings](#tablature-render-settings).
Text measurement, fonts and vertical centering are specified once for both modes in [Text, fonts and measurement](#text-fonts-and-measurement).

#### Node tree

*Illustrative after M3. Authoritative: the renderer in `src/plugin/`.*

```
Frame  "Guitar Tab"                 ← parent frame; carries the plugin data
├─ Frame  "Row 0"
│  ├─ Text  "Label e"               ← one per string, top to bottom, always present
│  ├─ …                               (from the source, or the default tuning)
│  ├─ Line  "String 0"              ← one per string, spanning the whole row
│  ├─ …
│  ├─ Rect  "Knockout Slot 2 String 1"  ← one per note cell, under its text
│  ├─ …
│  └─ Text  "Slot 2 String 1"       ← one per note cell; characters verbatim
└─ Frame  "Row 1"
   └─ …
```

- The parent frame uses vertical auto-layout with `itemSpacing` = **rowGap**, no padding, and no fill.
  Row frames are absolutely positioned internally (text overlaps the string lines' band), have no fill, and are resized to their computed extent.
- Every frame sets `clipsContent = true`, which is also Figma's default.
  A frame's bounds therefore have to contain its ink, which is what `padY` is for.
- Every index in a layer name is **0-based**, matching the formulas: `Row 0` is the first row, `String 0` the highest-pitched string, `Slot 2 String 1` the cell on the second string in the third slot.
  Numbers that are not indices keep their real values — a fretboard's `Fret Label 7` is fret 7, not the eighth fret drawn.
- Layer names are for legibility and debugging, not identity: a re-render rebuilds the row frames wholesale rather than diffing them.
  Persistence and re-edit are specified in [Persistence and re-edit](#persistence-and-re-edit).
- A newly generated parent frame is placed at the **default location** and left selected: the document position of the center of the current viewport when that is available, and the origin otherwise.
  It is appended to the current page, never into whatever node happens to be selected, so placement doesn't depend on the selection.

#### Coordinates

*Illustrative after M2. Authoritative: `src/core/tablature/layout.ts` and its tests.*

Let `N` be the number of slots in a row, `S` the number of strings in the row group — always 4, 6 or 7 — `i` the 0-based string index from the top, and `n` the 0-based slot index.

| Quantity | Formula |
| --- | --- |
| Label column width `L` | `max(labelTextWidth) + stringLabelGap`, over the labels this row actually renders |
| Vertical padding `padY` | `fontSize / 2 + clearance` — half the tallest ornament on a string line, plus clearance |
| String line `y` | `padY + i × stringGap` |
| Row height | `2 × padY + (S − 1) × stringGap` |
| Cell width `W(n)` | the widest measured text width among slot `n`'s cells |
| Slot advance `A(n)` | `max(slotPitch, W(n) + cellGap)` — the distance from slot `n`'s left edge to slot `n + 1`'s |
| Slot left edge `X(n)` | `X(0) = L + slotPitch / 2`; `X(n) = X(n − 1) + A(n − 1)` |
| Row width | `X(N − 1) + W(N − 1) + slotPitch / 2` |
| Note cell text node | left edge at `X(n)`, vertically centered on its string's `y` |
| Label text node | right-aligned to `x = L − stringLabelGap`, centered on its string's `y` |

The half-pitch lead-in and tail-out reproduce the leading and trailing hyphens of conventional ASCII tab.

`padY` exists for two reasons, and is not cosmetic:

- Text on the first and last strings is centered on those strings, so without it half of each glyph would fall outside the row frame and be clipped.
- Because the parent is auto-layout, the visual gap between rows is the distance between row-frame bounds.
  With `padY` those bounds equal the row's ink, so `rowGap` is the gap the user actually sees; without it, rows would overlap by `fontSize / 2` and the apparent gap would be `rowGap` minus that.

There is no horizontal padding: the leftmost label starts at exactly `x = 0`, and the frame itself is what the user moves.
The fretboard diagram pads vertically the same way, with the same `clearance`, over its own tallest ornament.

`L` is computed **per row group**, from that row's own labels.
Row groups whose labels differ in width therefore start their string lines at different `x`, and the rows do not align with each other.
That is deliberate: the rendering respects what the ASCII says, rather than imposing a column width the source didn't ask for.

Two properties of this model are worth stating, because the obvious simpler formula (`x = n × slotPitch`) breaks on the spec's own examples:

- **Slots widen to fit their contents.** `slotPitch` is a *minimum* advance, not a fixed one.
  A cell like `2h3p2` is five characters, which at a 12 px monospace size is around 36 px — wider than the 24 px default pitch — so its slot advances by `W + cellGap` instead.
  Without this, a long cell overlaps its neighbor's text and its knockout rectangle hides part of the next slot (TC-3, TC-7).
- **Cells are left-aligned, not centered.** Every cell in a slot starts at the same `X(n)`, which is what the ASCII source shows: all cells of one chord begin in the same character column.
  Centering would stagger them whenever a slot mixes widths — a `10` and a `5` on different strings would no longer line up (TC-7).
  Text nodes therefore use left horizontal alignment and are positioned by their left edge, never by a center point.

#### String lines and knockouts

Each string is **one** horizontal `LineNode` spanning `x` from `L` to `rowWidth`, with a stroke of **strokeWeight** in **inkColor** and no caps.
The line is never broken: where text would collide with it, an opaque rectangle hides it.

Each note cell gets one `RectangleNode`, computed from that cell alone:

*The property table below is illustrative after M2; the rules and the reasoning that follow it are normative.*

| Property | Value |
| --- | --- |
| `x` | `X(n) − clearance` |
| `width` | `w + 2 × clearance`, where `w` is **that cell's** measured text width — not `W(n)`, the slot's width |
| `height` | `strokeWeight + 2 × clearance` |
| `y` | the string's `y` − `height / 2` |
| Fill | `knockoutFill`, opaque, with no stroke |

The rectangle only has to cover the line, which is `strokeWeight` thick, so its height is that plus a hair of `clearance` on each side rather than the height of the text.
At the defaults that is 5 px, not 12.

Z-order within a row frame is string labels, then string lines, then knockouts, then cell text.
Nothing is merged, clamped or inverted: rectangles are independent, and two that overlap are harmless.
Three properties follow for free, all asserted in TC-8:

- **A string not played during a slot runs straight through it**, because a cell that doesn't exist produces no rectangle — even where a long cell on another string has made that slot wide.
- **A cell narrower than its slot hides only its own width**, since the rectangle is sized from `w` rather than from `W(n)`.
- **Rectangles that abut or overlap need no special handling.** Cutting the line into segments instead required merging intervals that touch at a point, inverting the union and discarding sub-pixel remnants; none of that arises here.

One limit of the approach, accepted for v1: it assumes a white background.
On a dark frame or over artwork the rectangles show as white bars; see [Non-goals](#non-goals).
Keeping them only as tall as the line they hide holds that artifact to a 5 px bar at the defaults.

A rectangle reaches over a neighbouring string only if `strokeWeight + 2 × clearance` exceeds `stringGap` — 5 against 16 at the defaults, and only reachable with a heavy stroke and a tiny string gap, where the lines would be touching anyway.

### Tablature render settings

*Illustrative after M2. Authoritative: `src/core/settings.ts`.*

Settings are per-parent-frame and stored with the ASCII source as plugin data on the parent frame.

| Setting | Meaning | Default | Range |
| --- | --- | --- | --- |
| `slotPitch` | Minimum horizontal advance from one slot to the next; wider cells push their slot out | `24` | 4–200 |
| `strokeWeight` | Stroke weight of string lines | `1` | 0.25–8 |
| `stringGap` | Vertical gap between strings | `16` | 4–200 |
| `fontSize` | Font size of all text: string labels and note cells | `12` | 4–200 |
| `rowGap` | Vertical gap between rows | `32` | 0–400 |

Fixed for v1, not user-configurable:

| Constant | Value | Notes |
| --- | --- | --- |
| `clearance` | `2` | Padding around a knockout rectangle: beside the text horizontally, beyond the line's thickness vertically |
| `cellGap` | `4` | Minimum whitespace between a cell and the start of the next slot |
| `knockoutFill` | `#FFFFFF` | Fill of the rectangles that hide a string line behind text |
| `stringLabelGap` | `8` | Space between the string-label column and the string lines |
| `defaultTunings` | 4, 6 and 7 strings | See [String labels](#string-labels); used for any string the source doesn't label |
| `inkColor` | `#000000` | Lines and text |
| `fontFamily` | `Roboto Mono` Regular | Falls back to `Roboto` Regular |

### Tablature test cases

*Illustrative after M1 and M2. Authoritative: `src/core/tablature/*.test.ts`.*

These are normative: the parser's unit tests SHOULD use these inputs by name.

**TC-1 — multiple rows.** Renders as two row frames under one parent frame, with `rowGap` between them.
Each row holds five slots, so at the default settings each row frame contains:

| Nodes | Count | Detail |
| --- | --- | --- |
| String lines | 6 | one per string, each spanning `x` 15.2 to 142.4 |
| Knockouts | 30 | one per cell, each 11.2 × 5 |
| String labels | 6 | `e B G D A E`, defaulted |
| Note cells | 30 | five per string |

Row width is 142.4 and row height 96, from `2 × padY + 5 × stringGap`.
The five knockouts on a string sit at `x` = 25.2, 49.2, 73.2, 97.2, 121.2, each 11.2 wide, so they tile the line without touching.

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

**TC-4 — source-supplied labels.** The six labels come from the source rather than from standard tuning, read literally so alternate tunings pass through unchanged.
Assert that a source label overrides the default for its position.

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

**TC-6 — superfluous prefix characters.** Parses identically to TC-4: the pipes are stripped and the labels are still recognized.

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
At the default settings, with the test measure's 7.2 px per character, the expected values are:

| `n` | cells | `W(n)` | `A(n)` | `X(n)` |
| --- | --- | --- | --- | --- |
| 0 | `10`, `5`, `3` | 14.4 | 24 | 27.2 |
| 1 | `12b14` | 36 | 40 | 51.2 |
| 2 | `7`, `0` | 7.2 | 24 | 91.2 |

Row width is 110.4. The source supplies no labels, so the column holds the standard-tuning defaults and `L` is `7.2 + stringLabelGap` = 15.2, which is why `X(0)` is 27.2 rather than 12. Assert these accumulated positions, not multiples of `slotPitch`.

**TC-8 — knockouts.** The TC-7 source again, asserting the rectangles rather than the slots.
Six cells produce six rectangles, each `strokeWeight + 2 × clearance` = 5 tall:

| string | cell | `x` | `width` | `y` |
| --- | --- | --- | --- | --- |
| 1 | `10` | 25.2 | 18.4 | 5.5 |
| 1 | `12b14` | 49.2 | 40 | 5.5 |
| 1 | `7` | 89.2 | 11.2 | 5.5 |
| 2 | `5` | 25.2 | 11.2 | 21.5 |
| 2 | `0` | 89.2 | 11.2 | 21.5 |
| 6 | `3` | 25.2 | 11.2 | 85.5 |

Each `y` is that string's `y` (8, 24, 88) less half the 5 px height.

All six string lines are single nodes spanning `x` 15.2 to 110.4. The cases this pins down:

- Strings 3, 4 and 5 have no cells, so they have no rectangles at all — their lines are uninterrupted by construction, not by a computed complement.
- String 2 has no cell in slot 1, so nothing covers its line across that slot, even though slot 1 is 40 px wide for `12b14` on string 1.
- String 2's rectangle at slot 0 is 11.2 wide where string 1's is 18.4, because each is sized from its own cell's width (`5` versus `10`).
- On string 1, the `12b14` rectangle ends at 89.2 and the `7` rectangle begins at 89.2. They abut, and the renderer does nothing about it; this is the case that needed an explicit merge rule under the segmentation model.

**TC-9 — muted notes.** A muted strum followed by an open G chord.
Two slots, twelve cells, no diagnostics: an `x` is as valid a cell as a digit, and is rendered verbatim.

```
-x-3-
-x-3-
-x-0-
-x-0-
-x-2-
-x-3-
```

At the default settings `X(0)` is 27.2 and `X(1)` is 51.2, both slots advance by `slotPitch`, and the row is 70.4 wide.
Every cell is one character, so every knockout is 11.2 × 5 — an `x` is measured and laid out exactly like a fret number, with no special case anywhere in parsing or layout.

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
| *(empty line)* | This string carries no marker. |

A fret token is exactly `0`, or a digit `1`–`9` followed by any number of digits.
Nothing else parses: `00` has a leading zero, `3.5` is not an integer, `+3` and `3x` carry characters that are not digits.
Each is a `bad-token` error rather than a value the plugin guesses at.

The **first** whitespace-delimited token on a line is a string label when it does not begin with a digit.
So `e 2 3` labels the string `e` and frets 2 and 3, while `3` alone is a fret.
Requiring a label not to start with a digit keeps a mistyped fret number a fret number rather than silently becoming a label.
Only the first token can be a label; a non-fret token anywhere else is a `bad-token` error.

A `0` MUST NOT be combined with a fret number on the same string: a string is either open or fretted.
Tokens on a line may appear in any order; duplicates are collapsed.
The number of lines is the string count, which MUST be 4, 6 or 7 (`unsupported-string-count`).

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
It is computed from the source frets — tokens of `1` or more, since `0` is not a fret — by buffering the shape on each side:

1. `lo = minSourceFret − leadingFrets` and `hi = maxSourceFret + trailingFrets`.
   A source whose only markers are `0` has no frets to measure from; it takes `lo = 1`, `hi = minFrets`, and is done.
2. `lo` is clamped to a minimum of `1`: there is no fret 0 to draw, and none below it.
3. If the source contains any `0`, `lo` is forced to `1`, since an open-string marker is drawn relative to the nut.
4. `hi` is clamped to `maxFret`, for the same reason in the other direction: the window may not extend past the last fret that exists.
5. If the window is narrower than `minFrets`, it is widened — rightward while `hi` is below `maxFret`, then leftward while `lo` is above `1`.

Clamping rather than rejecting matters at the top of the range.
A source naming fret `maxFret` is legal, and at the default `trailingFrets` of 1 step 1 puts `hi` one past the end of the neck; rejecting that would make the highest legal fret unusable at default settings.
Step 4 trims it instead, and step 5 recovers the width by extending downward.

Between them, steps 2 and 4 bound the window to `[1, maxFret]`, so its span cannot exceed `maxFret` frets.
No separate "window too wide" check is needed, and large `leadingFrets` or `trailingFrets` values cannot produce a rejection — they just hit a clamp.

There is no separate "whole neck" mode, because `leadingFrets` already expresses one: step 2 clamps, so a `leadingFrets` that reaches past fret 1 anchors the window at the nut.
At the default `leadingFrets` of 1, the nut appears exactly when the shape sits within a fret of it, which is when it carries information — a shape five frets up neither needs the nut nor the empty frets between.
Fret labels carry absolute fret numbers (TC-F4), so a window that excludes the nut is still unambiguous about position.

Worked examples, with `minFrets = 4` — illustrative after M6, authoritative: `src/core/fretboard/layout.test.ts`:

| Source frets | `leadingFrets` / `trailingFrets` | Window | Why |
| --- | --- | --- | --- |
| `2,3,4,5` | 1 / 1 | 1–6 | `lo` would be 1 anyway; the nut lands in view |
| `0,2,3` open chord | 1 / 1 | 1–4 | |
| `7` plus a `0` | 1 / 1 | 1–8 | step 3: an open string needs the nut |
| `0` only | 1 / 1 | 1–4 | step 1: no frets to buffer, so the window is `minFrets` wide from the nut |
| `7,9,10` | 2 / 1 | 5–11 | |
| `2,3` | 3 / 0 | 1–4 | step 2 clamps, then step 4 widens |
| `12` | 1 / 1 | 11–14 | step 5 widens a one-fret shape rightward |
| `7,9` | 24 / 1 | 1–10 | a large `leadingFrets` hits the step 2 clamp, anchoring at the nut |
| `30` | 1 / 1 | 27–30 | step 4 clamps `hi` to `maxFret`, then step 5 widens leftward because it cannot widen right |

### Fretboard render model

Let `M = hi − lo + 1` be the number of frets drawn.
*Fret boundary `j`* (for `j = 0…M`) is the vertical line at the left edge of fret `lo + j`, so boundary `M` is the right edge of the last fret.
Boundary `0` is the **nut** when `lo = 1`.

#### Node tree

*Illustrative after M7. Authoritative: the fretboard renderer in `src/plugin/`.*

```
Frame  "Fretboard Diagram"          ← parent frame; carries the plugin data
├─ Text     "Label e"               ← one per string, top to bottom, always present
├─ …                                  (from the source, or the default tuning)
├─ Line     "Nut"                   ← boundary 0 when lo = 1; otherwise "Fret Boundary 0"
├─ Line     "Fret Boundary 1"
├─ …
├─ Line     "String 0"              ← one per string, top to bottom
├─ …
├─ Ellipse  "Dot String 3 Fret 2"   ← filled disc, one per fretted note
├─ Ellipse  "Open String 2"         ← stroked disc superimposed on the nut
└─ Text     "Fret Label 2"          ← one per drawn fret; the fret number, not an index
```

#### Coordinates

*Illustrative after M6. Authoritative: `src/core/fretboard/layout.ts` and its tests.*

`S` is the number of strings, `i` the 0-based string index from the top, and `f` a fret in the window.
`L` is the label column width, exactly as in tablature: `max(labelTextWidth) + stringLabelGap`.
It is never 0, because every string has a label — which is what keeps the open disc inside the frame: `L` is at least `stringLabelGap` (8), comfortably more than the `dotDiameter / 2` (5) that a disc centered on the nut extends to its left.
The whole board is offset right by `L`, which leaves the label column to its left.

| Quantity | Formula |
| --- | --- |
| Vertical padding `padY` | `max(dotDiameter, fontSize) / 2 + clearance` |
| Fret boundary `j` `x` | `L + j × fretGapWidth` |
| String `i` `y` | `padY + i × stringGap` |
| Board height `B` | `(S − 1) × stringGap` |
| Frame width | `L + M × fretGapWidth` |
| Frame height | `padY + B + fretLabelGap + fontSize` |
| Fret gap center for fret `f` | `L + (f − lo + 0.5) × fretGapWidth` |
| Dot for fret `f` on string `i` | disc of `dotDiameter`, centered on that gap center and on the string's `y` |
| Open disc, string `i` | disc of `dotDiameter`, centered on the nut at `x = L` and on the string's `y` |
| Label text node, string `i` | right-aligned to `x = L − stringLabelGap`, centered on the string's `y` |
| Fret label for fret `f` | text centered on the fret gap center, top edge at `y = padY + B + fretLabelGap` |

- Boundary lines span `y` from `padY` to `padY + B`; string lines span `x` from `L` to the frame width.
- `padY` exists for the same reason as in tablature: a dot, an open disc or a label centered on the first string would otherwise extend above the frame.
  It is half the tallest thing drawn on a string line, plus `clearance`.
- Fret labels sit **beneath each fret gap**, not beneath each boundary line, so a label is directly under the dots it applies to.
  This supersedes any reading of "below each vertical line".
- The nut is drawn with `nutStrokeWeight`; every other boundary and every string uses `strokeWeight`.
- A **fretted note** is a disc of `dotDiameter` filled with `inkColor`, centered in its fret gap, which covers the string line beneath it.
- An **open string** is a disc of the same `dotDiameter` superimposed on the nut, centered at `x = L` and on the string's `y`, with a `strokeWeight` stroke in `inkColor` and a `knockoutFill` fill.
  The fill is what makes it read as an open marker rather than a fretted one: the nut line and the string line both stop at its edge instead of running through it.
  There is no fret gap for an open string to sit in — fret 1's gap belongs to a source token of `1` — so the disc goes on the nut itself, which is why any `0` forces the window to include the nut.
- `dotDiameter` MUST exceed `nutStrokeWeight`, or an open disc cannot cover the nut it sits on.
  At the defaults it is 10 against 4.
- Z-order is boundaries and string lines first, then dots and open discs, then fret labels.
  An open disc drawn before the nut would be hidden by it.
- Like the tablature knockouts, the open disc's fill assumes a white background; see [Non-goals](#non-goals).

### Fretboard string labels

Labels work as they do in [tablature](#string-labels): always rendered, read verbatim when the source supplies them, and otherwise taken from the default tuning for the string count, with the same `partial-labels` and `unsupported-string-count` errors.
The differences are the syntax, described in [ASCII input](#ascii-input) — a leading token rather than a prefix before a playable region — and the geometry, where the label column sits left of the nut rather than left of the string lines.

```
e 3
B 3
G 0
D 0
A 2
E 3
```

Each label renders as a text node right-aligned to `x = L − stringLabelGap`, vertically centered on its string (TC-F3).
The source above supplies all six; a source supplying none renders `e B G D A E` in the same places.

### Fretboard render settings

*Illustrative after M6. Authoritative: `src/core/settings.ts`.*

Settings are per-parent-frame and stored with the ASCII source as plugin data on the parent frame.

| Setting | Meaning | Default | Range |
| --- | --- | --- | --- |
| `fretGapWidth` | Width of each drawn fret | `36` | 8–200 |
| `stringGap` | Vertical gap between strings | `16` | 4–200 |
| `strokeWeight` | Stroke weight of strings and fret boundaries | `1` | 0.25–8 |
| `fontSize` | Font size of all text: string labels and fret labels | `12` | 4–200 |
| `leadingFrets` | Frets drawn before the lowest source fret | `1` | 0–24 |
| `trailingFrets` | Frets drawn after the highest source fret | `1` | 0–24 |

Fixed for v1, not user-configurable:

| Constant | Value |
| --- | --- |
| `clearance` | `2` |
| `minFrets` | `4` |
| `maxFret` | `30` — the highest fret a source may name, and the highest the window may reach |
| `nutStrokeWeight` | `4` |
| `dotDiameter` | `10` |
| `fretLabelGap` | `6` |
| `stringLabelGap` | `8` |
| `defaultTunings` | 4, 6 and 7 strings |
| `knockoutFill` | `#FFFFFF` |
| `inkColor` | `#000000` |
| `fontFamily` | `Roboto Mono` Regular, falling back to `Roboto` Regular |

Both the ASCII source and the render settings are stored as plugin data on the parent frame; see [Persistence and re-edit](#persistence-and-re-edit).

### Fretboard test cases

*Illustrative after M6. Authoritative: `src/core/fretboard/*.test.ts`.*

**TC-F1 — scale shape.** The G-major scale source above at the default `leadingFrets` and `trailingFrets` of 1: source frets 2–5, so window 1–6, seven boundary lines, six string lines, fifteen dots, six fret labels, six string labels defaulted to `e B G D A E`, no open markers, nut drawn at boundary 0 because `lo` is 1.

**TC-F2 — open chord.** The G-major chord source above at the default 1 / 1: source frets 2–3, so window 1–4, four dots, two open-string discs superimposed on the nut, and six default string labels to the left of the board.

**TC-F3 — source-supplied fretboard labels.** The labeled source above at the default 1 / 1: window 1–4, six label text nodes taken from the source rather than defaulted, and every boundary, string, dot and open marker offset right by `L`.
Assert that the two open-string discs are centered at `x = L`, on the nut, and that each carries both a `knockoutFill` fill and an `inkColor` stroke — without the fill the nut line would run through the disc, and without the stroke it would be invisible.

**TC-F4 — shifted window, no nut.** A B major scale in 6th position: the G major box of TC-F1 transposed up four semitones, so its lowest root moves from the 3rd fret of the low E string to the 7th.
Rendered at the default `leadingFrets` and `trailingFrets` of 1.

```
6 7
7 9
6 8 9
6 8 9
6 7 9
7 9
```

Source frets run 6–9, so the window is 5–10 and `M` is 6. Because `lo` is not 1, **no nut is drawn**: boundary 0 is an ordinary `Fret Boundary 0` at `strokeWeight`, not a `Nut` at `nutStrokeWeight`.
The source has no `0`, so the rule forcing `lo` to 1 does not fire.

The nut's absence is not a setting here — it falls out of the shape sitting five frets above it.
To pull the nut into view anyway, a `leadingFrets` of 5 or more would reach it, since the lowest source fret is 6.

Expected output at the default settings.
The source supplies no labels, so the column holds the standard-tuning defaults and `L` = 15.2:

| Quantity | Value |
| --- | --- |
| `padY` | 8, from `max(dotDiameter, fontSize) / 2 + clearance` = 12 / 2 + 2 |
| String labels | 6, reading `e B G D A E` top to bottom, right-aligned at `x` = 7.2 |
| Boundary lines | 7, at `x` = 15.2, 51.2, 87.2, 123.2, 159.2, 195.2, 231.2, spanning `y` 8 to 88 |
| String lines | 6, at `y` = 8, 24, 40, 56, 72, 88, spanning `x` 15.2 to 231.2 |
| Frame | 231.2 × 106 |
| Dots | 15 |
| Fret labels | 6, reading 5, 6, 7, 8, 9, 10, centered at `x` = 33.2, 69.2, 105.2, 141.2, 177.2, 213.2, top edge `y` = 94 |

Also assert:

- Fret labels show **absolute fret numbers**, not positions within the window — a shifted window is the only case where those differ, and getting it wrong makes every high-position diagram silently mislabeled.
- The fret 5 and fret 10 gaps contain no dots; they are the leading and trailing buffer frets.
- The low E string's two dots sit at `x` = 105.2 and 177.2 on `y` = 88, the frets 7 and 9 that carry the root and the 9th.
- Nothing is drawn above `y` = 2 or below the frame height of 106: `padY` keeps the first string's ornaments inside the frame.

## Text, fonts and measurement

*Illustrative after M2 and M3. Authoritative: `src/core/measure.ts` and the renderer.*

These rules are shared by both modes.

### Measuring text

Tablature slot widths depend on measured text, and so does the label column width `L` in both modes, so layout cannot be computed from the parse result and settings alone.
Layout therefore takes a `measure(text, fontSize) => width` function as a parameter rather than reaching for a measurement API itself.
This keeps layout a pure function and keeps its output deterministic in tests.

- **In the sandbox**, which is the only place layout runs, `measure` is Figma-backed: it sets the characters on one reusable hidden `TextNode` and reads its `width`, then removes it after the render.
  This is authoritative for any family, including the proportional `Roboto` fallback.
- **In tests**, `measure` is `src/core/`'s analytic monospace implementation, `width = text.length × fontSize × advanceRatio`, with `advanceRatio` fixed at `0.6`.
  Every px figure in this document's test cases is computed with it, so expectations are exact and need no Figma runtime.
- The analytic measure is a **test double, not a fallback**: the plugin never renders with it.

`advanceRatio` is therefore not a font metric, and nothing about the rendered output depends on its value:

- It cannot affect a real render, because the sandbox always measures with Figma.
  A wrong value would make the test fixtures disagree with reality, not make the plugin render incorrectly.
- `0.6` is chosen for being round and for being close to real monospace metrics, so fixture numbers stay plausible when read as sanity checks.
  It is not a measurement of Roboto Mono, and a more precise figure would buy nothing.
- Because the ratio is a stub, making `fontFamily` configurable later changes nothing here: the sandbox measures whatever family it is handed, and the tests keep their arithmetic.

What the fixtures do pin down is the **layout formulas**, not the font.
If `advanceRatio` ever changes, every expected px figure moves with it and the formulas stay as written — which is why the test cases state the formula alongside the number.

### Fonts and text nodes

These rules apply to every text node in both modes.

- Text nodes use **fontFamily** at **fontSize** in **inkColor**.
- The font MUST be loaded with `figma.loadFontAsync` before any text node is created or its characters are set.
  The default family is `Roboto Mono` Regular, falling back to `Roboto` Regular if the former fails to load — `Roboto` is always available in Figma.
- `lineHeight` MUST be set explicitly to `fontSize` (100%), and `textAutoResize` to `WIDTH_AND_HEIGHT`.
  Figma's default auto line height is roughly 1.2 × `fontSize` and varies by family, so a node's height would otherwise be a font metric the spec can't predict.
  Pinning it makes every text node exactly `fontSize` tall, which is what `padY` and the row-height formula assume, and keeps `measure` a width-only function.
- "Vertically centered on `y`" therefore means the node's top edge sits at `y − fontSize / 2`.
  This centers the em box, not the digits' cap height, so glyphs sit marginally high; that is accepted for v1 rather than corrected with a font-dependent nudge.

## Persistence and re-edit

Both modes render into a parent container frame that stores its own ASCII source and render settings as plugin data, so a generated diagram can be re-edited in place.

### Plugin data keys

*Illustrative after M5. Authoritative: `src/plugin/pluginData.ts`.*

Written with `node.setPluginData` on the parent frame — private plugin data, not shared plugin data.
Figma stores only strings, so non-string values are JSON-encoded.

| Key | Value |
| --- | --- |
| `schemaVersion` | Integer as a decimal string. Currently `"1"`. |
| `mode` | `"tablature"` or `"fretboard"`. |
| `source` | The ASCII source, verbatim, including newlines. |
| `settings` | JSON object of the mode's render settings: `TablatureSettings` or `FretboardSettings`, per `mode`. |

A frame is recognized as plugin-generated when `schemaVersion` and `mode` are both present and readable.
No other node carries plugin data.

### Schema versioning

- On read, a `schemaVersion` **lower** than the current version is upgraded through a chain of migration functions, one per version step, before the data is used.
- A `schemaVersion` **higher** than the current version MUST NOT be edited.
  The UI reports that the frame was made by a newer version of the plugin and offers no re-render.
- Within a version, unknown keys in `settings` are ignored and missing keys fall back to that setting's default, so adding a setting does not require a version bump.

### In-place edit flow

1. On launch and on every `selectionchange`, the plugin inspects the selection and reports one of the three `SelectionState` cases to the UI.
   The three cases are exhaustive, and the UI has a mode for each:

   | Selection | `SelectionState` | UI |
   | --- | --- | --- |
   | A single frame with readable plugin data this version supports | `editable` | **Edit mode**: activates that frame's mode, populates source and settings from the stored values |
   | A single frame whose `schemaVersion` is newer than this plugin | `unsupported-version` | Reports that the frame was made by a newer version, and offers no re-render |
   | Anything else — nothing selected, several nodes, or a node without plugin data | `none` | **Create mode**: on launch, source and settings start from the user's last-used values for the active mode (see below); later in a session the editor keeps whatever it holds |

2. `init.command` is `"edit"` only when `selection` is `editable`, and `"run"` in every other case.
   A relaunch button can only exist on a frame the plugin generated, but that frame may still carry an `unsupported-version` schema, so the two fields are reported independently and the UI trusts `selection`.

3. **A selection that carries a diagram replaces the editor's contents, discarding unsaved edits.** Selecting an `editable` frame loads its source and settings over whatever the user had typed, with no prompt and no confirmation.
   The plugin keeps no dirty flag and tracks no unsaved state: a frame's plugin data is the source of truth, sources are usually pasted from elsewhere, and a confirmation flow would add more state machinery than the loss is worth.

4. **A selection that carries no diagram leaves the editor alone.** `none` and `unsupported-version` have nothing to load, so they change only what a render would do, not what the editor holds.
   This is what keeps a stray click on empty canvas from wiping a source the user is part-way through typing.

5. The render target follows the selection: `existing` with that frame's id while an `editable` frame is selected, and `new` while the selection is `none`.
   So editing a frame, then deselecting it, then rendering creates a second frame with the same content — a render always acts on what is selected now.

   While an `unsupported-version` frame is selected, **rendering is unavailable** and the render button is disabled.
   The alternative — letting the render fall through to a `new` frame — would answer "I can't edit this one" by silently producing a different diagram somewhere else.
   Deselecting the frame is how the user gets back to creating one.
6. Re-rendering in edit mode **replaces all children** of the existing parent frame, then rewrites its plugin data.
   The frame's own id, name, position, size constraints and parent are preserved, so the diagram keeps its place in the document and inbound references survive.
7. Generated frames call `setRelaunchData(node, { edit: "Edit source and settings" })`, which gives the frame an Edit button in Figma's design panel.
   The manifest MUST declare a matching `relaunchButtons` entry.
   On relaunch the plugin reads `figma.command === "edit"`, resolves the selection as in step 1, and reports `command: "edit"` only if that resolution produced an `editable` state.

### Override policy

Manual edits to the *contents* of a generated frame — moving a text node, restyling a line, adding a child — are discarded on the next re-render, because step 6 replaces children wholesale.
This is deliberate: the plugin data is the source of truth, and diffing hand edits against regenerated geometry is out of scope.
Nothing inspects the existing subtree before a re-render: the plugin discards every child and renders afresh from the parsed source, so neither half needs to know what was there.

Edits to the parent frame itself (position, name, rotation, opacity, effects, locking) are preserved.

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

*The type definitions below are illustrative after M4; the rules that follow them are normative.*

```ts
type Mode = "tablature" | "fretboard";

interface TablatureSettings {
  slotPitch: number; strokeWeight: number; stringGap: number;
  fontSize: number; rowGap: number;
}

interface FretboardSettings {
  fretGapWidth: number; stringGap: number; strokeWeight: number;
  fontSize: number; leadingFrets: number; trailingFrets: number;
}

/** A mode paired with its own settings type, so the two can never mismatch. */
type ModeSettings =
  | { mode: "tablature"; settings: TablatureSettings }
  | { mode: "fretboard"; settings: FretboardSettings };

/** Everything needed to render: a mode, its settings, and the source. */
type Diagram = ModeSettings & { source: string };

/** Per-user last-used settings for new diagrams, one entry per mode. */
interface Defaults {
  tablature: TablatureSettings;
  fretboard: FretboardSettings;
}

/** UI → sandbox, via parent.postMessage({ pluginMessage: … }, "*") */
type UiMessage =
  /** Sent once when the React tree mounts; prompts an init reply. */
  | { type: "ui-ready" }
  /** Render into a new frame, or re-render the frame identified by frameId. */
  | { type: "render"; diagram: Diagram;
      target: { kind: "new" } | { kind: "existing"; frameId: string } }
  | { type: "close" };

/** sandbox → UI, via figma.ui.postMessage(…) */
type SandboxMessage =
  /** Reply to ui-ready: how the plugin was launched and the per-user defaults.
   *  command is "edit" only when selection.kind === "editable". */
  | { type: "init"; command: "run" | "edit";
      defaults: Defaults; selection: SelectionState }
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
  | { kind: "editable"; frameId: string; diagram: Diagram }
  /** A generated frame whose schemaVersion is newer than this plugin supports. */
  | { kind: "unsupported-version"; frameId: string; schemaVersion: number };
```

Rules:

- The sandbox never pushes unsolicited state before receiving `ui-ready`; the iframe may not be mounted yet.
- `render` is idempotent: sending it twice with identical payloads for an `existing` target produces the same node structure and properties.
  Node ids are not stable across renders, since every child is rebuilt.
- The UI MUST NOT block its own input on a round trip.
  Validation shown while typing comes from the local parser, not from a sandbox reply.
- `TablatureSettings` and `FretboardSettings` mirror the two Render settings tables exactly; adding a setting means editing both the table and the interface.
  The two modes share no settings type, which is why every message carries a `Diagram` rather than a loose `mode` and `settings` pair — a `"fretboard"` mode can't be paired with tablature settings.
  `ParseError` is defined in `src/core/diagnostics.ts`; see [Error handling and validation](#error-handling-and-validation) for what the diagnostics mean.

## Error handling and validation

Validation runs in the pure parser, so the UI and the sandbox reach identical verdicts.
A **warning** renders anyway; an **error** blocks rendering.

*The fretboard diagnostic table below is illustrative after M6. Authoritative for the diagnostic type itself: `src/core/diagnostics.ts`; for each mode's codes, that mode's parser and its tests. Severities, and the reasoning for them, are normative.*

A diagnostic carries a severity, a stable kebab-case `code` for tests and i18n, a one-sentence user-facing `message`, and an anchor: a line, and optionally a column and length.
The anchor is what lets the UI select the offending text when a diagnostic is clicked, so a code that *can* name a precise run should.
Lines and columns are 0-based — the line within the whole source, the column within that raw line, prefix included.

### Settings validation

Every setting's range is given in its mode's Render settings table.
Those ranges are enforced in three places, deliberately overlapping:

1. **The UI control** carries the range as `min`, `max` and `step` on its number input, so the normal path cannot produce an out-of-range value.
2. **`src/core/`'s settings module clamps** any value outside its range when settings arrive from anywhere — a `render` message, stored plugin data, or `clientStorage` — and raises `setting-out-of-range`.
   This is the backstop for the UI constraint being wrong, for plugin data written by a buggy or hand-edited version, and for a stored value whose range has since narrowed.
3. **Constraints that span several values** cannot be expressed as a per-field range.
   The fret window is the case that tempted one: its span depends on the source as much as on `leadingFrets` and `trailingFrets`.
   It is resolved by clamping in the [fret window](#fret-window) computation instead of by a diagnostic, which is the better answer wherever a sensible value exists — a setting the user can reach should not be able to produce an error.

Clamping is a warning rather than an error because it always yields a sensible render.
A value that cannot be clamped — a missing key, or one whose type is wrong — falls back to that setting's default, as [Schema versioning](#schema-versioning) describes.

### Shared

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
| `empty-source` | Source is empty or whitespace only | error | Render button disabled, no message shown until the user has typed something |
| `tab-character` | Source contains a horizontal tab | error | Tabs make column alignment unknowable; the message tells the user to use spaces |
| `source-too-large` | Source exceeds 50,000 characters | error | Keeps the serialized plugin data well inside Figma's per-key limit |
| `partial-labels` | Some lines carry a string label and others don't | error | The source disagrees with itself about the strings; nothing is assumed |
| `unsupported-string-count` | The string count is not 4, 6 or 7 | error | The plugin supports bass, guitar and seven-string guitar; any other count has no default tuning, and the spec's "a label for every string" invariant would not hold |
| `setting-out-of-range` | A settings value falls outside the range in its Render settings table | warning | Clamped to the nearest end of the range, and the render proceeds |

### Traditional tablature

Every tablature diagnostic is an error.
The source either describes a tab that can be drawn or it doesn't, and none of these conditions has a sensible thing to fall back to — which is the distinction that keeps this list free of warnings.
`src/core/tablature/parse.ts` and its tests are authoritative for the codes and their anchors; what follows is why each condition is rejected rather than accommodated.

- A line whose playable region doesn't begin with `-`, or whose label isn't followed by a separator, has no decidable label boundary — see [step 2](#parsing).
- Row groups with differing line counts are almost always a paste error, and the rows could not be aligned if they were drawn.
- A note cell holding neither a digit nor an `x` — `h` or `~` alone — names nothing to play.
- A cell straddling two slots describes a simultaneity no renderer could honor; [step 4](#parsing) works the case through.
- Caps on slots per row group and on row groups per source guard against pathological render times.
- A row group with no note cells has nothing to render, and the row width formula has no last slot to measure from.

A pipe inside the playable region is ignored rather than drawn as a bar line, and silently: it is a convention of writing tab, not a mistake.
See [Non-goals](#non-goals).

### Fretboard diagram

Blank lines are **significant** in this mode: a blank line is a string with no marker, not a group separator.
Trailing blank lines are trimmed; a leading blank line is a markerless first string.
That makes a stray leading newline indistinguishable from an intentional markerless top string: a 6-line source with one extra leading newline is a perfectly valid 7-string source, so the string-count check cannot catch it.
Hence `leading-blank-line` below — it renders either way, but says what it assumed.

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
| `bad-token` | A token other than a leading string label is not `0` or a positive integer | error | Anchored at the token |
| `open-with-fret` | A line combines `0` with a fret number | error | A string is either open or fretted |
| `duplicate-marker` | A line repeats a fret, or repeats `0` | warning | Collapsed to one |
| `no-frets` | No line carries any marker | error | There is nothing to draw |
| `leading-blank-line` | The source begins with a blank line | warning | Taken as a markerless first string. A 6-line source with one stray leading newline is a valid 7-string source, so the string-count check cannot catch it |
| `fret-out-of-range` | A fret number exceeds `maxFret` | error | Past the end of any real neck; the only fret rejection, since the window itself is clamped rather than rejected |

### Presentation

- The UI lists the current diagnostics beneath the source field, errors first, each showing its line number and message.
  Clicking one selects the offending range in the source field.
- The render button is disabled while any diagnostic has severity `error`, and while the selection is `unsupported-version`.
- Settings controls carry their documented range as input attributes, which makes out-of-range values unreachable by normal use without being the only thing preventing them; see [Settings validation](#settings-validation).
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
| Backgrounds that are not white | Tablature knockouts and fretboard open markers are filled with `knockoutFill`, so on a dark frame or over artwork they show as white blocks. The fix is either a theme-aware fill or a return to cutting string lines into segments, which needs no fill at all. |
| Color and theme settings | `inkColor` is fixed black. Exposing stroke and text color is a settings-table addition and a schema-compatible change. |
| Fretboard position label (`5fr` style) | Every drawn fret is labeled instead. |
| Muted strings in fretboard diagrams | An `x` input class was specified and then removed: muted strings are a chord-chart convention and are unusual in the fretboard diagrams this mode draws. Tablature is unaffected — there an `x` is a valid note cell, rendered as literal text. |
| Finger numbers inside fretboard dots | Would need new ASCII syntax. |
| Barre indicators | Same. |
| Multi-string-count sources in one tablature render | Currently `inconsistent-string-count`, an error. |
