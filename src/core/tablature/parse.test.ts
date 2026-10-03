import { describe, expect, it } from "vitest";

import { parseTablature, type RowGroup, type Slot, type TablatureParse } from "./parse";
import { TC1, TC2, TC3, TC4, TC5, TC6, TC7, TC9 } from "./fixtures";

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

const row = (parse: TablatureParse, index: number): RowGroup => at(parse.rows, index);
const characters = (slot: Slot): string[] => slot.cells.map((cell) => cell.characters);
const strings = (slot: Slot): number[] => slot.cells.map((cell) => cell.stringIndex);
const codes = (parse: TablatureParse): string[] => parse.diagnostics.map((d) => d.code);

const sixLines = (...lines: string[]): string => lines.join("\n");

describe("tablature structure", () => {
  it("TC-1 multiple rows", () => {
    const parse = parseTablature(TC1);
    expect(parse.stringCount).toBe(6);
    expect(parse.rows).toHaveLength(2);

    for (const index of [0, 1]) {
      const group = row(parse, index);
      expect(group.slots).toHaveLength(5);
      expect(group.labels).toBeNull();
      // One cell per string in every slot, and the fret rises across slots.
      group.slots.forEach((slot, n) => {
        expect(strings(slot)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(new Set(characters(slot))).toEqual(new Set([String(n + 1)]));
      });
    }
  });

  it("TC-2 hyphenspace collapses", () => {
    const parse = parseTablature(TC2);
    expect(parse.rows).toHaveLength(2);
    // Deep equality between the two parses, not against a transcription.
    expect(row(parse, 0)).toEqual(row(parse, 1));

    const slots = row(parse, 0).slots;
    expect(slots).toHaveLength(3);
    expect(characters(at(slots, 0))).toEqual(["2", "2", "0", "0", "2", "3"]);
    expect(characters(at(slots, 1))).toEqual(["0", "1", "0", "2", "3", "3"]);
    expect(characters(at(slots, 2))).toEqual(["0", "0", "0", "2", "2", "0"]);
  });

  it("TC-3 long note cells", () => {
    const slots = row(parseTablature(TC3), 0).slots;
    expect(slots).toHaveLength(2);
    // `2h3p2` spans columns 1-5, so the zeroes at column 7 are a later slot.
    expect(characters(at(slots, 0))).toEqual(["3", "2h3p2"]);
    expect(strings(at(slots, 0))).toEqual([0, 1]);
    expect(characters(at(slots, 1))).toEqual(["0", "0"]);
  });

  it("TC-4 source-supplied labels", () => {
    const group = row(parseTablature(TC4), 0);
    expect(group.labels).toEqual(["e", "B", "G", "D", "A", "E"]);
    expect(group.slots).toHaveLength(1);
    expect(characters(at(group.slots, 0))).toEqual(["1", "2", "2"]);
    expect(strings(at(group.slots, 0))).toEqual([2, 3, 4]);
  });

  it("TC-5 sparse strings", () => {
    const slots = row(parseTablature(TC5), 0).slots;
    expect(slots).toHaveLength(3);
    // The `2` is its own slot: ordinal alignment would make it simultaneous
    // with the first chord.
    expect(strings(at(slots, 0))).toEqual([0, 5]);
    expect(characters(at(slots, 1))).toEqual(["2"]);
    expect(strings(at(slots, 1))).toEqual([3]);
    expect(strings(at(slots, 2))).toEqual([0, 5]);
  });

  it("TC-6 superfluous prefix characters parses identically to TC-4", () => {
    expect(parseTablature(TC6)).toEqual(parseTablature(TC4));
  });

  it("TC-7 mixed cell widths", () => {
    const slots = row(parseTablature(TC7), 0).slots;
    expect(slots).toHaveLength(3);
    // The spec states these contents exactly: {10, 5, 3}, {12b14}, {7, 0}.
    expect(characters(at(slots, 0))).toEqual(["10", "5", "3"]);
    expect(strings(at(slots, 0))).toEqual([0, 1, 5]);
    expect(characters(at(slots, 1))).toEqual(["12b14"]);
    expect(characters(at(slots, 2))).toEqual(["7", "0"]);
  });

  it("TC-9 muted notes", () => {
    const slots = row(parseTablature(TC9), 0).slots;
    expect(slots).toHaveLength(2);
    expect(slots.flatMap(characters)).toHaveLength(12);
    // An `x` is as valid a cell as a digit, and needs no special case.
    expect(characters(at(slots, 0))).toEqual(["x", "x", "x", "x", "x", "x"]);
    expect(characters(at(slots, 1))).toEqual(["3", "3", "0", "0", "2", "3"]);
  });

  it("every spec test case is diagnostic-free", () => {
    for (const [name, source] of Object.entries({ TC1, TC2, TC3, TC4, TC5, TC6, TC7, TC9 })) {
      expect(codes(parseTablature(source)), name).toEqual([]);
    }
  });

  it("no slot holds two cells on one string", () => {
    for (const source of [TC1, TC2, TC3, TC4, TC5, TC6, TC7, TC9]) {
      for (const group of parseTablature(source).rows) {
        for (const slot of group.slots) {
          const indices = strings(slot);
          expect(new Set(indices).size).toBe(indices.length);
        }
      }
    }
  });
});

describe("tablature diagnostics", () => {
  it("empty-source", () => {
    expect(codes(parseTablature(""))).toEqual(["empty-source"]);
    expect(codes(parseTablature("  \n\n   "))).toEqual(["empty-source"]);
  });

  it("tab-character is anchored at the tab", () => {
    const parse = parseTablature(sixLines("------", "--\t---", "------", "------", "------", "------"));
    expect(codes(parse)).toEqual(["tab-character"]);
    expect(at(parse.diagnostics, 0)).toMatchObject({ line: 1, column: 2, length: 1 });
  });

  it("source-too-large", () => {
    const long = `-${"1-".repeat(26_000)}`;
    expect(codes(parseTablature(sixLines(long, long, long, long, long, long)))).toContain(
      "source-too-large",
    );
  });

  it("unsupported-string-count", () => {
    const parse = parseTablature(sixLines("-1-", "-1-", "-1-", "-1-", "-1-"));
    expect(codes(parse)).toEqual(["unsupported-string-count"]);
    expect(at(parse.diagnostics, 0).line).toBe(0);
  });

  it("inconsistent-string-count is anchored at the deviating block", () => {
    const six = sixLines("-1-", "-1-", "-1-", "-1-", "-1-", "-1-");
    const parse = parseTablature(`${six}\n\n-1-\n-1-\n-1-\n-1-`);
    expect(codes(parse)).toEqual(["inconsistent-string-count"]);
    expect(at(parse.diagnostics, 0).line).toBe(7);
    // The conforming block still parses, so the UI has something to show.
    expect(parse.rows).toHaveLength(1);
  });

  it("missing-leading-hyphen", () => {
    // `3-5-7` fails because `3` is not followed by a separator, so the line
    // neither starts with a hyphen nor carries a terminated label.
    const parse = parseTablature(sixLines("3-5-7", "-1---", "-----", "-----", "-----", "-----"));
    expect(codes(parse)).toEqual(["missing-leading-hyphen"]);
    expect(at(parse.diagnostics, 0)).toMatchObject({ line: 0, column: 0 });
  });

  it("missing-leading-hyphen suppresses empty-row-group", () => {
    // The block has no notes *because* of the malformed line. Reporting both
    // would pile a consequence on top of its cause.
    const parse = parseTablature(sixLines("3-5-7", "-----", "-----", "-----", "-----", "-----"));
    expect(codes(parse)).toEqual(["missing-leading-hyphen"]);
  });

  it("accepts every prefix form the spec lists", () => {
    // All of `-----`, `|-----`, `e -----`, `e|-----` and `E |-2-` fit the step
    // 2 grammar. They are split across two blocks because mixing labeled and
    // unlabeled lines in one block is partial-labels, which is its own case.
    const bare = sixLines("-----", "|-----", "  -1-", "-----", "|-1-", "-----");
    const labeled = sixLines("e -----", "e|-----", "E |-2-", "D -1-", "A|-1-", "E -----");
    expect(codes(parseTablature(bare))).toEqual([]);
    expect(codes(parseTablature(labeled))).toEqual([]);
    expect(row(parseTablature(bare), 0).labels).toBeNull();
    expect(row(parseTablature(labeled), 0).labels).toEqual(["e", "e", "E", "D", "A", "E"]);
  });

  it("cell-without-value is anchored at the cell", () => {
    const parse = parseTablature(sixLines("-1-h-", "-----", "-----", "-----", "-----", "-----"));
    expect(codes(parse)).toEqual(["cell-without-value"]);
    expect(at(parse.diagnostics, 0)).toMatchObject({ line: 0, column: 3, length: 1 });
  });

  it("overlapping-cells rejects a cell straddling two slots", () => {
    // The spec's step 4 counter-example: `2345` begins inside `10`'s span and
    // ends inside `11`'s, so it is simultaneous with both and with neither.
    const parse = parseTablature(
      sixLines("-10-11-", "--2345-", "-------", "-------", "-------", "-------"),
    );
    expect(codes(parse)).toEqual(["overlapping-cells", "overlapping-cells"]);
    expect(at(parse.diagnostics, 0)).toMatchObject({ line: 0, column: 4, length: 2 });
    expect(at(parse.diagnostics, 1)).toMatchObject({ line: 1, column: 2, length: 4 });
  });

  it("overlapping-cells allows cells that share a start column", () => {
    // TC-7's first slot: `10` [1,3) and `5` [1,2) overlap and are legal.
    expect(codes(parseTablature(TC7))).toEqual([]);
  });

  it("partial-labels is anchored at the first line that breaks the pattern", () => {
    const parse = parseTablature(sixLines("e -1-", "B -1-", "-1-", "D -1-", "A -1-", "E -1-"));
    expect(codes(parse)).toEqual(["partial-labels"]);
    expect(at(parse.diagnostics, 0).line).toBe(2);
    expect(row(parse, 0).labels).toBeNull();
  });

  it("partial-labels does not fire across blocks", () => {
    const labeled = sixLines("e -1-", "B -1-", "G -1-", "D -1-", "A -1-", "E -1-");
    const bare = sixLines("-1-", "-1-", "-1-", "-1-", "-1-", "-1-");
    const parse = parseTablature(`${labeled}\n\n${bare}`);
    expect(codes(parse)).toEqual([]);
    expect(row(parse, 0).labels).toEqual(["e", "B", "G", "D", "A", "E"]);
    expect(row(parse, 1).labels).toBeNull();
  });

  it("empty-row-group", () => {
    const parse = parseTablature(sixLines("-----", "-----", "-----", "-----", "-----", "-----"));
    expect(codes(parse)).toEqual(["empty-row-group"]);
    expect(at(parse.diagnostics, 0).line).toBe(0);
  });

  it("too-many-slots", () => {
    const wide = `-${"1-".repeat(401)}`;
    const parse = parseTablature(sixLines(wide, wide, wide, wide, wide, wide));
    expect(row(parse, 0).slots).toHaveLength(401);
    expect(codes(parse)).toEqual(["too-many-slots"]);
  });

  it("too-many-rows is anchored at the first block past the cap", () => {
    const group = sixLines("-1-", "-1-", "-1-", "-1-", "-1-", "-1-");
    const parse = parseTablature(Array.from({ length: 65 }, () => group).join("\n\n"));
    expect(codes(parse)).toEqual(["too-many-rows"]);
    // 64 blocks of six lines, each followed by a blank separator.
    expect(at(parse.diagnostics, 0).line).toBe(64 * 7);
  });
});
