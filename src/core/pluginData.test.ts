import { describe, expect, it } from "vitest";

import { currentSchemaVersion, decode, encode } from "./pluginData";
import { tablatureDefaults } from "./settings";

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
    // No fretboard frame can exist until M7 renders one.
    expect(decode(stored({ mode: "fretboard" }))).toEqual({ kind: "unrecognized" });
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
    expect(result.kind === "editable" && result.diagram.settings.noteGap).toBe(9999);
  });

  it("keeps the source verbatim, including newlines", () => {
    const source = "e|-1-\nB|-2-\nG|-3-\nD|-4-\nA|-5-\nE|-6-";
    const result = decode(stored({ source }));
    expect(result.kind === "editable" && result.diagram.source).toBe(source);
  });
});
