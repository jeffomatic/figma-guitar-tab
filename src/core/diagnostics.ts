// The diagnostic type both modes produce and both halves of the plugin consume.
//
// It lives here rather than in the protocol module because diagnostics are a
// product of parsing; the protocol merely transports them.

export type Severity = "error" | "warning";

/** Codes raised by either mode. */
export type SharedCode =
  | "empty-source"
  | "tab-character"
  | "source-too-large"
  | "partial-labels"
  | "unsupported-string-count"
  | "setting-out-of-range";

/** Codes raised only while parsing traditional tablature. */
export type TablatureCode =
  | "missing-leading-hyphen"
  | "inconsistent-string-count"
  | "cell-without-value"
  | "overlapping-cells"
  | "measure-break-without-hyphens"
  | "misaligned-measure-break"
  | "too-many-slots"
  | "too-many-rows"
  | "empty-row-group";

/** Codes raised only while parsing a fretboard diagram. */
export type FretboardCode =
  | "bad-token"
  | "open-with-fret"
  | "muted-with-marker"
  | "duplicate-marker"
  | "no-frets"
  | "leading-blank-line"
  | "fret-out-of-range";

export type DiagnosticCode = SharedCode | TablatureCode | FretboardCode;

export interface ParseError {
  severity: Severity;
  /** Stable kebab-case identifier, for tests and i18n. Never shown to a user. */
  code: DiagnosticCode;
  /**
   * One sentence, user-facing, naming the offending text where useful.
   * Carries no spec vocabulary: a user never reads "slot" or "playable region".
   */
  message: string;
  /**
   * 0-based, within the whole source. Absent when the diagnostic is not about
   * the source at all -- a settings value is out of range no matter what the
   * tab says, and anchoring it at line 0 would point the UI at the first line
   * of a tab that has nothing wrong with it.
   */
  line?: number;
  /** 0-based within that raw line, prefix included, when a precise run exists. */
  column?: number;
  length?: number;
}

/** Past this, the serialized plugin data would crowd Figma's per-key limit. */
const MAX_SOURCE_CHARS = 50_000;

/**
 * The gates every source passes before either mode parses it: empty, too
 * large, or holding a horizontal tab. None of them leaves anything honest to
 * parse, so a parser that gets any back returns without reading further.
 *
 * "Tab" in the messages is the source field's own name, ASCII tab, so the
 * wording holds for both modes.
 */
export function sourceGates(source: string): ParseError[] {
  const errors: ParseError[] = [];
  const error = (code: DiagnosticCode, message: string, line: number): ParseError => ({
    severity: "error",
    code,
    message,
    line,
  });

  if (source.trim() === "") {
    errors.push(error("empty-source", "Enter some tab to render.", 0));
  }
  if (source.length > MAX_SOURCE_CHARS) {
    errors.push(
      error(
        "source-too-large",
        `This tab is ${String(source.length)} characters; keep it under ${String(MAX_SOURCE_CHARS)}.`,
        0,
      ),
    );
  }

  const lines = source.split("\n");
  const tabLine = lines.findIndex((text) => text.includes("\t"));
  if (tabLine >= 0) {
    errors.push({
      ...error(
        "tab-character",
        "Tab characters make it impossible to tell which notes line up. Use spaces instead.",
        tabLine,
      ),
      column: lines[tabLine]?.indexOf("\t") ?? 0,
      length: 1,
    });
  }

  return errors;
}

export interface SourceRange {
  start: number;
  end: number;
}

/**
 * Where a diagnostic points, as character offsets into the source.
 *
 * The UI uses this to select the offending text when a diagnostic is clicked.
 * It is a pure function of the source and the anchor, so it lives here with
 * tests rather than inside a React handler.
 *
 * - No `line` -- returns null. A settings diagnostic is wrong no matter what
 *   the source says, so there is nothing to point at, and scrolling the field
 *   to line 0 would be a lie.
 * - A `line` but no `column` -- the whole line.
 * - A `column` but no `length` -- from there to the end of the line. This is
 *   what makes a line-anchored error like `missing-leading-hyphen`, which
 *   reports column 0, select the line rather than one character of it.
 * - Both -- exactly that run.
 */
export function rangeOf(source: string, error: ParseError): SourceRange | null {
  if (error.line === undefined) return null;

  const lines = source.split("\n");
  if (error.line < 0 || error.line >= lines.length) return null;

  let lineStart = 0;
  for (let index = 0; index < error.line; index++) {
    lineStart += (lines[index]?.length ?? 0) + 1; // + the newline
  }

  const text = lines[error.line] ?? "";
  if (error.column === undefined) return { start: lineStart, end: lineStart + text.length };

  const column = Math.min(Math.max(error.column, 0), text.length);
  const end =
    error.length === undefined ? text.length : Math.min(column + error.length, text.length);
  return { start: lineStart + column, end: lineStart + end };
}

/**
 * Source order, so the UI can anchor diagnostics without re-sorting.
 * Unanchored diagnostics sort first: they are about the whole render, not a
 * place in it.
 */
export function bySourcePosition(a: ParseError, b: ParseError): number {
  return (a.line ?? -1) - (b.line ?? -1) || (a.column ?? -1) - (b.column ?? -1);
}
