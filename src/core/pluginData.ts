// Encoding and decoding a diagram stored on a frame.
//
// The I/O lives in `src/plugin/pluginData.ts`; this is the part worth testing:
// version policy, JSON parsing, and what to do with data that is ours but
// unusable.

import type { Diagram } from "./protocol";
import { fillTablatureSettings } from "./settings";

export const currentSchemaVersion = 1;

export type Decoded =
  /** Readable, and this version supports it. */
  | { kind: "editable"; diagram: Diagram }
  /** Written by a newer plugin. Must not be edited. */
  | { kind: "unsupported-version"; schemaVersion: number }
  /** Not ours: no plugin data, or a mode this version can't render. */
  | { kind: "unrecognized" }
  /** Ours, but the stored diagram can't be used. Worth telling the user. */
  | { kind: "unreadable" };

/** Figma stores strings only, so anything structured is JSON. */
export function encode(diagram: Diagram): Record<string, string> {
  return {
    schemaVersion: String(currentSchemaVersion),
    mode: diagram.mode,
    source: diagram.source,
    settings: JSON.stringify(diagram.settings),
  };
}

export function decode(raw: Record<string, string>): Decoded {
  const version = raw.schemaVersion ?? "";
  const mode = raw.mode ?? "";

  // A frame is ours when schemaVersion and mode are both present and readable.
  if (version === "" || mode === "" || !/^\d+$/.test(version)) return { kind: "unrecognized" };

  const schemaVersion = Number.parseInt(version, 10);
  if (schemaVersion < 1) return { kind: "unrecognized" };
  if (schemaVersion > currentSchemaVersion) return { kind: "unsupported-version", schemaVersion };

  // A version below the current one would be upgraded here, through one
  // migration per step. There are none: 1 is the first version, so this branch
  // is unreachable until a version 2 exists. An empty registry now would be
  // machinery with nothing to do.

  // "fretboard" frames cannot exist until M7 renders them.
  if (mode !== "tablature") return { kind: "unrecognized" };

  // `getPluginData` returns "" for a key that was never set, and a rendered
  // frame can never hold an empty source -- `empty-source` is an error, so the
  // render would have been refused. Absent and empty therefore mean the same
  // thing, and both mean the data is corrupt.
  const source = raw.source ?? "";
  if (source === "") return { kind: "unreadable" };

  let settings: unknown = {};
  try {
    settings = JSON.parse(raw.settings ?? "{}");
  } catch {
    // Unparseable JSON is just "every key missing", which the spec already
    // says falls back to defaults. Not its own failure case.
    settings = {};
  }

  return {
    kind: "editable",
    diagram: { mode: "tablature", source, settings: fillTablatureSettings(settings) },
  };
}
