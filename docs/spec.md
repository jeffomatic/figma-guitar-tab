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
| **slot** | One position along a tablature row's horizontal axis, and the unit of horizontal spacing. A slot is either the note cells sounding together — at most one per string, decided by start column rather than by ordinal position — or a *measure break*, which has no cells and no width. Slots are ordered left to right. |
| **measure break** | A boundary between measures, written as a column of `|` characters spanning every string, and rendered as a vertical line joining the top and bottom string lines. Every row is bracketed by one whether or not the source writes it. |
| **slot advance** | The horizontal distance from one slot's left edge to the next slot's left edge. Borrowed from typography, where a glyph's advance is the distance from its origin to the next glyph's. It is not constant: a slot advances by its widest cell's width plus `noteGap`, so a slot holding a wide cell pushes the next one further out. |
| **row** | A horizontal band of tablature containing one set of string lines. A tab too long to fit one line of ASCII is split across several rows. |
| **row frame** | The Figma frame holding one row's line nodes and text nodes. |
| **row group** | The block of source lines that produces one row: the lines between two blank lines, one line per string. *Row* is the rendered band, *row group* its source. |
| **playable region** | What remains of a tablature source line after its string label and any leading whitespace are stripped. It begins with an opening measure break if the line writes one, and otherwise with a `-`. Column indices are measured from its first character, so prefixes of differing widths don't skew alignment. |
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
| String line stroke weight | — | `strokeWeight` | String weight |
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

The plugin will convert user-provided ASCII tab into a nicely-formatted set of line nodes and text nodes, with the string lines knocked out behind the text so that they don't make it hard to read (see [Tablature render model](#tablature-render-model)).
For now, the plugin will only support string lines and note cells, meaning we will not attempt to render fancy notation like slides and hammer-ons: the technique characters inside a cell are rendered as literal text, not as graphics.

### Parsing

Parsing is a pure function from source text to a row/slot structure.
It is independent of geometry: the same parse result rendered with different settings differs only in spacing.

**Step 1 — split into rows.** The source is split into *row groups* on blank lines (lines containing only whitespace).
Runs of consecutive blank lines count as one separator, and leading/trailing blank lines are discarded.
Each row group holds one line per string, ordered highest-pitched first.
A row group MUST have 4, 6 or 7 lines (`unsupported-string-count`), and every row group in a source must have the same count, or the rows could not align (`inconsistent-string-count`).

**Step 2 — split each line into prefix and playable region.** Every line has the form `label? whitespace* playable`:

| Part | Definition |
| --- | --- |
| `label` | Optional. A run of characters that are none of `-`, whitespace, `\|`. |
| `whitespace` | Any run of whitespace. Required if a `label` is present, optional otherwise. |
| `playable` | The *playable region*: the rest of the line. It begins with an optional opening measure break — a single `\|` — and then MUST have a `-` before anything else. |

Requiring a hyphen before any note cell is how real-world ASCII tab is written, and it is what makes the label boundary decidable: the playable region starts at the first `-`, or at the single `\|` immediately preceding it.
A line that doesn't fit the form is a `missing-leading-hyphen` error — `3-5-7` fails, because `3` is not followed by whitespace, so the line neither starts with a hyphen nor carries a terminated label.
All of `-----`, `|-----`, `e -----`, `e|-----` and `E |-2-` fit. `e| ---` does not: whitespace may precede the opening break but not follow it.

Column indices in step 4 are measured from the first character of the playable region, so lines whose prefixes differ in width (`e |`, `B|`) still align.
The opening measure break is inside that region rather than part of the prefix, so a line that writes one and a line that doesn't have origins one column apart — which is why a measure break must appear on every string or none, and why an inconsistent one is caught as a misalignment rather than silently shifting a row's columns.

**Step 3 — tokenize.** Within a playable region, a *note cell* is a maximal run of characters that are none of: `-`, whitespace, `|`.
Hyphens and spaces carry no meaning beyond separating cells, which is why hyphenspace collapses (TC-2).
A `|` is a measure break, not a separator, and carries the two rules below.
Each cell MUST contain at least one digit or at least one `x`/`X`; a cell that contains neither is a validation error.
A digit makes it a fret, and an `x` makes it a muted or dead note — the standard ASCII notation for a string struck without being fretted, which real-world tab uses freely (`-x-x-x-`, a muted strum on every string).
All other characters in a cell are technique notation and are preserved verbatim in the rendered text, as are the `x` characters themselves.

Each `|` in a playable region must satisfy both of:

- **It is flanked by hyphens**, on the left and on the right, unless it is the region's first character — an opening break has nothing to its left — or its last, where a closing break has nothing to its right.
  Otherwise it is a `measure-break-without-hyphens` error, anchored at the pipe. This is what rejects `-12|-`, where the pipe abuts a cell.
- **Its column carries a `|` on every string in the row group.** A measure break is a boundary across the whole row, so a pipe that only some strings write is a `misaligned-measure-break` error, anchored at each pipe in that column.

A break at the region's first or last column is **absorbed**: every row is bracketed by an opening and a closing break whether or not the source writes one, so writing them changes nothing and omitting them costs nothing. Only breaks between hyphen runs survive into the parse result.

**Step 4 — assign slots.** Each cell has a start column, and a column span `[start, start + length)`, within its playable region.
Cells in the same row group belong to the same *slot* when they share a **start column**, and each surviving measure break is a slot of its own.
Slots are ordered by column, interleaving the two kinds.
A note slot represents one moment in time: every cell in it is played simultaneously.
A break slot holds no cells and has no width; it exists to take up a position, so that the spacing rules give it a gap on each side.

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

**Step 5 — emit structure.** The parse result is an ordered list of row groups; each row group holds the string labels the source supplied, if any, and its ordered list of slots, note slots and break slots interleaved; each note slot holds at most one cell per string index.
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

The default tunings are in `src/core/settings.ts`: standard tuning for each supported string count, stored top to bottom so they drop straight into a row's labels.

These three counts are the instruments the plugin supports: four is standard bass tuning, six is standard guitar, and seven adds the conventional low `B` beneath it.
A source with any other string count is rejected, so every rendered diagram has a default tuning available and a label for every string.

The `label` part of the line grammar in [step 2](#parsing) is the label.
A prefix of whitespace alone carries no label.
A leading `|` is an opening measure break, which every row gets regardless, so writing one changes nothing about the result (TC-6).

Pipes inside the playable region are measure breaks; see [step 3](#parsing).

### Tablature render model

All lengths are in Figma pixels.
Symbols below refer to the settings table in [Tablature render settings](#tablature-render-settings).
Text measurement, fonts and vertical centering are specified once for both modes in [Text, fonts and measurement](#text-fonts-and-measurement).

#### Node tree

The tree is built by the renderer in `src/plugin/render.ts`: a parent frame carrying the plugin data, holding one row frame per row group, each holding that row's string labels, string line segments, measure breaks and note-cell text.

- The parent frame uses vertical auto-layout with `itemSpacing` = **rowGap**, no padding, and no fill.
  Row frames are absolutely positioned internally (text overlaps the string lines' band), have no fill, and are resized to their computed extent.
- Every frame sets `clipsContent = true`, which is also Figma's default.
  A frame's bounds therefore have to contain its ink, which is what `padY` is for.
- Every index in a layer name is **0-based**, matching the formulas: `Row 0` is the first row, `String 0` the highest-pitched string, `Slot 2 String 1` the cell on the second string in the third slot.
  Numbers that are not indices keep their real values — a fretboard's `Fret Label 7` is fret 7, not the eighth fret drawn.
- Layer names are for legibility and debugging, not identity: a re-render rebuilds the row frames wholesale rather than diffing them.
  Persistence and re-edit are specified in [Persistence and re-edit](#persistence-and-re-edit).
- A newly generated parent frame is **centered on the default location** and left selected: the document position of the center of the current viewport when that is available, and the origin otherwise.
  Centered, not cornered — a frame whose top-left sat at the center of the view would appear in its lower-right quadrant and usually overflow it.
  It is appended to the current page, never into whatever node happens to be selected, so placement doesn't depend on the selection.

#### Coordinates

Every formula and figure lives in `src/core/tablature/layout.ts` and its tests.
What follows is the shape of the model and why it is shaped that way.

A row is a label column, then a band of evenly spaced string lines, then the note cells positioned along them.
Two quantities are named here because the rest of this document refers to them:

- **`L`**, the label column's width: the widest label that row renders, plus `stringLabelGap`. String lines start at `L`.
- **`padY`**, the vertical padding above the first string and below the last: half the tallest ornament on a string line, plus `clearance`.

Each slot's left edge accumulates from the previous slot's: a slot advances by its widest cell plus `noteGap`, and a break slot has no cells, so it advances by `noteGap` alone.
A break therefore sits one full gap from whatever precedes it and one full gap from whatever follows, which is what makes a row of measures read evenly.

The row is **bracketed by measure breaks**: the opening one sits at `L`, where the string lines begin, and the closing one a full gap past the last slot, where they end.
Those two replace what used to be a half-gap lead-in and tail-out, and they are drawn whether or not the source wrote them.

The row's width is the closing break's position plus **a whole stroke weight**.
Half of one is what the break's ink actually occupies, and it is not enough: it puts the ink's outer edge exactly on the bounds of a frame that clips, where it is cut. A whole weight leaves the ink strictly inside, which is the same slack `padY` leaves vertically with `clearance`. The left edge needs no allowance, since `L` is always wider than the heaviest stroke.

`padY` exists for two reasons, and is not cosmetic:

- Text on the first and last strings is centered on those strings, so without it half of each glyph would fall outside the row frame and be clipped.
- Because the parent is auto-layout, the visual gap between rows is the distance between row-frame bounds.
  With `padY` those bounds equal the row's ink, so `rowGap` is the gap the user actually sees; without it, rows would overlap by `fontSize / 2` and the apparent gap would be `rowGap` minus that.

There is no horizontal padding: the leftmost label starts at exactly `x = 0`, and the frame itself is what the user moves.
The fretboard diagram pads vertically the same way, with the same `clearance`, over its own tallest ornament.

`L` is computed **per row group**, from that row's own labels.
Row groups whose labels differ in width therefore start their string lines at different `x`, and the rows do not align with each other.
That is deliberate: the rendering respects what the ASCII says, rather than imposing a column width the source didn't ask for.

Two properties of this model are worth stating, because the obvious simpler formula (`x = n × noteGap`) breaks on the test cases below:

- **Slots widen to fit their contents, and the gap stays constant.** The advance is the widest cell's width *plus* `noteGap`, so the whitespace between a cell and the next slot is exactly `noteGap` however wide the cells are.
  A cell like `2h3p2` is five characters and pushes its slot out by all of them; without that, a long cell overlaps its neighbor's text and its gap swallows the string line under the next slot (TC-3, TC-7).

  This replaced an earlier rule, `max(noteGap, cellWidth + minimumGap)`, which treated the setting as a *minimum advance*.
  That version applied two rules at once — narrow slots were governed by the pitch, wide ones by the separate minimum — so the whitespace *shrank* as cells grew wider, and a wide cell ended up nearly touching the next slot.
  One rule, one gap: the uniformity is what makes a row read as evenly spaced, and it is asserted directly rather than inferred from the per-case figures.
- **Cells are left-aligned, not centered.** Every cell in a slot starts at the same left edge, which is what the ASCII source shows: all cells of one chord begin in the same character column.
  Centering would stagger them whenever a slot mixes widths — a `10` and a `5` on different strings would no longer line up (TC-7).
  Text nodes therefore use left horizontal alignment and are positioned by their left edge, never by a center point.

#### String lines and gaps

Each string is drawn as **one or more horizontal segments** that together span `x` from the opening measure break to the closing one, as thick as **strokeWeight** in **inkColor**, centred on the string's `y`.
Wherever a note cell sits on a string, the line stops short of the cell's text and resumes after it, leaving a **gap**.
Nothing is drawn in a gap, so whatever is behind the diagram shows through: the rendering makes no assumption about the background.
Each measure break is one **vertical** line at its own `x`, running from the top string's `y` to the bottom string's, as thick as **strokeWeight** in **inkColor** — and overshooting each end by **half a stroke weight**, so that it covers the full thickness of the string lines it meets.

**Every line is drawn as a rectangle, not a `LineNode`.** A `LineNode`'s ink does not sit where its geometry says: a rotated one draws off along its length, and a horizontal one does not straddle its `y`. A rectangle's ink fills exactly its bounds, so a line of thickness `w` centred on a coordinate is a rectangle offset by `w / 2` — which is what makes a break meet a string line squarely, since both are then positioned from the same centre line by the same half-thickness. This is a rendering concern: layout emits a line as two endpoints and a thickness, and says nothing about which node draws it.
A string segment is an ordinary scene line, so the renderer needs nothing new to draw one.

The overshoot is what makes the row's corners clean. A break that stopped at the top string's `y` would stop at the *centre* of that string's stroke, leaving the outer half of its thickness uninked where the two lines meet: a notch at the corner, most visible at the closing break where there is no further line to hide it. Overshooting covers exactly that half. On an interior break it is invisible, running half a stroke past the outer strings and well inside `padY`.

Each note cell cuts one gap, computed from that cell alone: from `clearance` before the cell's left edge to `clearance` past its right edge.
The right edge comes from **that cell's** measured text, never from the width of the slot it sits in — which is the distinction the properties below depend on.
A gap has no height of its own: the line is simply absent across it.

A string's segments are the complement of its gaps within the span from the opening break to the closing one:

- Gaps that overlap or touch are merged before the complement is taken, so two gaps never leave a zero-length segment between them.
- "Touch" is decided with a small tolerance that exists only to absorb floating-point noise from measurement, so two gaps that meet exactly don't leave a sliver.
  Any segment longer than that is drawn, however short.
- A gap never reaches a measure break, including the two that bracket the row.
  Every break sits a full `noteGap` from the nearest cell, so at least `noteGap − clearance` of line separates a gap from a break, and the gap needs no clamping to the row.
- A string with no cells is a single segment spanning the row.

Segments are named `String i Segment k`, with `k` counted 0-based from the left within each string, and a string that is one segment is still `String i Segment 0`.

Z-order within a row frame is string labels, then string segments, then measure breaks, then cell text.
Nothing overlaps a string line any more, so the order hides nothing; it is fixed so that the layer list reads the same way in every render.
Three properties follow, all asserted in TC-8:

- **A string not played during a slot runs straight through it**, because a cell that doesn't exist cuts no gap — even where a long cell on another string has made that slot wide.
- **A cell narrower than its slot cuts only its own width**, since the gap is sized from the cell's text rather than from the widest cell in the slot.
- **Consecutive gaps on one string are separated by `noteGap − 2 × clearance` of line.**
  That is 12 px at the defaults, and zero only at `noteGap`'s minimum, where the merge rule above turns two gaps into one rather than leaving an empty segment.

This replaced an earlier model in which each string was one unbroken line and an opaque rectangle, filled with `knockoutFill`, hid the line behind each cell.
That model needed no interval arithmetic, but it assumed a white background, and showed as white bars on Figma's grey canvas or on any frame or artwork that wasn't white.
Segments need no fill, so the background problem disappears rather than being themed around.
The gap's horizontal extent is exactly the span the knockout covered, so the visual spacing between a cell and its string line is unchanged.

### Tablature render settings

Settings are per-parent-frame and stored with the ASCII source as plugin data on the parent frame.

Five are user-configurable: `noteGap`, the whitespace between a note cell and the next slot; `strokeWeight`; `stringGap`; `fontSize`, which governs both string labels and note cells; and `rowGap`.
`noteGap`'s minimum is what keeps two cells from ever touching, so no separate minimum-gap constant is needed.
Their defaults and ranges are in `src/core/settings.ts`, which is also where the UI reads the `min`, `max` and `step` for its inputs.

Everything else is fixed for v1 and lives in the same module: `clearance`, the space between a note cell's text and the string line on either side of it; `stringLabelGap`; `inkColor`; `fontFamily`, `Roboto Mono` falling back to `Roboto`; and `defaultTunings`.

### Tablature test cases

These nine sources are **normative inputs**: the tests use them by name, and `src/core/tablature/fixtures.ts` is extracted from the fenced blocks below verbatim.
Add a case here and a fixture follows.

What each case *asserts* — slot structures, pixel positions, node counts — lives in `src/core/tablature/parse.test.ts` and `layout.test.ts`.
Those numbers were deleted from this document when M2 landed, deliberately: a figure maintained in two places drifts, and the tests are the copy that fails when it is wrong.

**TC-1 — multiple rows.** Renders as two row frames under one parent frame, with `rowGap` between them.
Both rows hold the same slots, so their geometry must come out identical — which is what proves row coordinates are row-local and that `rowGap` never leaks into one.
The labels are defaulted, and each string's five cells cut its line into six segments, with no two gaps touching.

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

**TC-2 — hyphenspace collapses.** These two row groups MUST parse to identical slot structures, and therefore render with identical geometry.

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
`2h3p2` is five characters wide, so its slot advances by all of that plus `noteGap`.
The case exists to pin that the following zeroes start a full gap clear of that text, not merely one pitch along.

```
-3-----0-
-2h3p2-0-
---------
---------
---------
---------
```

**TC-4 — source-supplied labels.** The labels come from the source rather than from standard tuning, read literally so alternate tunings pass through unchanged.
A source label overrides the default for its position.

```
e -----
B -----
G -1---
D -2---
A -2---
E -----
```

**TC-5 — sparse strings.** The `2` on the 4th string belongs to the second slot, not the first: ordinal alignment within a string would wrongly make it simultaneous with the first chord.
It is also alone in its slot, so only one string has a gap there.

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

**TC-7 — mixed cell widths and slot widening.** The case that defeats `x = n × noteGap`.

```
-10-12b14----7-
-5-----------0-
---------------
---------------
---------------
-3-------------
```

Its first slot mixes a two-character cell with two one-character cells, and all three share one left edge.
Its second slot holds a five-character cell, so it advances by that width plus `noteGap`, and the third slot starts a full gap clear of it — the same gap the first slot gets, which is the point.
The source supplies no labels, so the label column holds standard tuning — which is why the first slot does not begin at half a pitch from the frame's edge.

**TC-8 — string gaps.** The TC-7 source again, asserting the string segments rather than the slots.
Its six cells cut six gaps, and the row's scene holds no `rect` items at all.
The cases this pins down, with strings numbered from 0 at the top:

- Strings 2, 3 and 4 have no cells, so each is a single segment spanning the row.
- String 1 has no cell in the second slot, so its line runs unbroken across that slot, even though the slot is wide for `12b14` on string 0.
  Its gaps are in the first and third slots only, which leaves it three segments.
- String 1's gap in the first slot is narrower than string 0's, because each is sized from its own cell's width (`5` versus `10`).
- On string 0, the segment between the `12b14` gap and the `7` gap is `noteGap − 2 × clearance` long: the shortest a segment gets at the defaults.

**TC-9 — muted notes.** A muted strum followed by an open G chord.
No diagnostics: an `x` is as valid a cell as a digit, and is rendered verbatim.

```
-x-3-
-x-3-
-x-0-
-x-0-
-x-2-
-x-3-
```

Every cell is one character, so every slot advances by the same amount and every gap is the same width — an `x` is measured and laid out exactly like a fret number, with no special case anywhere in parsing or layout.

**TC-10 — measure breaks.** Interior breaks between note slots, with an explicit opening and closing break that the row would have drawn anyway.
Pins that a break takes a position of its own with a full gap on each side, and that writing the edge breaks changes nothing.

```
e|-1-|-2-|
B|---|---|
G|---|---|
D|---|---|
A|---|---|
E|---|---|
```

**TC-11 — empty measures.** Two measures with no notes in either, and no edge breaks written.
A row with no note cells at all is still renderable when it has breaks to draw, which is the case `empty-row-group` must not reject.

```
----|----
----|----
----|----
----|----
----|----
----|----
```

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

A fret token is exactly `0`, or a digit `1`–`9` followed by any number of digits.
Nothing else parses: `00` has a leading zero, `3.5` is not an integer, `+3` and `3x` carry characters that are not digits.
Each is a `bad-token` error rather than a value the plugin guesses at.

The **first** whitespace-delimited token on a line is a string label when it does not begin with a digit and is not `x` or `X`.
So `e 2 3` labels the string `e` and frets 2 and 3, while `3` alone is a fret and `x` alone mutes the string.
Requiring a label not to start with a digit keeps a mistyped fret number a fret number rather than silently becoming a label.
No tuning is named `x`, so a muted marker is never mistaken for a label; a labeled muted string is written `E x`.
Only the first token can be a label; a token anywhere else that is not a fret or a muted marker is a `bad-token` error.

A string is open, fretted or muted, and only one of them: a `0` MUST NOT be combined with a fret number, and an `x` MUST NOT be combined with a `0` or a fret number.
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
   A source whose only markers are `0` or `x` has no frets to measure from; it takes `lo = 1`, `hi = minFrets`, and is done.
2. `lo` is clamped to a minimum of `1`: there is no fret 0 to draw, and none below it.
3. If the source contains any `0`, `lo` is forced to `1`, since an open-string marker is drawn relative to the nut.
   A muted marker does **not** force the nut: it says nothing about frets, and forcing it would stretch a muted barre chord high on the neck down to fret 1.
   It sits on boundary 0, which is the nut only when the window reaches it.
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

The worked examples — an open chord, a shape high on the neck, and the clamps at both ends — are in `src/core/fretboard/layout.test.ts`, which is authoritative for the window.

### Fretboard render model

Let `M = hi − lo + 1` be the number of frets drawn.
*Fret boundary `j`* (for `j = 0…M`) is the vertical line at the left edge of fret `lo + j`, so boundary `M` is the right edge of the last fret.
Boundary `0` is the **nut** when `lo = 1`.

#### Node tree

The tree is built by `renderFretboard` in `src/plugin/render.ts`, from the scene's items in order: a single parent frame carrying the plugin data, holding the string labels, fret boundaries, string lines, dots, open discs, muted markers and fret labels directly, with no row frames.

- The parent frame has no auto-layout, no padding and no fill, and is resized to the scene's extent.
  Re-rendering a frame that was tablature switches its auto-layout off, since the render target follows the selection whatever mode the frame was.
- Layer names follow tablature's rule: indices are 0-based, and a fret label is named for its absolute fret number.
- Dots and open discs are ellipses whose stroke, when they have one, sits inside the disc, so a disc's ink is exactly `dotDiameter` across.
- A muted marker is three nodes: an ellipse, then its two diagonal strokes.
  The strokes are the only lines that are not axis-aligned, and are drawn as rectangles like every other line, rotated by a transform core computes.

#### Coordinates

Every formula and figure lives in `src/core/fretboard/layout.ts` and its tests.
What follows is the shape of the model and why it is shaped that way.

`L` is the label column width, exactly as in tablature: the widest label plus `stringLabelGap`.
It is never 0, because every string has a label — which is what keeps the open disc inside the frame: `L` is at least `stringLabelGap`, comfortably more than half the `dotDiameter` that a disc centered on the nut extends to its left.
The whole board is offset right by `L`, which leaves the label column to its left.

Fret boundaries are evenly spaced `fretGapWidth` apart from `x = L`, and strings `stringGap` apart from `y = padY`.
Boundary lines span the strings from top to bottom, overshooting each end by half a stroke weight as tablature's measure breaks do, so the nut and every boundary cover the full thickness of the outer string lines rather than stopping at their centres; string lines span the boundaries from the nut, or boundary 0, to the last.
The frame extends a full stroke weight past the last boundary, so its ink is not clipped.
Beneath the board, after `fretLabelGap`, is one row of fret labels, and the frame ends at their bottom edge.
String labels are right-aligned to `x = L − stringLabelGap` and centered on their string's `y`, as in tablature.

- `padY` exists for the same reason as in tablature: a dot, an open disc or a label centered on the first string would otherwise extend above the frame.
  It is half the tallest thing drawn on a string line, plus `clearance`.
- Fret labels sit **beneath each fret gap**, not beneath each boundary line, so a label is directly under the dots it applies to.
  This supersedes any reading of "below each vertical line".
- The nut is drawn with `nutStrokeWeight`; every other boundary and every string uses `strokeWeight`.
- A **fretted note** is a disc of `dotDiameter` filled with `inkColor`, centered in its fret gap, which covers the string line beneath it.
- An **open string** is a disc of the same `dotDiameter` superimposed on the nut, centered at `x = L` and on the string's `y`, with a `strokeWeight` stroke in `inkColor` and a `knockoutFill` fill.
  The fill is what makes it read as an open marker rather than a fretted one: the nut line and the string line both stop at its edge instead of running through it.
  There is no fret gap for an open string to sit in — fret 1's gap belongs to a source token of `1` — so the disc goes on the nut itself, which is why any `0` forces the window to include the nut.
- A **muted string** is a disc of the same `dotDiameter` at the same place, on boundary 0, filled with `knockoutFill` and with no stroke, carrying an X: two diagonal strokes of `strokeWeight` in `inkColor`, crossing at the disc's centre.
  The fill stops the nut and string line at the disc's edge, as for an open string, and the missing outline is what tells the two apart.
  Each stroke is as long as it can be while its ink, square ends included, stays inside the disc.
- `dotDiameter` MUST exceed `nutStrokeWeight`, or an open disc cannot cover the nut it sits on.
  At the defaults it is 10 against 4.
- Z-order is boundaries and string lines first, then dots, open discs and muted markers, then fret labels.
  An open disc or muted marker drawn before the nut would be hidden by it.
- The open and muted discs' fill assumes a white background, and they are the last things in either mode that do; see [Non-goals](#non-goals).

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

Settings are per-parent-frame and stored with the ASCII source as plugin data on the parent frame; see [Persistence and re-edit](#persistence-and-re-edit).

Six are user-configurable: `fretGapWidth`, the width of each drawn fret; `stringGap`; `strokeWeight`, for strings and fret boundaries alike; `fontSize`, which governs both string labels and fret labels; and `leadingFrets` and `trailingFrets`, which buffer the [fret window](#fret-window).
Their defaults and ranges are in `src/core/settings.ts`, which is also where the UI reads the `min`, `max` and `step` for its inputs.
`leadingFrets` and `trailingFrets` count frets, so they are whole numbers; see [Settings validation](#settings-validation).

Everything else is fixed for v1 and lives in the same module: `clearance`; `minFrets`, the narrowest window; `maxFret`, the highest fret a source may name and the highest the window may reach; `nutStrokeWeight`; `dotDiameter`; `fretLabelGap`; `stringLabelGap`; `defaultTunings`; `knockoutFill`, the open and muted discs' fill; `inkColor`; and `fontFamily`, shared with tablature.

### Fretboard test cases

These sources are **normative inputs**: the tests use them by name, and `src/core/fretboard/fixtures.ts` is extracted from the fenced blocks in this section and in [ASCII input](#ascii-input) and [Fretboard string labels](#fretboard-string-labels) verbatim.

What each case *asserts* — markers, windows, pixel positions, node counts — lives in `src/core/fretboard/parse.test.ts` and `layout.test.ts`, and those numbers were deleted from this document when M6 landed.

**TC-F1 — scale shape.** The G-major scale source in [ASCII input](#ascii-input) at the default settings: a window that reaches the nut because the shape sits within a fret of it, one dot per fretted note, no open markers, and string labels defaulted.

**TC-F2 — open chord.** The G-major chord source in [ASCII input](#ascii-input) at the default settings: dots for the fretted strings, open-string discs superimposed on the nut, and default string labels to the left of the board.

**TC-F3 — source-supplied fretboard labels.** The labeled source in [Fretboard string labels](#fretboard-string-labels): TC-F2's chord, with label text nodes taken from the source rather than defaulted, and every boundary, string, dot and open marker offset right by `L`.
The open-string discs are centered at `x = L`, on the nut, and each carries both a `knockoutFill` fill and an `inkColor` stroke — without the fill the nut line would run through the disc, and without the stroke it would be invisible.

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

Because the window starts at fret 5, **no nut is drawn**: boundary 0 is an ordinary `Fret Boundary 0` at `strokeWeight`, not a `Nut` at `nutStrokeWeight`.
The source has no `0`, so the rule forcing `lo` to 1 does not fire.

The nut's absence is not a setting here — it falls out of the shape sitting five frets above it.
To pull the nut into view anyway, a `leadingFrets` of 5 or more would reach it, since the lowest source fret is 6.

The case asserts the full geometry at the default settings, and in particular:

- Fret labels show **absolute fret numbers**, not positions within the window — a shifted window is the only case where those differ, and getting it wrong makes every high-position diagram silently mislabeled.
- The leading and trailing buffer frets contain no dots.
- The low E string's two dots sit on frets 7 and 9, which carry the root and the 9th.
- Nothing is drawn within `clearance` of the top of the frame or below its bottom: `padY` keeps the first string's ornaments inside the frame.

**TC-F5 — muted strings.** An open D major chord, with the two lowest strings muted.

```
2
3
2
0
x
x
```

Both muted strings carry an X on a `knockoutFill` disc with no outline, centered at `x = L` like the open disc on the D string.
The window is TC-F2's: the `0` is what pulls it to the nut, not the `x` markers.

## Text, fonts and measurement

*Authoritative: `src/core/measure.ts` for the measurement contract, and `src/plugin/` for the real measurer and for font resolution. What follows is why they work this way.*

These rules are shared by both modes.

### Measuring text

Tablature slot widths depend on measured text, and so does the label column width `L` in both modes, so layout cannot be computed from the parse result and settings alone.
Layout therefore takes a `measure(text, fontSize) => width` function as a parameter rather than reaching for a measurement API itself.
This keeps layout a pure function and keeps its output deterministic in tests.

- **In the sandbox**, which is the only place layout runs, `measure` is Figma-backed: it sets the characters on one reusable hidden `TextNode` and reads its `width`, then removes it after the render.
  This is authoritative for any family, including the proportional `Roboto` fallback.
- **In tests**, `measure` is `src/core/`'s analytic monospace implementation: `width = text.length × fontSize × advanceRatio`.
  Every px figure in the layout tests is computed with it, so expectations are exact and need no Figma runtime.
- The analytic measure is a **test double, not a fallback**: the plugin never renders with it.

`advanceRatio` is therefore not a font metric, and nothing about the rendered output depends on its value:

- It cannot affect a real render, because the sandbox always measures with Figma.
  A wrong value would make the test fixtures disagree with reality, not make the plugin render incorrectly.
- The ratio is chosen for being round and for being close to real monospace metrics, so fixture numbers stay plausible when read as sanity checks.
  It is not a measurement of Roboto Mono, and a more precise figure would buy nothing.
- Because the ratio is a stub, making `fontFamily` configurable later changes nothing here: the sandbox measures whatever family it is handed, and the tests keep their arithmetic.

What the fixtures do pin down is the **layout formulas**, not the font.
If `advanceRatio` ever changes, every expected px figure moves with it and the formulas stay as written — which is why the layout tests assert against an expression built from the settings constants, alongside the literal.

### Fonts and text nodes

Both modes create text nodes through one helper, `src/plugin/font.ts`, which is what makes the decisions below hold for the fretboard diagram as well as for tablature.
If that helper is ever bypassed, every vertical formula in this document silently stops being true.

- The default family is `Roboto Mono` Regular, falling back to `Roboto` Regular if it fails to load — `Roboto` is always available in Figma.
  The family is resolved **once per render** and used for both measurement and drawing.
  Measuring in one family while drawing in another would compute every slot width from a font that is not on screen, and nothing would fail: `src/plugin/` carries no tests.
- A text node's line height is **pinned** to its font size rather than left automatic.
  Figma's default auto line height is roughly 1.2 × `fontSize` and varies by family, so a node's height would otherwise be a font metric this document cannot predict.
  Pinning it makes every text node exactly `fontSize` tall, which is what `padY` and the row-height formulas assume, and keeps `measure` a width-only function.
- Vertical centering is on the **em box**, not on the digits' cap height, so glyphs sit marginally high.
  Accepted for v1 rather than corrected with a font-dependent nudge.

## Persistence and re-edit

Both modes render into a parent container frame that stores its own ASCII source and render settings as plugin data, so a generated diagram can be re-edited in place.

### Plugin data keys

*Authoritative: `src/core/pluginData.ts` for the keys and the decoding, `src/plugin/pluginData.ts` for the I/O.*

Written with `node.setPluginData` on the parent frame — **private** plugin data, not shared plugin data.
Figma stores only strings, so the schema version is a decimal string, the source is stored verbatim, and the settings are JSON.

A frame is recognized as plugin-generated when its schema version and mode are both present and readable, **and it carries a source**.
The source is what makes the three [selection cases](#in-place-edit-flow) exhaustive: a frame of ours with no source has nothing to edit, so it is reported as if nothing were selected and the user is told the data could not be read.
`getPluginData` returns an empty string for a key that was never set, and a rendered frame can never store an empty source — `empty-source` is an error, so the render would have been refused — so absent and empty mean the same thing, and both mean corrupt.

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

2. `init.command` is `"edit"` only when `selection` is `editable`, and `"run"` in every other case.
   A relaunch button can only exist on a frame the plugin generated, but that frame may still carry an `unsupported-version` schema, so the two fields are reported independently and the UI trusts `selection`.

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
7. Generated frames call `node.setRelaunchData({ edit: "" })`, which gives the frame an Edit button in Figma's design panel.
   The manifest MUST declare a matching `relaunchButtons` entry, and that entry is what supplies the button's label.
   The value passed here is an optional *description* shown beneath the button, so it is left empty rather than repeating the label as a subtitle.
   On relaunch the plugin reads `figma.command === "edit"`, resolves the selection as in step 1, and reports `command: "edit"` only if that resolution produced an `editable` state.

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

Sandbox to UI: `init`, the reply to `ui-ready`, carrying how the plugin was launched, the per-user defaults and the current selection; `selection`, pushed on every selection change; and `render-done` or `render-failed`, the latter carrying a user-facing message and the offending error diagnostics, if any.

`SelectionState` is one of three cases — nothing editable selected, a recognized generated frame, or a generated frame whose `schemaVersion` is newer than this plugin supports — and what each means for the UI is described in [In-place edit flow](#in-place-edit-flow).

Rules:

- The sandbox never pushes unsolicited state before receiving `ui-ready`; the iframe may not be mounted yet.
- `render` is idempotent: sending it twice with identical payloads for an `existing` target produces the same node structure and properties.
  Node ids are not stable across renders, since every child is rebuilt.
- The UI MUST NOT block its own input on a round trip.
  Validation shown while typing comes from the local parser, not from a sandbox reply.
- `TablatureSettings` and `FretboardSettings` live in `src/core/settings.ts`; adding a setting means editing that module.
  The two modes share no settings type, which is why every message carries a `Diagram` rather than a loose `mode` and `settings` pair — a `"fretboard"` mode can't be paired with tablature settings.
  `ParseError` is defined in `src/core/diagnostics.ts`; see [Error handling and validation](#error-handling-and-validation) for what the diagnostics mean.
- A receiver narrows on a message's `type` before trusting its payload, since `postMessage` delivers `unknown`.
  Settings arriving over the wire are clamped regardless, so a hand-crafted message cannot put an out-of-range value into a render.

## Error handling and validation

Validation runs in the pure parser, so the UI and the sandbox reach identical verdicts.
A **warning** renders anyway; an **error** blocks rendering.

*Authoritative for the diagnostic type itself: `src/core/diagnostics.ts`; for each mode's codes and anchors, that mode's parser and its tests. Severities, and the reasoning for them, are normative.*

A diagnostic carries a severity, a stable kebab-case `code` for tests and i18n, a one-sentence user-facing `message`, and, where possible, an anchor: a line, and optionally a column and length.
A diagnostic about a setting has no anchor, since it is wrong whatever the source says.
The anchor is what lets the UI select the offending text when a diagnostic is clicked, so a code that *can* name a precise run should.
Lines and columns are 0-based — the line within the whole source, the column within that raw line, prefix included.

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
| `source-too-large` | Source exceeds 50,000 characters | error | Keeps the serialized plugin data well inside Figma's per-key limit |
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

| Code | Condition | Severity | Behavior |
| --- | --- | --- | --- |
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
| Fretboard open and muted markers on backgrounds that are not white | Open and muted discs are filled with `knockoutFill`, so on a dark frame or over artwork they show as white discs. Tablature no longer has this problem: its string lines are cut into segments around each cell (see [String lines and gaps](#string-lines-and-gaps)). The fretboard fix is either a theme-aware fill or cutting the nut and string lines around the disc the same way. |
| Color and theme settings | `inkColor` is fixed black. Exposing stroke and text color is a settings-table addition and a schema-compatible change. |
| Fretboard position label (`5fr` style) | Every drawn fret is labeled instead. |
| Finger numbers inside fretboard dots | Would need new ASCII syntax. |
| Barre indicators | Same. |
| Multi-string-count sources in one tablature render | Currently `inconsistent-string-count`, an error. |
