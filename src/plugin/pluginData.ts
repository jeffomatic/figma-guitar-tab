// Reading and writing a frame's stored diagram. The decisions live in
// `src/core/pluginData.ts`; this is the Figma-touching shell around them.

import { decode, encode, type Decoded } from "../core/pluginData";
import type { Diagram, SelectionState } from "../core/protocol";

const keys = ["schemaVersion", "mode", "source", "settings"] as const;

/** Private plugin data, not shared plugin data: no other plugin reads this. */
export function readFrame(frame: FrameNode): Decoded {
  const raw: Record<string, string> = {};
  for (const key of keys) raw[key] = frame.getPluginData(key);
  return decode(raw);
}

export function writeFrame(frame: FrameNode, diagram: Diagram): void {
  for (const [key, value] of Object.entries(encode(diagram))) {
    frame.setPluginData(key, value);
  }

  // The manifest's relaunchButtons entry supplies the button's label; this
  // value is an optional description shown beneath it, so it stays empty.
  // Passing the label again would duplicate it as a subtitle.
  frame.setRelaunchData({ edit: "" });
}

export interface ResolvedSelection {
  state: SelectionState;
  /** Set only when the frame is ours but unusable -- worth saying out loud. */
  notify: string | null;
}

/**
 * What the current selection means for the UI.
 *
 * The spec's three cases are exhaustive because recognition requires a readable
 * source: a frame of ours with nothing to edit reports `none` and notifies,
 * rather than needing a fourth case.
 */
export function resolveSelection(): ResolvedSelection {
  const { selection } = figma.currentPage;
  const only = selection.length === 1 ? selection[0] : undefined;
  if (!only || only.type !== "FRAME") return { state: { kind: "none" }, notify: null };

  const decoded = readFrame(only);
  switch (decoded.kind) {
    case "editable":
      return {
        state: { kind: "editable", frameId: only.id, diagram: decoded.diagram },
        notify: null,
      };
    case "unsupported-version":
      return {
        state: {
          kind: "unsupported-version",
          frameId: only.id,
          schemaVersion: decoded.schemaVersion,
        },
        notify: null,
      };
    case "unreadable":
      return {
        state: { kind: "none" },
        notify: "This frame was made by Guitar Tab, but its saved diagram can't be read.",
      };
    case "unrecognized":
      return { state: { kind: "none" }, notify: null };
  }
}

/** Whether an existing render target is still a frame we may draw into. */
export function isRenderable(node: BaseNode | null): node is FrameNode {
  if (!node || node.type !== "FRAME") return false;
  const kind = readFrame(node).kind;
  // Not ours, or written by a newer version: either way, don't touch it.
  return kind === "editable" || kind === "unreadable";
}
