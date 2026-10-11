import { describe, expect, it } from "vitest";

import {
  clampFretboardSettings,
  clampTablatureSettings,
  defaultTunings,
  dotDiameter,
  fretboardDefaults,
  fretboardLabels,
  fretboardRanges,
  nutStrokeWeight,
  tablatureDefaults,
  tablatureLabels,
  tablatureRanges,
  type FretboardSettings,
  type TablatureSettings,
} from "./settings";

const keys = Object.keys(tablatureDefaults) as (keyof TablatureSettings)[];

describe("tablature settings", () => {
  it("defaults are in range", () => {
    for (const key of keys) {
      const { min, max } = tablatureRanges[key];
      expect(tablatureDefaults[key]).toBeGreaterThanOrEqual(min);
      expect(tablatureDefaults[key]).toBeLessThanOrEqual(max);
    }
  });

  it("passes an in-range value through without a diagnostic", () => {
    const { settings, diagnostics } = clampTablatureSettings({
      ...tablatureDefaults,
      fontSize: 20,
    });
    expect(settings.fontSize).toBe(20);
    expect(diagnostics).toEqual([]);
  });

  it("clamps at both ends of every range, warning once per setting", () => {
    for (const key of keys) {
      const { min, max } = tablatureRanges[key];

      const low = clampTablatureSettings({ [key]: min - 1 });
      expect(low.settings[key]).toBe(min);
      expect(low.diagnostics.map((d) => d.code)).toEqual(["setting-out-of-range"]);
      expect(low.diagnostics.map((d) => d.severity)).toEqual(["warning"]);

      const high = clampTablatureSettings({ [key]: max + 1 });
      expect(high.settings[key]).toBe(max);
      expect(high.diagnostics).toHaveLength(1);
    }
  });

  it("raises one diagnostic per offending setting", () => {
    const { diagnostics } = clampTablatureSettings({ fontSize: -5, rowGap: -1, noteGap: 1e6 });
    expect(diagnostics).toHaveLength(3);
  });

  it("clamping is a warning, because it always yields a sensible render", () => {
    const { diagnostics } = clampTablatureSettings({ fontSize: 0 });
    expect(diagnostics.every((d) => d.severity === "warning")).toBe(true);
  });

  it("a settings diagnostic carries no source anchor", () => {
    const { diagnostics } = clampTablatureSettings({ fontSize: 0 });
    // It is out of range no matter what the tab says, so there is no line to
    // point at -- and line 0 would send the UI to an innocent line.
    expect(diagnostics[0]?.line).toBeUndefined();
    expect(diagnostics[0]?.column).toBeUndefined();
  });

  it("names the setting the way the UI does, never by its identifier", () => {
    const { diagnostics } = clampTablatureSettings({ noteGap: 0 });
    const message = diagnostics[0]?.message ?? "";
    expect(message).toContain(tablatureLabels.noteGap);
    expect(message).not.toContain("noteGap");
  });

  it("falls back silently for a missing or wrongly typed value", () => {
    for (const input of [{}, { fontSize: "12" }, { fontSize: null }, { fontSize: Number.NaN }]) {
      const { settings, diagnostics } = clampTablatureSettings(input);
      expect(settings.fontSize).toBe(tablatureDefaults.fontSize);
      expect(diagnostics).toEqual([]);
    }
  });

  it("survives input that is not an object at all", () => {
    for (const input of [null, undefined, 42, "nope", []]) {
      expect(clampTablatureSettings(input).settings).toEqual(tablatureDefaults);
    }
  });

  it("every supported string count has a tuning, one label per string", () => {
    for (const count of [4, 6, 7] as const) {
      expect(defaultTunings[count]).toHaveLength(count);
    }
    // Read top to bottom: highest-pitched string first.
    expect(defaultTunings[6]).toEqual(["e", "B", "G", "D", "A", "E"]);
    expect(defaultTunings[7][0]).toBe("e");
    expect(defaultTunings[7].at(-1)).toBe("B");
  });

  it("every setting has a UI label", () => {
    for (const key of keys) {
      expect(tablatureLabels[key]).toBeTruthy();
      expect(tablatureLabels[key]).not.toBe(key);
    }
  });
});

const fretboardKeys = Object.keys(fretboardDefaults) as (keyof FretboardSettings)[];

describe("fretboard settings", () => {
  it("defaults are in range", () => {
    for (const key of fretboardKeys) {
      const { min, max } = fretboardRanges[key];
      expect(fretboardDefaults[key]).toBeGreaterThanOrEqual(min);
      expect(fretboardDefaults[key]).toBeLessThanOrEqual(max);
    }
  });

  it("clamps at both ends of every range, warning once per setting", () => {
    for (const key of fretboardKeys) {
      const { min, max } = fretboardRanges[key];

      const low = clampFretboardSettings({ [key]: min - 1 });
      expect(low.settings[key]).toBe(min);
      expect(low.diagnostics.map((d) => d.code)).toEqual(["setting-out-of-range"]);
      expect(low.diagnostics.map((d) => d.severity)).toEqual(["warning"]);

      const high = clampFretboardSettings({ [key]: max + 1 });
      expect(high.settings[key]).toBe(max);
      expect(high.diagnostics).toHaveLength(1);
    }
  });

  it("rounds a fractional fret count, with a warning", () => {
    // Half a fret is not a fret: the window would come out fractional.
    const { settings, diagnostics } = clampFretboardSettings({
      leadingFrets: 1.5,
      trailingFrets: 2.4,
    });
    expect(settings.leadingFrets).toBe(2);
    expect(settings.trailingFrets).toBe(2);
    expect(diagnostics.map((d) => d.code)).toEqual([
      "setting-out-of-range",
      "setting-out-of-range",
    ]);
    expect(diagnostics.every((d) => d.severity === "warning")).toBe(true);
    expect(diagnostics[0]?.message).toContain(fretboardLabels.leadingFrets);
  });

  it("rounds and clamps a fractional fret count in one diagnostic", () => {
    const { settings, diagnostics } = clampFretboardSettings({ leadingFrets: 30.7 });
    expect(settings.leadingFrets).toBe(fretboardRanges.leadingFrets.max);
    expect(diagnostics).toHaveLength(1);
  });

  it("leaves fractions alone where a fraction is a real value", () => {
    const { settings, diagnostics } = clampFretboardSettings({
      fretGapWidth: 36.5,
      strokeWeight: 1.5,
    });
    expect(settings.fretGapWidth).toBe(36.5);
    expect(settings.strokeWeight).toBe(1.5);
    expect(diagnostics).toEqual([]);
  });

  it("falls back silently for a missing or wrongly typed value", () => {
    for (const input of [{}, { leadingFrets: "1" }, null, 42]) {
      const { settings, diagnostics } = clampFretboardSettings(input);
      expect(settings).toEqual(fretboardDefaults);
      expect(diagnostics).toEqual([]);
    }
  });

  it("every setting has a UI label", () => {
    for (const key of fretboardKeys) {
      expect(fretboardLabels[key]).toBeTruthy();
      expect(fretboardLabels[key]).not.toBe(key);
    }
  });

  it("an open disc is wide enough to cover the nut it sits on", () => {
    expect(dotDiameter).toBeGreaterThan(nutStrokeWeight);
  });
});
