// The sandbox half: the only code that calls the Figma API.
//
// Ordering is deliberate inside a render. Every await finishes before the first
// document write and `clientStorage` is written after the last one, so the whole
// render lands in one undo step -- an await between two writes would split it.

import {
  asUiMessage,
  type Diagram,
  type RenderTarget,
  type SandboxMessage,
} from "../core/protocol";
import { clampTablatureSettings, fillTablatureSettings } from "../core/settings";
import { layoutTablature } from "../core/tablature/layout";
import { parseTablature } from "../core/tablature/parse";
import { resolveFont } from "./font";
import { createMeasurer } from "./measure";
import { isRenderable, resolveSelection, writeFrame } from "./pluginData";
import { renderTablature } from "./render";

const defaultsKey = "defaults:tablature";

figma.showUI(__html__, { width: 420, height: 620 });

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
  const parse = parseTablature(diagram.source);
  const { settings, diagnostics } = clampTablatureSettings(diagram.settings);
  const errors = [...parse.diagnostics, ...diagnostics].filter(
    (error) => error.severity === "error",
  );

  if (errors.length > 0) {
    reply({
      type: "render-failed",
      message: "This tab can't be rendered, and the editor should have caught it. That's a bug.",
      errors,
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
    const scene = layoutTablature(parse, settings, measure);
    const frame = renderTablature(scene, font, existing ?? undefined);

    // A re-render preserves the frame's position; only a new frame is placed.
    // Positioned last either way, since the frame hugs its rows.
    if (!existing) placeAtDefaultLocation(frame);

    writeFrame(frame, { mode: "tablature", settings, source: diagram.source });
    figma.currentPage.selection = [frame];

    figma.notify(existing ? "Updated the diagram." : "Rendered a new diagram.");
    reply({ type: "render-done", frameId: frame.id });
  } finally {
    dispose();
  }

  // After the writes, never between them. A render is the only moment the user
  // expresses a preference, which is why there is no separate save message.
  await figma.clientStorage.setAsync(defaultsKey, settings);
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
      const stored: unknown = await figma.clientStorage.getAsync(defaultsKey);
      const { state, notify } = resolveSelection();

      reply({
        type: "init",
        // Reported independently of `selection`: a relaunch button can sit on a
        // frame whose schema is too new, and the UI trusts `selection`.
        command: figma.command === "edit" && state.kind === "editable" ? "edit" : "run",
        // clientStorage hands back `any`, so it goes through the same per-key
        // filtering as stored plugin data.
        defaults: { tablature: fillTablatureSettings(stored) },
        selection: state,
      });
      if (notify !== null) figma.notify(notify);
      return;
    }

    case "render":
      await render(message.diagram, message.target);
      return;

    case "close":
      figma.closePlugin();
      return;
  }
}

figma.ui.onmessage = (data: unknown) => {
  void handle(data);
};

// Nothing is pushed before ui-ready: the iframe may not have mounted yet.
figma.on("selectionchange", () => {
  if (uiReady) pushSelection();
});
