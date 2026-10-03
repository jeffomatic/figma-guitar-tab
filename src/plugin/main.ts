// The sandbox half: the only code that calls the Figma API.
//
// Ordering is deliberate. Every await finishes before the first document write,
// so the whole render lands in one undo step -- an await between two writes
// would split it in two.

import { clampTablatureSettings } from "../core/settings";
import { layoutTablature } from "../core/tablature/layout";
import { parseTablature } from "../core/tablature/parse";
import { resolveFont } from "./font";
import { createMeasurer } from "./measure";
import { renderTablature } from "./render";

// M3 drives the renderer from a fixed source. M4 replaces this with the source
// field in the UI and deletes it.
const source = [
  "e|-------------------|",
  "B|-------------------|",
  "G|-------9-7---------|",
  "D|---7h9---9-7-------|",
  "A|-7-----------9-7---|",
  "E|-------------------|",
  "",
  "e|-------------------|",
  "B|-------------------|",
  "G|---------------7---|",
  "D|-------------7-----|",
  "A|-------7-9---------|",
  "E|-7-9-10------------|",
].join("\n");

figma.showUI(__html__, { width: 420, height: 560 });

/** Centre the frame on the viewport, falling back to the origin. */
function placeAtDefaultLocation(frame: FrameNode): void {
  const center = figma.viewport.center;
  const x = center.x - frame.width / 2;
  const y = center.y - frame.height / 2;
  frame.x = Number.isFinite(x) ? x : 0;
  frame.y = Number.isFinite(y) ? y : 0;
}

async function render(): Promise<void> {
  // Guards against PageNode's restricted members under documentAccess
  // "dynamic-page". Creation calls auto-append to the current page, so the
  // renderer never calls PageNode.appendChild itself.
  await figma.currentPage.loadAsync();

  const font = await resolveFont();

  // --- No awaits past this point: everything below is one undo step.
  const { measure, dispose } = createMeasurer(font);
  try {
    const parse = parseTablature(source);
    const errors = parse.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      // The renderer is not where a bad source gets discovered; the UI blocks
      // this from M4, and the sandbox re-validates rather than trusting it.
      figma.notify(errors[0]?.message ?? "This tab can't be rendered.", { error: true });
      return;
    }

    const { settings } = clampTablatureSettings({});
    const scene = layoutTablature(parse, settings, measure);
    const frame = renderTablature(scene, font);

    // Positioned last: the frame hugs its rows, so its size is only final once
    // every row is in place.
    placeAtDefaultLocation(frame);
    figma.currentPage.selection = [frame];

    figma.notify(`Rendered ${String(scene.rows.length)} row${scene.rows.length === 1 ? "" : "s"}.`);
  } finally {
    dispose();
  }
}

void render();
