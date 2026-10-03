import { describe, expect, it } from "vitest";

import { bySourcePosition, rangeOf, type ParseError } from "./diagnostics";

const error = (fields: Partial<ParseError>): ParseError => ({
  severity: "error",
  code: "cell-without-value",
  message: "",
  ...fields,
});

const source = ["-1-h-", "-----", "-2---"].join("\n");

describe("rangeOf", () => {
  it("selects exactly the run when column and length are both given", () => {
    const range = rangeOf(source, error({ line: 0, column: 3, length: 1 }));
    expect(range).toEqual({ start: 3, end: 4 });
    expect(source.slice(range?.start, range?.end)).toBe("h");
  });

  it("selects to the end of the line when only a column is given", () => {
    // What makes missing-leading-hyphen, which reports column 0, select the
    // whole line rather than its first character.
    const range = rangeOf(source, error({ line: 0, column: 0 }));
    expect(source.slice(range?.start, range?.end)).toBe("-1-h-");
  });

  it("selects the whole line when no column is given", () => {
    const range = rangeOf(source, error({ line: 2 }));
    expect(source.slice(range?.start, range?.end)).toBe("-2---");
  });

  it("counts the newline between lines", () => {
    const range = rangeOf(source, error({ line: 2, column: 1, length: 1 }));
    expect(source.slice(range?.start, range?.end)).toBe("2");
  });

  it("returns null for a diagnostic with no source anchor", () => {
    // A settings warning. Pointing it at line 0 would send the user to an
    // innocent line of a tab that is fine.
    expect(
      rangeOf(source, error({ code: "setting-out-of-range", severity: "warning" })),
    ).toBeNull();
  });

  it("returns null for a line beyond the source", () => {
    expect(rangeOf(source, error({ line: 99 }))).toBeNull();
  });

  it("clamps a column or length that runs past the line", () => {
    const range = rangeOf(source, error({ line: 0, column: 4, length: 50 }));
    expect(range).toEqual({ start: 4, end: 5 });
    expect(rangeOf(source, error({ line: 0, column: 99 }))).toEqual({ start: 5, end: 5 });
  });
});

describe("bySourcePosition", () => {
  it("sorts unanchored diagnostics first, then by line and column", () => {
    const sorted = [
      error({ line: 1, column: 2 }),
      error({ line: 0, column: 5 }),
      error({ code: "setting-out-of-range", severity: "warning" }),
      error({ line: 0, column: 1 }),
    ].sort(bySourcePosition);

    expect(sorted.map((d) => [d.line, d.column])).toEqual([
      [undefined, undefined],
      [0, 1],
      [0, 5],
      [1, 2],
    ]);
  });
});
