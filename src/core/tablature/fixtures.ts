// The test-case sources from the spec's Tablature test cases section.
//
// Extracted from docs/spec.md verbatim rather than retyped: these sources are
// whitespace-significant, and a mistyped hyphen changes a slot structure
// silently.
//
// Sources live here; expectations live in the test that cares about them. The
// spec marks its test-case section *illustrative after M1 and M2* because every
// case asserts two separate things -- a parse result and a geometry -- so these
// strings are imported by parse.test.ts and, from M2, by layout.test.ts.
//
// Each comment below carries the spec's own name for the case, plus pairings and
// reuse. Nothing derived: a comment restating what a test asserts would go stale
// the moment that assertion changed, and nothing would catch it.
//
// TC-8 has no source of its own: it re-asserts TC-7's, as knockout rectangles.

/**
 * Strip the newline after the opening backtick and the one before the closing
 * one, so a fixture is exactly the lines written between them.
 */
const source = (text: string): string => text.replace(/^\n/, "").replace(/\n$/, "");

/** TC-1 — multiple rows. */
export const TC1 = source(`
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
`);

/** TC-2 — hyphenspace collapses. Its two row groups MUST parse identically. */
export const TC2 = source(`
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
`);

/** TC-3 — long note cells. */
export const TC3 = source(`
-3-----0-
-2h3p2-0-
---------
---------
---------
---------
`);

/** TC-4 — source-supplied labels. */
export const TC4 = source(`
e -----
B -----
G -1---
D -2---
A -2---
E -----
`);

/** TC-5 — sparse strings. */
export const TC5 = source(`
-0---0-
-------
-------
---2---
-------
-3---3-
`);

/** TC-6 — superfluous prefix characters. MUST parse identically to TC-4. */
export const TC6 = source(`
e |-----
B |-----
G |-1---
D |-2---
A |-2---
E |-----
`);

/** TC-7 — mixed cell widths and slot widening. Also TC-8's source. */
export const TC7 = source(`
-10-12b14----7-
-5-----------0-
---------------
---------------
---------------
-3-------------
`);

/** TC-9 — muted notes. */
export const TC9 = source(`
-x-3-
-x-3-
-x-0-
-x-0-
-x-2-
-x-3-
`);

/** TC-10 — measure breaks. */
export const TC10 = source(`
e|-1-|-2-|
B|---|---|
G|---|---|
D|---|---|
A|---|---|
E|---|---|
`);

/** TC-11 — empty measures. */
export const TC11 = source(`
----|----
----|----
----|----
----|----
----|----
----|----
`);
