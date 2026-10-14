// Sources for the fretboard tests.
//
// As for tablature, the tests own these and the spec doesn't copy them.
// Fretboard sources are only whitespace-delimited, so a mistyped space is less
// dangerous than a mistyped hyphen -- but a dropped token silently changes the
// shape.

/**
 * Strip the newline after the opening backtick and the one before the closing
 * one, so a fixture is exactly the lines written between them.
 */
const source = (text: string): string => text.replace(/^\n/, "").replace(/\n$/, "");

/** TC-F1 — scale shape. A G-major scale layout. */
export const TCF1 = source(`
2 3
3 5
2 4 5
2 4 5
2 3 5
3 5
`);

/** TC-F2 — open chord. A G-major open chord. */
export const TCF2 = source(`
3
3
0
0
2
3
`);

/** TC-F3 — source-supplied fretboard labels. TC-F2's chord, labeled. */
export const TCF3 = source(`
e 3
B 3
G 0
D 0
A 2
E 3
`);

/** TC-F4 — shifted window, no nut. TC-F1's box moved up to B major. */
export const TCF4 = source(`
6 7
7 9
6 8 9
6 8 9
6 7 9
7 9
`);

/** TC-F5 — muted strings. An open D major chord, the two lowest strings muted. */
export const TCF5 = source(`
2
3
2
0
x
x
`);
