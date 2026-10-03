// Traditional tablature: source text -> row groups, slots, cells, labels.
//
// Implements docs/spec.md "Parsing" steps 1-5 and the string-label rules. It is
// pure and geometry-free: the same parse result rendered with different
// settings differs only in spacing.

import { bySourcePosition, type DiagnosticCode, type ParseError } from "../diagnostics";

/** A note cell: what is played on one string at one slot. */
export interface Cell {
  /** 0 is the highest-pitched string. */
  stringIndex: number;
  /** Verbatim, technique notation and `x` included. */
  characters: string;
}

/** One moment in time: the cells sharing a start column, by string. */
export interface Slot {
  /** Ordered by stringIndex. At most one cell per string, by construction. */
  cells: Cell[];
}

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

const MAX_SOURCE_CHARS = 50_000;
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

function isSeparator(c: string): boolean {
  return c === "|" || (c !== "" && c.trim() === "");
}

/** A cell character: anything that is not a hyphen, whitespace or pipe. */
function isCellChar(c: string): boolean {
  return c !== "" && c !== "-" && !isSeparator(c);
}

/**
 * Step 2: `label? separators? playable`, where playable must begin with `-`.
 * Returns null when the line doesn't fit the form.
 */
function splitPrefix(text: string): { label: string; playableStart: number } | null {
  let i = 0;
  while (isCellChar(text.charAt(i))) i++;
  const label = text.slice(0, i);

  let j = i;
  while (isSeparator(text.charAt(j))) j++;

  // A label has to be terminated, or its boundary isn't decidable: `3-5-7`.
  if (label.length > 0 && j === i) return null;
  if (text.charAt(j) !== "-") return null;

  return { label, playableStart: j };
}

/** Step 3: maximal runs of cell characters within the playable region. */
function tokenize(line: SourceLine, stringIndex: number, playableStart: number): RawCell[] {
  const playable = line.text.slice(playableStart);
  const cells: RawCell[] = [];

  let i = 0;
  while (i < playable.length) {
    if (!isCellChar(playable.charAt(i))) {
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

  return cells;
}

function hasValue(characters: string): boolean {
  return /[0-9xX]/.test(characters);
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
  if (source.trim() === "") {
    push("empty-source", "Enter some tab to render.", 0);
  }
  if (source.length > MAX_SOURCE_CHARS) {
    push(
      "source-too-large",
      `This tab is ${String(source.length)} characters; keep it under ${String(MAX_SOURCE_CHARS)}.`,
      0,
    );
  }

  const lines = source.split("\n");
  const tabLine = lines.findIndex((text) => text.includes("\t"));
  if (tabLine >= 0) {
    push(
      "tab-character",
      "Tab characters make it impossible to tell which notes line up. Use spaces instead.",
      tabLine,
      lines[tabLine]?.indexOf("\t") ?? 0,
      1,
    );
  }

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
  let malformed = false;

  group.forEach((line, stringIndex) => {
    const prefix = splitPrefix(line.text);
    if (!prefix) {
      push(
        "missing-leading-hyphen",
        'Every line must begin with a hyphen, or with a string name followed by a space or "|".',
        line.line,
        0,
      );
      malformed = true;
      labels.push("");
      return;
    }

    labels.push(prefix.label);
    for (const cell of tokenize(line, stringIndex, prefix.playableStart)) {
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

  const labeled = labels.filter((label) => label.length > 0).length;
  let resolvedLabels: string[] | null = null;
  if (malformed) {
    // A line that didn't parse supplies no label, which would read as partial
    // labeling. Don't pile a second diagnostic onto the first.
    resolvedLabels = null;
  } else if (labeled === labels.length) {
    resolvedLabels = labels;
  } else if (labeled > 0) {
    const firstIsLabeled = (labels[0] ?? "").length > 0;
    const odd = labels.findIndex((label) => (label.length > 0) !== firstIsLabeled);
    push(
      "partial-labels",
      "Either every line names its string, or none do.",
      group[odd]?.line ?? groupLine,
      0,
    );
  }

  // --- Stages F and G: slots by start column, then the caps.
  const slots = assignSlots(cells, push);

  // Suppressed when a line is malformed, for the same reason as partial-labels:
  // the group has no notes *because* of that line, and reporting both would
  // pile a consequence on top of its cause.
  if (cells.length === 0 && !malformed) {
    push("empty-row-group", "This block has no notes in it.", groupLine);
  }
  if (slots.length > MAX_SLOTS_PER_ROW) {
    push(
      "too-many-slots",
      `This block has ${String(slots.length)} note positions; keep it under ${String(MAX_SLOTS_PER_ROW)} by splitting it across blank lines.`,
      groupLine,
    );
  }

  return { labels: resolvedLabels, slots };
}

/**
 * Step 4: cells sharing a start column are one slot, and a cell may not
 * straddle two slots.
 *
 * One sort and one sweep. `maxEnd` is the greatest span end among all cells
 * whose start column is strictly smaller than the current one, so a start below
 * it is a cell beginning inside another slot's span. Cells sharing a start are
 * never compared with each other -- they are already the same slot, which is
 * what lets TC-7's first slot hold `10` alongside `5`.
 */
function assignSlots(cells: RawCell[], push: Push): Slot[] {
  const byStart = new Map<number, RawCell[]>();
  for (const cell of cells) {
    const existing = byStart.get(cell.start);
    if (existing) existing.push(cell);
    else byStart.set(cell.start, [cell]);
  }

  const starts = [...byStart.keys()].sort((a, b) => a - b);
  const slots: Slot[] = [];
  let maxEnd = -1;

  for (const start of starts) {
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
      cells: group.map(({ stringIndex, characters }) => ({ stringIndex, characters })),
    });
  }

  return slots;
}
