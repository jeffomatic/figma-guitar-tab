# Examples

Paste any of these into the plugin to see what it draws.
Each mode has its own tab in the plugin window, and its own way of writing things down.

Both modes read the source top to bottom as highest string to lowest, the way tab is usually written.
Four, six and seven strings all work, and the string names default to standard tuning unless you write your own.

## Tab

Tab is written the way you'd find it online: one line per string, with fret numbers on hyphen-filled lines.
Spacing is tidied up for you, so you don't have to count hyphens.

### Chords and single notes

Notes that start in the same column are played together, and the plugin stacks them into a chord.
Two-digit frets like `10` and `12` line up with single digits, so a chord stays a chord however wide its numbers are.

<!-- Example goes here -->

```
```

### Measure lines

A `|` across every string draws a measure line.
The ones at the start and end of each line are optional: every row gets them anyway.

<!-- Example goes here -->

```
```

### Techniques and muted notes

Letters and symbols next to a fret number, like the `h` in `5h7` or the `/` in `5/7`, are drawn as written, right beside the number.
An `x` marks a muted note.

<!-- Example goes here -->

```
```

### Multiple rows and other tunings

A blank line starts a new row, so a long riff can wrap over several lines.
Put a name in front of each string, like `D` or `C#`, to label a different tuning.

<!-- Example goes here -->

```
```

## Fretboard

A fretboard diagram is written one line per string, listing the frets to mark on that string, separated by spaces.
A `0` marks an open string, an `x` marks a muted one, and an empty line leaves a string with nothing on it.

The plugin works out which frets to draw from the frets you name, leaving one empty fret either side.
When the shape is within a fret of the nut, the diagram starts at the nut.
Further up the neck it starts just below the shape, and the fret numbers show where you are.
**Frets before** and **Frets after** under **Options** change how much room the shape gets.

### Open E major chord

```
0
0
1
2
2
0
```

### Open D major chord

The two lowest strings aren't played, so they're marked `x`.

```
2
3
2
0
x
x
```

### G major scale, 2nd position

Rooted on the 3rd fret of the low E string.
The shape sits within a fret of the nut, so the diagram starts there and shows frets 1 to 6.

```
2 3
3 5
2 4 5
2 4 5
2 3 5
3 5
```

### B major scale, 6th position

The same shape as the G major scale, moved up four frets, so it's rooted on the 7th fret of the low E string.
The diagram starts at the 5th fret and shows frets 5 to 10, with no nut.

```
6 7
7 9
6 8 9
6 8 9
6 7 9
7 9
```
