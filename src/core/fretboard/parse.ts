// Fretboard diagram: source text -> per-string markers and labels.
//
// Implements docs/spec.md "ASCII input" and "Fretboard string labels". Pure and
// geometry-free: which frets the diagram draws is the window computation's
// job, in layout.

import {
  bySourcePosition,
  sourceGates,
  type DiagnosticCode,
  type ParseError,
  type Severity,
} from "../diagnostics";
import { maxFret, type StringCount } from "../settings";

/**
 * What one string carries. A string is open, fretted, muted, or none of them --
 * never more than one.
 */
export interface FretboardString {
  open: boolean;
  /** Marked `x` or `X`: don't play this string. */
  muted: boolean;
  /** Ascending, without duplicates. Every value is in `1..maxFret`. */
  frets: number[];
}

export interface FretboardParse {
  /** null when the source does not have a supported number of lines. */
  stringCount: StringCount | null;
  /**
   * One label per string, or null when the source named none and the default
   * tuning applies. Never partially filled -- that is `partial-labels`.
   */
  labels: string[] | null;
  /** Top to bottom: index 0 is the highest-pitched string. */
  strings: FretboardString[];
  diagnostics: ParseError[];
}

const SUPPORTED_STRING_COUNTS: readonly number[] = [4, 6, 7];

/** `0`, or a positive integer with no leading zero. Nothing else is a fret. */
const FRET_TOKEN = /^(0|[1-9][0-9]*)$/;

/** Don't play this string. Either case, since both are common in chord charts. */
const MUTED_TOKEN = /^[xX]$/;

interface Token {
  text: string;
  column: number;
}

function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(/\S+/g), (match) => ({ text: match[0], column: match.index }));
}

/** A blank line is a string with no marker, not a separator. */
function isBlank(text: string): boolean {
  return text.trim() === "";
}

export function parseFretboard(source: string): FretboardParse {
  const diagnostics: ParseError[] = [];
  const push = (
    severity: Severity,
    code: DiagnosticCode,
    message: string,
    line: number,
    column?: number,
    length?: number,
  ): void => {
    const error: ParseError = { severity, code, message, line };
    if (column !== undefined) error.column = column;
    if (length !== undefined) error.length = length;
    diagnostics.push(error);
  };

  const done = (
    stringCount: StringCount | null,
    labels: string[] | null,
    strings: FretboardString[],
  ): FretboardParse => ({
    stringCount,
    labels,
    strings,
    diagnostics: diagnostics.sort(bySourcePosition),
  });

  // --- Source gates. None of these leaves anything honest to parse.
  diagnostics.push(...sourceGates(source));
  if (diagnostics.length > 0) return done(null, null, []);

  // --- Lines are strings. Trailing blanks are trimmed; a leading blank is a
  // markerless first string, which a stray newline is indistinguishable from.
  const lines = source.split("\n");
  while (lines.length > 0 && isBlank(lines.at(-1) ?? "")) lines.pop();

  if (lines.length > 0 && isBlank(lines[0] ?? "")) {
    push(
      "warning",
      "leading-blank-line",
      "The first line is blank, so it is drawn as a string with nothing on it.",
      0,
    );
  }

  const count = lines.length;
  if (!SUPPORTED_STRING_COUNTS.includes(count)) {
    // Without a supported count there is no default tuning, so the promise of
    // a label for every string can't hold.
    push(
      "error",
      "unsupported-string-count",
      `A fretboard must have 4, 6 or 7 strings. This one has ${String(count)}.`,
      0,
    );
    return done(null, null, []);
  }
  const stringCount = count as StringCount;

  // --- Tokens, line by line.
  const labels: (string | null)[] = [];
  const strings: FretboardString[] = [];
  let markers = 0;

  lines.forEach((text, line) => {
    const tokens = tokenize(text);

    // Only the first token can be a label, and only when it can't be mistaken
    // for a mistyped fret -- a label never begins with a digit -- or for a
    // muted marker, since no tuning is named x.
    const first = tokens[0];
    const label =
      first !== undefined && !/^[0-9]/.test(first.text) && !MUTED_TOKEN.test(first.text)
        ? first.text
        : null;
    labels.push(label);

    const string: FretboardString = { open: false, muted: false, frets: [] };
    let openToken: Token | null = null;
    let mutedToken: Token | null = null;

    for (const token of label === null ? tokens : tokens.slice(1)) {
      markers++;

      if (MUTED_TOKEN.test(token.text)) {
        if (string.muted) {
          push(
            "warning",
            "duplicate-marker",
            "This string is marked muted more than once; it is drawn once.",
            line,
            token.column,
            token.text.length,
          );
          continue;
        }
        string.muted = true;
        mutedToken = token;
        continue;
      }

      if (!FRET_TOKEN.test(token.text)) {
        push(
          "error",
          "bad-token",
          `"${token.text}" is not a fret number. Use 0 for an open string, x for a muted one, or a fret from 1 to ${String(maxFret)}.`,
          line,
          token.column,
          token.text.length,
        );
        continue;
      }

      const fret = Number(token.text);
      if (fret > maxFret) {
        push(
          "error",
          "fret-out-of-range",
          `Fret ${token.text} is past the last fret, ${String(maxFret)}.`,
          line,
          token.column,
          token.text.length,
        );
        continue;
      }

      const repeated = fret === 0 ? string.open : string.frets.includes(fret);
      if (repeated) {
        push(
          "warning",
          "duplicate-marker",
          fret === 0
            ? "This string is marked open more than once; it is drawn once."
            : `Fret ${token.text} appears more than once on this string; it is drawn once.`,
          line,
          token.column,
          token.text.length,
        );
        continue;
      }

      if (fret === 0) {
        string.open = true;
        openToken = token;
      } else {
        string.frets.push(fret);
      }
    }

    if (openToken !== null && string.frets.length > 0) {
      push(
        "error",
        "open-with-fret",
        "A string can be open or fretted, not both.",
        line,
        openToken.column,
        openToken.text.length,
      );
    }

    if (mutedToken !== null && (string.open || string.frets.length > 0)) {
      push(
        "error",
        "muted-with-marker",
        "A muted string isn't played, so it can't also be open or fretted.",
        line,
        mutedToken.column,
        mutedToken.text.length,
      );
    }

    string.frets.sort((a, b) => a - b);
    strings.push(string);
  });

  // --- Labels: all or none.
  const firstIsLabeled = labels[0] !== null;
  const odd = labels.findIndex((label) => (label !== null) !== firstIsLabeled);
  let resolved: string[] | null = null;
  if (odd >= 0) {
    push("error", "partial-labels", "Either every line names its string, or none do.", odd, 0);
  } else if (firstIsLabeled) {
    resolved = labels.filter((label) => label !== null);
  }

  // A line holding only bad tokens still tried to mark something, and already
  // has its own error; reporting "nothing to draw" on top would pile a
  // consequence on its cause.
  if (markers === 0) {
    push(
      "error",
      "no-frets",
      "Add at least one fret, 0 for an open string, or x for a muted one.",
      0,
    );
  }

  return done(stringCount, resolved, strings);
}
