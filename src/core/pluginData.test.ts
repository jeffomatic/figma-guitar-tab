import { describe, expect, it } from "vitest";

import { currentSchemaVersion, decode, encode } from "./pluginData";
import { fretboardDefaults, tablatureDefaults } from "./settings";

const stored = (overrides: Partial<Record<string, string>> = {}): Record<string, string> => ({
  schemaVersion: String(currentSchemaVersion),
  mode: "tablature",
  source: "-1-\n-1-\n-1-\n-1-\n-1-\n-1-",
  settings: JSON.stringify(tablatureDefaults),
  ...overrides,
});

describe("decode", () => {
  it("round-trips an encoded diagram", () => {
    const diagram = {
      mode: "tablature" as const,
      source: "-3-\n-3-\n-0-\n-0-\n-2-\n-3-",
      settings: { ...tablatureDefaults, noteGap: 24 },
    };
    expect(decode(encode(diagram))).toEqual({ kind: "editable", diagram });
  });

  it("is unrecognized without plugin data", () => {
    // Every key reads as "" on a frame nobody wrote to.
    expect(decode({})).toEqual({ kind: "unrecognized" });
    expect(decode({ schemaVersion: "", mode: "", source: "", settings: "" })).toEqual({
      kind: "unrecognized",
    });
  });

  it("is unrecognized when schemaVersion is not a positive integer", () => {
    for (const schemaVersion of ["x", "1.5", "-1", "0", " 1"]) {
      expect(decode(stored({ schemaVersion })), schemaVersion).toEqual({ kind: "unrecognized" });
    }
  });

  it("refuses a newer schemaVersion", () => {
    expect(decode(stored({ schemaVersion: "2" }))).toEqual({
      kind: "unsupported-version",
      schemaVersion: 2,
    });
  });

  it("is unrecognized for a mode this version can't render", () => {
    for (const mode of ["tab", "Tablature", "chord"]) {
      expect(decode(stored({ mode })), mode).toEqual({ kind: "unrecognized" });
    }
  });

  it("is unreadable when the source is missing", () => {
    // Recognized as ours, but there is nothing to edit. A rendered frame can
    // never store an empty source, so empty means corrupt.
    expect(decode(stored({ source: "" }))).toEqual({ kind: "unreadable" });
  });

  it("stays editable on unparseable settings, falling back to defaults", () => {
    const result = decode(stored({ settings: "{not json" }));
    expect(result.kind).toBe("editable");
    expect(result.kind === "editable" && result.diagram.settings).toEqual(tablatureDefaults);
  });

  it("defaults each missing or wrongly typed setting independently", () => {
    const result = decode(
      stored({ settings: JSON.stringify({ noteGap: 30, fontSize: "big", extra: 1 }) }),
    );
    expect(result.kind === "editable" && result.diagram.settings).toEqual({
      ...tablatureDefaults,
      noteGap: 30,
    });
  });

  it("preserves an out-of-range stored value instead of clamping it", () => {
    // The clamp downstream is what reports it. Fixing it silently here would
    // hide the thing setting-out-of-range exists to say.
    const result = decode(stored({ settings: JSON.stringify({ noteGap: 9999 }) }));
    expect(
      result.kind === "editable" &&
        result.diagram.mode === "tablature" &&
        result.diagram.settings.noteGap,
    ).toBe(9999);
  });

  it("keeps the source verbatim, including newlines", () => {
    const source = "e|-1-\nB|-2-\nG|-3-\nD|-4-\nA|-5-\nE|-6-";
    const result = decode(stored({ source }));
    expect(result.kind === "editable" && result.diagram.source).toBe(source);
  });
});

describe("decode, fretboard", () => {
  const fretboard = (overrides: Partial<Record<string, string>> = {}): Record<string, string> =>
    stored({
      mode: "fretboard",
      source: "3\n3\n0\n0\n2\n3",
      settings: JSON.stringify(fretboardDefaults),
      ...overrides,
    });

  it("round-trips an encoded diagram", () => {
    const diagram = {
      mode: "fretboard" as const,
      source: "6 7\n7 9\n6 8 9\n6 8 9\n6 7 9\n7 9",
      settings: { ...fretboardDefaults, fretGapWidth: 40, leadingFrets: 2 },
    };
    expect(decode(encode(diagram))).toEqual({ kind: "editable", diagram });
  });

  it("fills missing settings from the fretboard defaults, not tablature's", () => {
    const result = decode(fretboard({ settings: JSON.stringify({ trailingFrets: 3 }) }));
    expect(result.kind === "editable" && result.diagram).toEqual({
      mode: "fretboard",
      source: "3\n3\n0\n0\n2\n3",
      settings: { ...fretboardDefaults, trailingFrets: 3 },
    });
  });

  it("ignores tablature-only keys", () => {
    const result = decode(fretboard({ settings: JSON.stringify(tablatureDefaults) }));
    // stringGap, strokeWeight and fontSize are shared names, so they carry over;
    // noteGap and rowGap mean nothing here and are dropped.
    expect(result.kind === "editable" && result.diagram.settings).toEqual(fretboardDefaults);
  });

  it("preserves an out-of-range or fractional stored value", () => {
    const result = decode(fretboard({ settings: JSON.stringify({ leadingFrets: 1.5 }) }));
    expect(
      result.kind === "editable" &&
        result.diagram.mode === "fretboard" &&
        result.diagram.settings.leadingFrets,
    ).toBe(1.5);
  });

  it("is unreadable when the source is missing", () => {
    expect(decode(fretboard({ source: "" }))).toEqual({ kind: "unreadable" });
  });
});
