// Traditional tablature: source text -> row groups, slots, cells, labels.
//
// Implements docs/spec.md "Parsing" steps 1-5 and the string-label rules. It is
// pure and geometry-free: the same parse result rendered with different
// settings differs only in spacing.

import {
  bySourcePosition,
  sourceGates,
  type DiagnosticCode,
  type ParseError,
} from "../diagnostics";

/** A note cell: what is played on one string at one slot. */
export interface Cell {
  /** 0 is the highest-pitched string. */
  stringIndex: number;
  /** Verbatim, technique notation and `x` included. */
  characters: string;
}

/**
 * One position along the row's horizontal axis.
 *
 * Either the cells sharing a start column, or a measure break -- which holds no
 * cells and no width, and exists to take up a position so the spacing rules
 * give it a gap on each side.
 */
export type Slot =
  /** Ordered by stringIndex. At most one cell per string, by construction. */
  { kind: "notes"; cells: Cell[] } | { kind: "break" };

export interface RowGroup {
  /**
   * One label per string, or null when the source named none and the default
   * tuning applies. Never partially filled -- that is `partial-labels`.
   */
  labels: string[] | null;
  slots: Slot[];
}

export type StringCount = 4 | 6 | 7;

export interface TablatureParse {
  /** null when the source never established a supported count. */
  stringCount: StringCount | null;
  rows: RowGroup[];
  diagnostics: ParseError[];
}

const MAX_ROW_GROUPS = 64;
const MAX_SLOTS_PER_ROW = 400;
const SUPPORTED_STRING_COUNTS: readonly number[] = [4, 6, 7];

/** A cell before slot assignment, carrying the positions diagnostics need. */
interface RawCell {
  stringIndex: number;
  characters: string;
  /** Start column within the playable region -- what decides the slot. */
  start: number;
  /** Absolute position, for anchoring a diagnostic. */
  line: number;
  column: number;
}

interface SourceLine {
  text: string;
  line: number;
}

function isWhitespace(c: string): boolean {
  return c !== "" && c.trim() === "";
}

/** A cell character: anything that is not a hyphen, whitespace or pipe. */
function isCellChar(c: string): boolean {
  return c !== "" && c !== "-" && c !== "|" && !isWhitespace(c);
}

/**
 * Step 2: `label? whitespace* playable`, where the playable region opens with an
 * optional measure break and then must have a hyphen.
 *
 * The opening break is inside the playable region rather than part of the
 * prefix, so a line that writes one has its columns offset by one from a line
 * that doesn't -- which is exactly why a break must appear on every string or
 * none, and why an inconsistent one surfaces as a misalignment.
 *
 * Returns null when the line doesn't fit the form.
 */
function splitPrefix(text: string): { label: string; playableStart: number } | null {
  let i = 0;
  while (isCellChar(text.charAt(i))) i++;
  const label = text.slice(0, i);

  let j = i;
  while (isWhitespace(text.charAt(j))) j++;

  const start = j;
  // Whitespace may precede an opening break but not follow it: `e| ---` is not
  // a line we can place columns on.
  if (text.charAt(j) === "|") j++;

  // A label has to be terminated -- by whitespace or by the opening break -- or
  // its boundary isn't decidable: `3-5-7` and `e-1-` both fail here.
  if (label.length > 0 && j === i) return null;
  if (text.charAt(j) !== "-") return null;

  return { label, playableStart: start };
}

/** A measure break before it has been checked against the other strings. */
interface RawBreak {
  /** Column within the playable region. */
  start: number;
  line: number;
  column: number;
  /** True at the region's first or last column, where the row brackets it anyway. */
  atEdge: boolean;
}

/**
 * Step 3: maximal runs of cell characters, plus the pipes between them.
 *
 * A pipe must be flanked by hyphens unless it sits at the region's first or
 * last column, where an opening or closing break has nothing beside it. That
 * rule is what rejects a pipe abutting a cell, so no overlap check is needed
 * for breaks.
 */
function tokenize(
  line: SourceLine,
  stringIndex: number,
  playableStart: number,
  push: Push,
): { cells: RawCell[]; breaks: RawBreak[] } {
  const playable = line.text.slice(playableStart);
  const cells: RawCell[] = [];
  const breaks: RawBreak[] = [];

  let i = 0;
  while (i < playable.length) {
    const char = playable.charAt(i);

    if (char === "|") {
      const first = i === 0;
      const last = i === playable.length - 1;
      const flanked =
        (first || playable.charAt(i - 1) === "-") && (last || playable.charAt(i + 1) === "-");

      if (flanked) {
        breaks.push({
          start: i,
          line: line.line,
          column: playableStart + i,
          atEdge: first || last,
        });
      } else {
        push(
          "measure-break-without-hyphens",
          'A measure line needs a hyphen on each side, as in "-|-".',
          line.line,
          playableStart + i,
          1,
        );
      }
      i++;
      continue;
    }

    if (!isCellChar(char)) {
      i++;
      continue;
    }

    const start = i;
    while (isCellChar(playable.charAt(i))) i++;
    cells.push({
      stringIndex,
      characters: playable.slice(start, i),
      start,
      line: line.line,
      column: playableStart + start,
    });
  }

  return { cells, breaks };
}

function hasValue(characters: string): boolean {
  return /[0-9xX]/.test(characters);
}

/** Step 2's label part, present or absent. A row group needs all or none. */
function isLabeled(label: string): boolean {
  return label.length > 0;
}

/** Step 1: split on blank-line runs, discarding leading and trailing blanks. */
function splitRowGroups(lines: string[]): SourceLine[][] {
  const groups: SourceLine[][] = [];
  let current: SourceLine[] = [];

  lines.forEach((text, line) => {
    if (text.trim() === "") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      return;
    }
    current.push({ text, line });
  });
  if (current.length > 0) groups.push(current);

  return groups;
}

export function parseTablature(source: string): TablatureParse {
  const diagnostics: ParseError[] = [];
  const push = (
    code: DiagnosticCode,
    message: string,
    line: number,
    column?: number,
    length?: number,
  ): void => {
    const error: ParseError = { severity: "error", code, message, line };
    if (column !== undefined) error.column = column;
    if (length !== undefined) error.length = length;
    diagnostics.push(error);
  };

  const done = (stringCount: StringCount | null, rows: RowGroup[]): TablatureParse => ({
    stringCount,
    rows,
    diagnostics: diagnostics.sort(bySourcePosition),
  });

  // --- Stage A: source gates. None of these leaves anything honest to parse.
  diagnostics.push(...sourceGates(source));
  const lines = source.split("\n");

  if (diagnostics.length > 0) return done(null, []);

  // --- Stage B: row groups, and the string count they must agree on.
  const groups = splitRowGroups(lines);

  if (groups.length > MAX_ROW_GROUPS) {
    const overflow = groups[MAX_ROW_GROUPS]?.[0];
    push(
      "too-many-rows",
      `A tab can have at most ${String(MAX_ROW_GROUPS)} blocks separated by blank lines.`,
      overflow?.line ?? 0,
    );
    return done(null, []);
  }

  const first = groups[0];
  if (!first) return done(null, []);

  const count = first.length;
  if (!SUPPORTED_STRING_COUNTS.includes(count)) {
    // Without a supported count there is no default tuning, so nothing
    // downstream can hold -- every string is promised a label.
    push(
      "unsupported-string-count",
      `A tab must have 4, 6 or 7 strings. This one has ${String(count)}.`,
      first[0]?.line ?? 0,
    );
    return done(null, []);
  }
  const stringCount = count as StringCount;

  const rows: RowGroup[] = [];
  for (const group of groups) {
    if (group.length !== stringCount) {
      // Skipped rather than parsed: the rows could not be aligned. Conforming
      // groups still parse, so the UI shows a usable picture of the rest.
      push(
        "inconsistent-string-count",
        `This block has ${String(group.length)} strings but the first has ${String(stringCount)}. Every block must have the same number.`,
        group[0]?.line ?? 0,
      );
      continue;
    }
    rows.push(parseRowGroup(group, push));
  }

  return done(stringCount, rows);
}

type Push = (
  code: DiagnosticCode,
  message: string,
  line: number,
  column?: number,
  length?: number,
) => void;

function parseRowGroup(group: SourceLine[], push: Push): RowGroup {
  const groupLine = group[0]?.line ?? 0;

  // --- Stages C and D: prefix, labels.
  const labels: string[] = [];
  const cells: RawCell[] = [];
  const breaks: RawBreak[] = [];
  let malformed = false;

  group.forEach((line, stringIndex) => {
    const prefix = splitPrefix(line.text);
    if (!prefix) {
      push(
        "missing-leading-hyphen",
        'Every line must begin with a hyphen, or with a string name followed by a space or "|".' +
          " A measure line at the start must sit directly against the first hyphen.",
        line.line,
        0,
      );
      malformed = true;
      labels.push("");
      return;
    }

    labels.push(prefix.label);
    const tokens = tokenize(line, stringIndex, prefix.playableStart, push);
    breaks.push(...tokens.breaks);
    for (const cell of tokens.cells) {
      if (!hasValue(cell.characters)) {
        // Step 3: a cell needs a digit or an `x`. Kept in the structure anyway
        // -- the error blocks the render, and dropping it would make slot
        // structure depend on validity.
        push(
          "cell-without-value",
          `"${cell.characters}" is not a fret number or a muted note.`,
          cell.line,
          cell.column,
          cell.characters.length,
        );
      }
      cells.push(cell);
    }
  });

  const labeled = labels.filter(isLabeled).length;
  let resolvedLabels: string[] | null = null;
  if (malformed) {
    // A line that didn't parse supplies no label, which would read as partial
    // labeling. Don't pile a second diagnostic onto the first.
    resolvedLabels = null;
  } else if (labeled === labels.length) {
    resolvedLabels = labels;
  } else if (labeled > 0) {
    const firstIsLabeled = isLabeled(labels[0] ?? "");
    const odd = labels.findIndex((label) => isLabeled(label) !== firstIsLabeled);
    push(
      "partial-labels",
      "Either every line names its string, or none do.",
      group[odd]?.line ?? groupLine,
      0,
    );
  }

  // --- Stages F and G: slots by column, then the caps.
  const breakColumns = resolveBreaks(breaks, group.length, push);
  const slots = assignSlots(cells, breakColumns, push);

  // Suppressed when a line is malformed, for the same reason as partial-labels:
  // the group is empty *because* of that line, and reporting both would pile a
  // consequence on top of its cause.
  //
  // Breaks count: a row of nothing but measure lines still has positions to
  // draw, so it is only empty when it has neither.
  if (slots.length === 0 && !malformed) {
    push("empty-row-group", "This block has nothing in it to draw.", groupLine);
  }
  if (slots.length > MAX_SLOTS_PER_ROW) {
    push(
      "too-many-slots",
      `This block has ${String(slots.length)} positions; keep it under ${String(MAX_SLOTS_PER_ROW)} by splitting it across blank lines.`,
      groupLine,
    );
  }

  return { labels: resolvedLabels, slots };
}

/**
 * A measure break spans the row, so a pipe column must carry a pipe on every
 * string. Returns the surviving interior columns, in order.
 *
 * Edge breaks are absorbed: every row is bracketed by an opening and a closing
 * break whether or not the source wrote one, so an explicit edge pipe is
 * validated and then dropped. That is what keeps a source with edge pipes
 * parsing identically to one without -- TC-6 against TC-4.
 */
function resolveBreaks(breaks: RawBreak[], strings: number, push: Push): number[] {
  const byColumn = new Map<number, RawBreak[]>();
  for (const candidate of breaks) {
    const existing = byColumn.get(candidate.start);
    if (existing) existing.push(candidate);
    else byColumn.set(candidate.start, [candidate]);
  }

  const columns: number[] = [];
  for (const [column, found] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    if (found.length !== strings) {
      for (const candidate of found) {
        push(
          "misaligned-measure-break",
          "A measure line has to cross every string. Add the missing ones, or remove this one.",
          candidate.line,
          candidate.column,
          1,
        );
      }
      continue;
    }
    // Unanimous. Keep it unless the row draws it anyway.
    if (!found.every((candidate) => candidate.atEdge)) columns.push(column);
  }

  return columns;
}

/**
 * Step 4: cells sharing a start column are one slot, each surviving break is a
 * slot of its own, and a cell may not straddle two slots.
 *
 * One sort and one sweep. `maxEnd` is the greatest span end among all cells
 * whose start column is strictly smaller than the current one, so a start below
 * it is a cell beginning inside another slot's span. Cells sharing a start are
 * never compared with each other -- they are already the same slot, which is
 * what lets TC-7's first slot hold `10` alongside `5`.
 */
function assignSlots(cells: RawCell[], breakColumns: number[], push: Push): Slot[] {
  const byStart = new Map<number, RawCell[]>();
  for (const cell of cells) {
    const existing = byStart.get(cell.start);
    if (existing) existing.push(cell);
    else byStart.set(cell.start, [cell]);
  }

  const breaks = new Set(breakColumns);
  const starts = [...new Set([...byStart.keys(), ...breakColumns])].sort((a, b) => a - b);
  const slots: Slot[] = [];
  let maxEnd = -1;

  for (const start of starts) {
    if (breaks.has(start)) {
      slots.push({ kind: "break" });
      continue;
    }

    const group = byStart.get(start) ?? [];
    group.sort((a, b) => a.stringIndex - b.stringIndex);

    if (start < maxEnd) {
      for (const cell of group) {
        push(
          "overlapping-cells",
          `"${cell.characters}" starts part-way through a note on another string. Pad the lines with hyphens so notes that sound together line up.`,
          cell.line,
          cell.column,
          cell.characters.length,
        );
      }
    }

    for (const cell of group) {
      maxEnd = Math.max(maxEnd, cell.start + cell.characters.length);
    }

    slots.push({
      kind: "notes",
      cells: group.map(({ stringIndex, characters }) => ({ stringIndex, characters })),
    });
  }

  return slots;
}
