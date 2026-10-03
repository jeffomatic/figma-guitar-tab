// The message contract both halves compile against.
//
// A Figma plugin runs as two programs -- the React iframe and the sandbox that
// alone can touch the document -- communicating only by message passing. This
// union lives here so neither half defines its own copy of it.
//
// Staged on purpose: only the tablature half exists. `FretboardSettings` has no
// defaults until M6 and no UI until M7, so a `fretboard` key in `Defaults`
// would have nothing to put in it. M7 widens `Mode`, `Diagram` and `Defaults`.

import type { ParseError } from "./diagnostics";
import type { TablatureSettings } from "./settings";

/** `"fretboard"` joins at M7. */
export type Mode = "tablature";

/** Everything needed to render: a mode, its own settings type, and the source. */
export interface Diagram {
  mode: "tablature";
  settings: TablatureSettings;
  source: string;
}

/** Per-user last-used settings for new diagrams, one entry per mode. */
export interface Defaults {
  tablature: TablatureSettings;
}

/**
 * What the current selection means for the UI's mode.
 *
 * M4 only ever produces `none`. Reading plugin data off a selected frame, and
 * therefore the other two cases, is M5's.
 */
export type SelectionState =
  /** Create mode: nothing editable is selected. */
  | { kind: "none" }
  /** Edit mode: a recognized generated frame is selected. */
  | { kind: "editable"; frameId: string; diagram: Diagram }
  /** A generated frame whose schemaVersion is newer than this plugin supports. */
  | { kind: "unsupported-version"; frameId: string; schemaVersion: number };

export type RenderTarget = { kind: "new" } | { kind: "existing"; frameId: string };

/** UI -> sandbox. */
export type UiMessage =
  /** Sent once when the React tree mounts; prompts an init reply. */
  | { type: "ui-ready" }
  | { type: "render"; diagram: Diagram; target: RenderTarget }
  | { type: "close" };

/** sandbox -> UI. */
export type SandboxMessage =
  /**
   * Reply to ui-ready. `command` is `"edit"` only when the selection is
   * editable, which M5 introduces; M4 always sends `"run"`.
   */
  | { type: "init"; command: "run" | "edit"; defaults: Defaults; selection: SelectionState }
  /** Pushed on every selectionchange, and once as part of init. */
  | { type: "selection"; selection: SelectionState }
  | { type: "render-done"; frameId: string }
  /** Rendering was refused or failed; `message` is user-facing. */
  | { type: "render-failed"; message: string; errors: ParseError[] };

const uiMessageTypes = new Set<string>(["ui-ready", "render", "close"]);
const sandboxMessageTypes = new Set<string>(["init", "selection", "render-done", "render-failed"]);

function discriminantOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { type } = data as { type?: unknown };
  return typeof type === "string" ? type : null;
}

// postMessage hands over `unknown`, so each half narrows on the discriminant
// before trusting a payload. The cast lives in here, once, rather than at every
// receiver; settings arriving over the wire are clamped regardless.

export function asUiMessage(data: unknown): UiMessage | null {
  const type = discriminantOf(data);
  return type !== null && uiMessageTypes.has(type) ? (data as UiMessage) : null;
}

export function asSandboxMessage(data: unknown): SandboxMessage | null {
  const type = discriminantOf(data);
  return type !== null && sandboxMessageTypes.has(type) ? (data as SandboxMessage) : null;
}
