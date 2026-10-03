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
  | "too-many-slots"
  | "too-many-rows"
  | "empty-row-group";

/** The fretboard mode's codes join this union at M6. */
export type DiagnosticCode = SharedCode | TablatureCode;

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

/**
 * Source order, so the UI can anchor diagnostics without re-sorting.
 * Unanchored diagnostics sort first: they are about the whole render, not a
 * place in it.
 */
export function bySourcePosition(a: ParseError, b: ParseError): number {
  return (a.line ?? -1) - (b.line ?? -1) || (a.column ?? -1) - (b.column ?? -1);
}
