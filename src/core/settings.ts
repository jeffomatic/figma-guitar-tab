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
  /**
   * Whitespace between a note cell and the start of the next slot.
   *
   * Every gap is exactly this, whatever the cells are: a slot advances by its
   * widest cell plus this gap. It was once a *minimum advance* instead, which
   * meant narrow slots were governed by the pitch and wide ones by a separate
   * floor -- two rules, so two visibly different gaps in the same row.
   */
  noteGap: number;
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
  noteGap: 16,
  strokeWeight: 1,
  stringGap: 16,
  fontSize: 12,
  rowGap: 32,
};

export const tablatureRanges: Record<keyof TablatureSettings, SettingRange> = {
  // The minimum doubles as the old `cellGap`'s job: cells never touch.
  noteGap: { min: 4, max: 200, step: 1 },
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
  noteGap: "Note spacing",
  strokeWeight: "String weight",
  stringGap: "String spacing",
  fontSize: "Text size",
  rowGap: "Row spacing",
};

// --- Fixed for v1, not user-configurable.

/** Space between a note cell's text and the string line on either side of it. */
export const clearance = 2;
/** Space between the string-label column and the string lines. */
export const stringLabelGap = 8;
/** Fill of the fretboard's open-string disc, from M7. Assumes a white page. */
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
/**
 * Take whatever numbers are present and default the rest. Does **not** clamp.
 *
 * Separate from clamping because stored plugin data and `clientStorage` go
 * through here first: an out-of-range value survives, so the clamp downstream
 * can report it. Silently fixing it on the way in would hide exactly what
 * `setting-out-of-range` exists to say.
 */
export function fillTablatureSettings(input: unknown): TablatureSettings {
  const record: Record<string, unknown> =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  const settings = { ...tablatureDefaults };
  for (const key of settingKeys) {
    const raw = record[key];
    if (typeof raw === "number" && Number.isFinite(raw)) settings[key] = raw;
  }
  return settings;
}

export function clampTablatureSettings(input: unknown): {
  settings: TablatureSettings;
  diagnostics: ParseError[];
} {
  const settings = fillTablatureSettings(input);
  const diagnostics: ParseError[] = [];

  for (const key of settingKeys) {
    const { min, max } = tablatureRanges[key];
    const clamped = Math.min(max, Math.max(min, settings[key]));
    if (clamped === settings[key]) continue;

    diagnostics.push({
      severity: "warning",
      code: "setting-out-of-range",
      message: `${tablatureLabels[key]} must be between ${String(min)} and ${String(max)}. Using ${String(clamped)}.`,
    });
    settings[key] = clamped;
  }

  return { settings, diagnostics };
}
