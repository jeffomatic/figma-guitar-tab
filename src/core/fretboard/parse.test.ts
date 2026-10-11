import { describe, expect, it } from "vitest";

import { TCF1, TCF2, TCF3, TCF4 } from "./fixtures";
import { parseFretboard, type FretboardParse } from "./parse";

const codes = (parse: FretboardParse): string[] => parse.diagnostics.map((d) => d.code);
const lines = (...text: string[]): string => text.join("\n");

/** A six-string source with `first` on top and five plain fretted strings beneath. */
const withTop = (first: string): string => lines(first, "3", "3", "3", "3", "3");

const anchor = (parse: FretboardParse, index = 0) => {
  const d = parse.diagnostics[index];
  if (!d) throw new Error(`no diagnostic at ${String(index)}`);
  return { code: d.code, severity: d.severity, line: d.line, column: d.column, length: d.length };
};

describe("fretboard structure", () => {
  it("TC-F1 scale shape", () => {
    const parse = parseFretboard(TCF1);
    expect(codes(parse)).toEqual([]);
    expect(parse.stringCount).toBe(6);
    expect(parse.labels).toBeNull();
    expect(parse.strings.map((s) => s.frets)).toEqual([
      [2, 3],
      [3, 5],
      [2, 4, 5],
      [2, 4, 5],
      [2, 3, 5],
      [3, 5],
    ]);
    expect(parse.strings.some((s) => s.open)).toBe(false);
    expect(parse.strings.flatMap((s) => s.frets)).toHaveLength(15);
  });

  it("TC-F2 open chord", () => {
    const parse = parseFretboard(TCF2);
    expect(codes(parse)).toEqual([]);
    expect(parse.labels).toBeNull();
    expect(parse.strings.map((s) => s.open)).toEqual([false, false, true, true, false, false]);
    expect(parse.strings.map((s) => s.frets)).toEqual([[3], [3], [], [], [2], [3]]);
  });

  it("TC-F3 source-supplied fretboard labels", () => {
    const parse = parseFretboard(TCF3);
    expect(codes(parse)).toEqual([]);
    expect(parse.labels).toEqual(["e", "B", "G", "D", "A", "E"]);
    // The labels change nothing about the markers: it is TC-F2's chord.
    expect(parse.strings).toEqual(parseFretboard(TCF2).strings);
  });

  it("TC-F4 shifted window, no nut", () => {
    const parse = parseFretboard(TCF4);
    expect(codes(parse)).toEqual([]);
    expect(parse.strings.map((s) => s.frets)).toEqual([
      [6, 7],
      [7, 9],
      [6, 8, 9],
      [6, 8, 9],
      [6, 7, 9],
      [7, 9],
    ]);
    expect(parse.strings.some((s) => s.open)).toBe(false);
  });

  it("tokens may appear in any order, and are sorted", () => {
    const parse = parseFretboard(withTop("5 2 3"));
    expect(parse.strings[0]?.frets).toEqual([2, 3, 5]);
  });

  it("whitespace between and around tokens doesn't matter", () => {
    expect(parseFretboard(withTop("   2    3  ")).strings).toEqual(
      parseFretboard(withTop("2 3")).strings,
    );
  });

  it("supports 4, 6 and 7 strings", () => {
    for (const count of [4, 6, 7]) {
      const parse = parseFretboard(Array.from({ length: count }, () => "3").join("\n"));
      expect(codes(parse)).toEqual([]);
      expect(parse.stringCount).toBe(count);
      expect(parse.strings).toHaveLength(count);
    }
  });

  it("a blank line is a string with no marker", () => {
    const parse = parseFretboard(lines("3", "", "0", "", "2", "3"));
    expect(codes(parse)).toEqual([]);
    expect(parse.strings[1]).toEqual({ open: false, frets: [] });
    expect(parse.strings[3]).toEqual({ open: false, frets: [] });
  });

  it("trailing blank lines are trimmed", () => {
    const parse = parseFretboard(`${TCF2}\n\n   \n`);
    expect(codes(parse)).toEqual([]);
    expect(parse.stringCount).toBe(6);
  });

  it("a markerless string in a labeled source still writes its label", () => {
    const parse = parseFretboard(lines("e 3", "B", "G 0", "D 0", "A 2", "E 3"));
    expect(codes(parse)).toEqual([]);
    expect(parse.labels).toEqual(["e", "B", "G", "D", "A", "E"]);
    expect(parse.strings[1]).toEqual({ open: false, frets: [] });
  });

  it("labels are read verbatim, any tuning", () => {
    const parse = parseFretboard(lines("D 0", "A 2", "F# 2", "Eb 0"));
    expect(codes(parse)).toEqual([]);
    expect(parse.labels).toEqual(["D", "A", "F#", "Eb"]);
  });

  it("only a first token that doesn't start with a digit is a label", () => {
    // `3` alone is a fret, and `e 2 3` is a label then two frets.
    expect(parseFretboard(withTop("3")).labels).toBeNull();
    const labeled = parseFretboard(lines("e 2 3", "B 3", "G 3", "D 3", "A 3", "E 3"));
    expect(labeled.labels?.[0]).toBe("e");
    expect(labeled.strings[0]?.frets).toEqual([2, 3]);
  });

  it("fret maxFret is legal", () => {
    const parse = parseFretboard(withTop("30"));
    expect(codes(parse)).toEqual([]);
    expect(parse.strings[0]?.frets).toEqual([30]);
  });
});

describe("fretboard diagnostics", () => {
  it("bad-token for anything that is not 0 or a positive integer", () => {
    for (const token of ["00", "3.5", "+3", "3x", "-1", "07"]) {
      const parse = parseFretboard(withTop(`2 ${token}`));
      expect(anchor(parse), token).toEqual({
        code: "bad-token",
        severity: "error",
        line: 0,
        column: 2,
        length: token.length,
      });
      // The good token on the line still counts.
      expect(parse.strings[0]?.frets).toEqual([2]);
    }
  });

  it("bad-token for a non-fret token after the label", () => {
    const parse = parseFretboard(lines("e 3 x", "B 3", "G 3", "D 3", "A 3", "E 3"));
    expect(anchor(parse)).toMatchObject({ code: "bad-token", line: 0, column: 4, length: 1 });
  });

  it("bad-token for a label-shaped token that isn't first", () => {
    const parse = parseFretboard(withTop("3 e"));
    expect(codes(parse)).toEqual(["bad-token"]);
  });

  it("fret-out-of-range above maxFret", () => {
    const parse = parseFretboard(lines("3", "3", "3 31", "3", "3", "3"));
    expect(anchor(parse)).toEqual({
      code: "fret-out-of-range",
      severity: "error",
      line: 2,
      column: 2,
      length: 2,
    });
  });

  it("open-with-fret, anchored at the 0", () => {
    const parse = parseFretboard(withTop("2 0 3"));
    expect(anchor(parse)).toEqual({
      code: "open-with-fret",
      severity: "error",
      line: 0,
      column: 2,
      length: 1,
    });
  });

  it("duplicate-marker warns at the repeat and collapses it", () => {
    const parse = parseFretboard(withTop("3 5 3"));
    expect(anchor(parse)).toEqual({
      code: "duplicate-marker",
      severity: "warning",
      line: 0,
      column: 4,
      length: 1,
    });
    expect(parse.strings[0]?.frets).toEqual([3, 5]);
  });

  it("duplicate-marker for a repeated 0", () => {
    const parse = parseFretboard(withTop("0 0"));
    expect(codes(parse)).toEqual(["duplicate-marker"]);
    expect(parse.strings[0]).toEqual({ open: true, frets: [] });
  });

  it("no-frets when no line carries any marker", () => {
    const parse = parseFretboard(lines("e", "B", "G", "D", "A", "E"));
    expect(anchor(parse)).toMatchObject({ code: "no-frets", severity: "error", line: 0 });
  });

  it("no-frets stays quiet when a line tried and failed", () => {
    const parse = parseFretboard(lines("3x", "3x", "3x", "3x", "3x", "3x"));
    expect(new Set(codes(parse))).toEqual(new Set(["bad-token"]));
  });

  it("leading-blank-line warns, and the blank is a string", () => {
    // A six-string shape with a stray newline in front is a valid seven-string
    // source; the string count can't catch it, so the warning says what was
    // assumed.
    const parse = parseFretboard(`\n${TCF2}`);
    expect(codes(parse)).toEqual(["leading-blank-line"]);
    expect(anchor(parse)).toMatchObject({ severity: "warning", line: 0 });
    expect(parse.stringCount).toBe(7);
    expect(parse.strings[0]).toEqual({ open: false, frets: [] });
  });

  it("partial-labels at the first line that breaks the pattern", () => {
    const parse = parseFretboard(lines("e 3", "B 3", "0", "D 0", "A 2", "E 3"));
    expect(anchor(parse)).toEqual({
      code: "partial-labels",
      severity: "error",
      line: 2,
      column: 0,
      length: undefined,
    });
    expect(parse.labels).toBeNull();
  });

  it("a blank line in a labeled source is partial-labels", () => {
    const parse = parseFretboard(lines("e 3", "", "G 0", "D 0", "A 2", "E 3"));
    expect(codes(parse)).toEqual(["partial-labels"]);
    expect(parse.diagnostics[0]?.line).toBe(1);
  });

  it("unsupported-string-count", () => {
    for (const count of [1, 3, 5, 8]) {
      const parse = parseFretboard(Array.from({ length: count }, () => "3").join("\n"));
      expect(anchor(parse)).toMatchObject({ code: "unsupported-string-count", line: 0 });
      expect(parse.stringCount).toBeNull();
      expect(parse.strings).toEqual([]);
    }
  });

  it("the shared source gates", () => {
    expect(codes(parseFretboard("  \n "))).toEqual(["empty-source"]);
    expect(anchor(parseFretboard(withTop("3\t5")))).toMatchObject({
      code: "tab-character",
      line: 0,
      column: 1,
      length: 1,
    });
    expect(codes(parseFretboard("3 ".repeat(25_001)))).toEqual(["source-too-large"]);
  });

  it("diagnostics come back in source order", () => {
    const parse = parseFretboard(lines("3 3", "x", "3", "3", "3", "3 31"));
    expect(parse.diagnostics.map((d) => d.line)).toEqual([0, 1, 5]);
  });
});
