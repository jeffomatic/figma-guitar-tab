// The sandbox half: the only code that calls the Figma API.
//
// Ordering is deliberate inside a render. Every await finishes before the first
// document write and `clientStorage` is written after the last one, so the whole
// render lands in one undo step -- an await between two writes would split it.

import { checkDiagram, hasErrors } from "../core/diagram";
import { layoutFretboard } from "../core/fretboard/layout";
import {
  asUiMessage,
  type Diagram,
  type Mode,
  type RenderTarget,
  type SandboxMessage,
} from "../core/protocol";
import { fillFretboardSettings, fillTablatureSettings } from "../core/settings";
import { layoutTablature } from "../core/tablature/layout";
import { resolveFont } from "./font";
import { createMeasurer } from "./measure";
import { isRenderable, resolveSelection, writeFrame } from "./pluginData";
import { renderFretboard, renderTablature } from "./render";

const defaultsKey = (mode: Mode): string => `defaults:${mode}`;

// The width is fixed; the height is a first guess that the UI corrects as soon
// as it has laid out its form, and again whenever the form changes size.
const uiWidth = 420;
const uiHeight = { initial: 480, min: 120, max: 900 };

figma.showUI(__html__, { width: uiWidth, height: uiHeight.initial });

function reply(message: SandboxMessage): void {
  figma.ui.postMessage(message);
}

/** Centre a new frame on the viewport, falling back to the origin. */
function placeAtDefaultLocation(frame: FrameNode): void {
  const center = figma.viewport.center;
  const x = center.x - frame.width / 2;
  const y = center.y - frame.height / 2;
  frame.x = Number.isFinite(x) ? x : 0;
  frame.y = Number.isFinite(y) ? y : 0;
}

async function render(diagram: Diagram, target: RenderTarget): Promise<void> {
  // Re-validated here rather than trusting the UI, with the same parser and the
  // same clamp the UI used. Both halves import one module, so they cannot
  // disagree -- and if this fires, the UI failed to predict it, which is a bug.
  const checked = checkDiagram(diagram);
  if (hasErrors(checked.diagnostics)) {
    reply({
      type: "render-failed",
      message:
        "This diagram can't be rendered, and the editor should have caught it. That's a bug.",
      errors: checked.diagnostics.filter((error) => error.severity === "error"),
    });
    return;
  }

  // --- Awaits first, so the writes below are uninterrupted.
  let existing: FrameNode | null = null;
  if (target.kind === "existing") {
    const node = await figma.getNodeByIdAsync(target.frameId);
    if (!isRenderable(node)) {
      // Deleted, or no longer a frame we may draw into. Better to say so than
      // to quietly create a second diagram somewhere else.
      reply({
        type: "render-failed",
        message: "That diagram is no longer there. Deselect it to create a new one.",
        errors: [],
      });
      return;
    }
    existing = node;
  }

  // Guards against PageNode's restricted members under documentAccess
  // "dynamic-page". Creation calls auto-append to the current page, so the
  // renderer never calls PageNode.appendChild itself.
  await figma.currentPage.loadAsync();
  const font = await resolveFont();

  // --- No awaits past this point until the writes are done.
  const { measure, dispose } = createMeasurer(font);
  try {
    const into = existing ?? undefined;
    // An existing frame may be of the other mode. It is converted: the render
    // target follows the selection, whatever mode the frame was drawn in.
    const frame =
      checked.mode === "tablature"
        ? renderTablature(layoutTablature(checked.parse, checked.settings, measure), font, into)
        : renderFretboard(layoutFretboard(checked.parse, checked.settings, measure), font, into);

    // A re-render preserves the frame's position; only a new frame is placed.
    // Positioned last either way, since the frame hugs its rows.
    if (!existing) placeAtDefaultLocation(frame);

    const stored: Diagram =
      checked.mode === "tablature"
        ? { mode: "tablature", settings: checked.settings, source: diagram.source }
        : { mode: "fretboard", settings: checked.settings, source: diagram.source };
    writeFrame(frame, stored);
    figma.currentPage.selection = [frame];

    figma.notify(existing ? "Updated the diagram." : "Rendered a new diagram.");
    reply({ type: "render-done", frameId: frame.id });
  } finally {
    dispose();
  }

  // After the writes, never between them. A render is the only moment the user
  // expresses a preference, which is why there is no separate save message.
  // Only this mode's key: the other mode's preference wasn't expressed.
  await figma.clientStorage.setAsync(defaultsKey(checked.mode), checked.settings);
}

function pushSelection(): void {
  const { state, notify } = resolveSelection();
  reply({ type: "selection", selection: state });
  if (notify !== null) figma.notify(notify);
}

let uiReady = false;

async function handle(data: unknown): Promise<void> {
  const message = asUiMessage(data);
  if (!message) return;

  switch (message.type) {
    case "ui-ready": {
      uiReady = true;
      const tablature: unknown = await figma.clientStorage.getAsync(defaultsKey("tablature"));
      const fretboard: unknown = await figma.clientStorage.getAsync(defaultsKey("fretboard"));
      const { state, notify } = resolveSelection();

      reply({
        type: "init",
        // Reported independently of `selection`: a relaunch button can sit on a
        // frame whose schema is too new, and the UI trusts `selection`.
        command: figma.command === "edit" && state.kind === "editable" ? "edit" : "run",
        // clientStorage hands back `any`, so it goes through the same per-key
        // filtering as stored plugin data.
        defaults: {
          tablature: fillTablatureSettings(tablature),
          fretboard: fillFretboardSettings(fretboard),
        },
        selection: state,
      });
      if (notify !== null) figma.notify(notify);
      return;
    }

    case "render":
      await render(message.diagram, message.target);
      return;

    case "resize": {
      // Clamped, since a message is `unknown` until narrowed and a runaway
      // diagnostic list shouldn't push the window off the screen.
      const { height } = message;
      if (!Number.isFinite(height)) return;
      const clamped = Math.min(uiHeight.max, Math.max(uiHeight.min, Math.ceil(height)));
      figma.ui.resize(uiWidth, clamped);
      return;
    }
  }
}

figma.ui.onmessage = (data: unknown) => {
  void handle(data);
};

// Nothing is pushed before ui-ready: the iframe may not have mounted yet.
figma.on("selectionchange", () => {
  if (uiReady) pushSelection();
});
