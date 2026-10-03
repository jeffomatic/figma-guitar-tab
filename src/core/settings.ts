// Render settings: defaults, ranges, clamping, and the v1 constants.
//
// This module is the single home for a setting's range. The UI reads `min`,
// `max` and `step` from here for its number inputs, and `clamp*` covers the
// cases an input attribute can't: a UI bug, hand-edited plugin data, and a
// value stored before its range narrowed.
//
// Identifiers match the spec's, so formula code reads like the spec.

import type { ParseError } from "./diagnostics";

export interface TablatureSettings {
  /** Minimum advance from one slot to the next; wider cells push their slot out. */
  slotPitch: number;
  strokeWeight: number;
  stringGap: number;
  /** Font size of all text, both string labels and note cells. */
  fontSize: number;
  rowGap: number;
}

export interface SettingRange {
  min: number;
  max: number;
  step: number;
}

export const tablatureDefaults: TablatureSettings = {
  slotPitch: 24,
  strokeWeight: 1,
  stringGap: 16,
  fontSize: 12,
  rowGap: 32,
};

export const tablatureRanges: Record<keyof TablatureSettings, SettingRange> = {
  slotPitch: { min: 4, max: 200, step: 1 },
  strokeWeight: { min: 0.25, max: 8, step: 0.25 },
  stringGap: { min: 4, max: 200, step: 1 },
  fontSize: { min: 4, max: 200, step: 1 },
  rowGap: { min: 0, max: 400, step: 1 },
};

/**
 * What a user calls each setting, from the spec's Naming and UI copy table.
 * No spec or code vocabulary reaches the interface, and a diagnostic message is
 * user-facing, so it names the setting from here and never by its identifier.
 */
export const tablatureLabels: Record<keyof TablatureSettings, string> = {
  slotPitch: "Note spacing",
  strokeWeight: "String weight",
  stringGap: "String spacing",
  fontSize: "Text size",
  rowGap: "Row spacing",
};

// --- Fixed for v1, not user-configurable.

/** Padding around a knockout: beside the text, and beyond the line's thickness. */
export const clearance = 2;
/** Minimum whitespace between a cell and the start of the next slot. */
export const cellGap = 4;
/** Space between the string-label column and the string lines. */
export const stringLabelGap = 8;
/** Fill of the rectangles that hide a string line behind text. Assumes a white page. */
export const knockoutFill = "#FFFFFF";
/** Lines and text. */
export const inkColor = "#000000";
/** Falls back to Roboto Regular, which is always available in Figma. */
export const fontFamily = "Roboto Mono";

export type StringCount = 4 | 6 | 7;

/**
 * Used for any string the source doesn't label, so every diagram has a label
 * for every string. Ordered top to bottom -- highest-pitched first -- matching
 * a row group's `labels`.
 *
 * Four is standard bass, six standard guitar, seven adds the conventional low B
 * beneath it. Any other string count is rejected in parsing, which is what
 * guarantees a tuning exists here.
 */
export const defaultTunings: Record<StringCount, readonly string[]> = {
  4: ["G", "D", "A", "E"],
  6: ["e", "B", "G", "D", "A", "E"],
  7: ["e", "B", "G", "D", "A", "E", "B"],
};

const settingKeys = Object.keys(tablatureDefaults) as (keyof TablatureSettings)[];

/**
 * Bring settings from anywhere -- a render message, plugin data, clientStorage
 * -- into range.
 *
 * Out of range clamps to the nearest end and warns, because that always yields
 * a sensible render. A missing key, or one whose type is wrong, falls back to
 * that setting's default silently: there is no value to report.
 */
export function clampTablatureSettings(input: unknown): {
  settings: TablatureSettings;
  diagnostics: ParseError[];
} {
  const record: Record<string, unknown> =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  const settings = { ...tablatureDefaults };
  const diagnostics: ParseError[] = [];

  for (const key of settingKeys) {
    const raw = record[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;

    const { min, max } = tablatureRanges[key];
    const clamped = Math.min(max, Math.max(min, raw));
    settings[key] = clamped;

    if (clamped !== raw) {
      diagnostics.push({
        severity: "warning",
        code: "setting-out-of-range",
        message: `${tablatureLabels[key]} must be between ${String(min)} and ${String(max)}. Using ${String(clamped)}.`,
      });
    }
  }

  return { settings, diagnostics };
}
