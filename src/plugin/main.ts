// The sandbox half: the only code that calls the Figma API.
//
// Ordering is deliberate inside a render. Every await finishes before the first
// document write, so the whole render lands in one undo step -- an await
// between two writes would split it in two.

import { asUiMessage, type Diagram, type SandboxMessage } from "../core/protocol";
import { clampTablatureSettings, tablatureDefaults } from "../core/settings";
import { layoutTablature } from "../core/tablature/layout";
import { parseTablature } from "../core/tablature/parse";
import { resolveFont } from "./font";
import { createMeasurer } from "./measure";
import { renderTablature } from "./render";

figma.showUI(__html__, { width: 420, height: 620 });

function reply(message: SandboxMessage): void {
  figma.ui.postMessage(message);
}

/** Centre the frame on the viewport, falling back to the origin. */
function placeAtDefaultLocation(frame: FrameNode): void {
  const center = figma.viewport.center;
  const x = center.x - frame.width / 2;
  const y = center.y - frame.height / 2;
  frame.x = Number.isFinite(x) ? x : 0;
  frame.y = Number.isFinite(y) ? y : 0;
}

async function render(diagram: Diagram): Promise<void> {
  // Re-validated here rather than trusting the UI, with the same parser and the
  // same clamp the UI used. Both halves import one module, so they cannot
  // disagree -- and if this ever fires, the UI failed to predict it, which is a
  // bug and the message says so.
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

  // Guards against PageNode's restricted members under documentAccess
  // "dynamic-page". Creation calls auto-append to the current page, so the
  // renderer never calls PageNode.appendChild itself.
  await figma.currentPage.loadAsync();
  const font = await resolveFont();

  // --- No awaits past this point: everything below is one undo step.
  const { measure, dispose } = createMeasurer(font);
  try {
    const scene = layoutTablature(parse, settings, measure);
    const frame = renderTablature(scene, font);

    // Positioned last: the frame hugs its rows, so its size is only final once
    // every row is in place.
    placeAtDefaultLocation(frame);
    figma.currentPage.selection = [frame];

    figma.notify(`Rendered ${String(scene.rows.length)} row${scene.rows.length === 1 ? "" : "s"}.`);
    reply({ type: "render-done", frameId: frame.id });
  } finally {
    dispose();
  }
}

async function handle(data: unknown): Promise<void> {
  const message = asUiMessage(data);
  if (!message) return;

  switch (message.type) {
    case "ui-ready":
      reply({
        type: "init",
        // "edit" needs setRelaunchData, and a readable selection needs plugin
        // data. Both are M5's.
        command: "run",
        defaults: { tablature: tablatureDefaults },
        selection: { kind: "none" },
      });
      return;

    case "render":
      await render(message.diagram);
      return;

    case "close":
      figma.closePlugin();
      return;
  }
}

figma.ui.onmessage = (data: unknown) => {
  void handle(data);
};
