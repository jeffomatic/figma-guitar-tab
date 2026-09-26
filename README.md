# figma-guitar-tab

A Figma plugin for creating guitar tabulature in design files.

## Product description

### Modes

The plugin has several modes, each implemented in a different tab of the plugin UI:

#### Traditional tab

This allows you to render traditional guitar tab, where the horizontal axis is time, and the vertical axis is guitar string, with highest on top and lowest on bottom. Frets are indicated by numbers.

The plugin will convert user-provided ASCII tab into a nicely-formatted set of line nodes and text nodes, with some small amount of masking to ensure that the lines don't make the text hard to read. For now, the plugin will only support string lines and "fret indicator strings", meaning we will not attempt to render fancy notation like slides and hammer-ons. A "fret indicator string" any string of text that is terminated by whitespace or a hyphen, allowing us to notate things like `4` (fretting the 4th string), `4/6` (a slide from the 4th string to the 6th string), `4h5` (hammer-on from the 4th string to the 5th string), etc.

The plugin should allow for tabulature that spans multiple "rows", where each "row" has its own set of 6 string line nodes, and the rows are arranged vertically with even spacing. For example, a tab that looks like this:

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

would be rendered as two row frames, each with six line nodes.

In all cases, the generated tab object should consist of a parent frame, containing one or more "row" frames.

Note that the plugin should collapse horizontal "hyphenspace", so that the following result in equivalent geometry:

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

The ASCII parser needs to pay attention to fret indicator strings that may be quite long. For example:

```
-3-----0-
-2h3p2-0-
---------
---------
---------
---------
```

The above example shows a hammer-on-pull-off on the 5th string, played simultaneously with a single note on the 6th string. The following chord (a couple of open strings) needs to be rendered so that both zeroes are to the right of the `2h3p2` indicator.

By default, string names are not provided. However, if the source ASCII provides string names, the plugin should render those as text nodes as well. For example:

```
e -----
B -----
G -1---
D -2---
A -2---
E -----
```

should cause string labels to be rendered. The plugin should just read the string labels literally, to allow for alternate tunings.

Source tab may contain some superfluous characters at the begining of each row of text, before or after the optional string labels. The superfluous characters include whitespace or pipe characters. These superfluous characters don't contribute anything to rendering, but since they are conventions of tabulature writing, we accommodate their presence.

This mode should allow for various render settings:

- Horizontal gap between simultaneous notes
- Stroke weight of string lines
- Vertical gap between strings
- Font size of text
- Vertical gap between rows

Both the ASCII source and render settings should be stored as plugin data on the parent frame.

#### Fretboard diagram

This mode renders a fretboard diagram, where the horizontal axis is fret number, and the vertical axis is string number. This allows us to visualize chord shapes and scale shapes that visually reflect the layout of the fretboard.

The ASCII representation of these diagrams is minimal. Like with tabulature, consecutive lines of ASCII text represent strings from highest to lowest. However, the horitontal simply represents frets on the fretboard. The specified frets are just whitespace-deliminated.

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

To render these, we show a "freboard" grid with horizontal line nodes representing strings, and vertical line nodes representing the fret boundaries. Below each vertical line, we render a text node that labels the fret number. If the ASCII source contains a fret number for a particular string, we draw a small black disc between the fret boundaries. `2` means to render the black dot between the vertical lines corresponding to the first and second fret. The width of the rendered fret gaps should be consistent and configurable, with a reasonable default.

For fretboard diagrams, generally want to render some "buffer" frets on the left and right of the frets indicated in the source. This should be configured in one of two modes:

* The "default" mode renders all frets on the neck of the fretboard, up to the maximum fret number specified in the source.
* The "custom" mode lets you specify the number of "leading" and "trailing" frets to render. The leading and trailing frets are relative to the lowest and highest fret numbers in the source, respectively.

The fretboard diagram should be rendered as a parent container frame, with both ASCII input and render settings stored as plugin data on that frame. The plugin should allow for in-place editing of the selected container frame, if that frame contains the appropriate plugin data.

## Implementation

### UI

The plugin should have an HTML UI that is implmented via React and TailwindCSS.

### Build/lint

* The build should use esbuild to perform TypeScript/JSX transpilation, as well as bundling. The project will provide a small custom plugin to incorporate TailwindCSS into the build.
* The build should be linted with oxlint, using recommended type-aware rulesets.