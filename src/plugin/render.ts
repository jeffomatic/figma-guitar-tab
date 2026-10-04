// Scene -> Figma nodes.
//
// This file makes no layout decisions. Every coordinate comes from the scene,
// and the only arithmetic here is the hex-to-RGB conversion Figma's API wants
// and a line's length. If something in here starts wanting a test, it belongs
// in `src/core/` instead.

import type { RowScene, SceneItem, TablatureScene } from "../core/tablature/layout";
import { applyTextStyle } from "./font";

/** Figma wants channels in 0-1; the scene carries `#RRGGBB`. */
function hexToRgb(hex: string): RGB {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

const solid = (hex: string): SolidPaint => ({ type: "SOLID", color: hexToRgb(hex) });

/**
 * Create one node from one scene item.
 *
 * Nodes are appended to `figma.currentPage` on creation, so the caller moves
 * them into their row frame. Z-order is creation order within a parent, which
 * is why items are walked in the order the scene lists them.
 */
function createItem(item: SceneItem, font: FontName): SceneNode {
  switch (item.kind) {
    case "line": {
      // Every line -- strings, measure breaks, and the fretboard's boundaries --
      // is drawn as a rectangle of exactly the stroke's thickness, never as a
      // LineNode.
      //
      // A LineNode's ink does not sit where its geometry says. A rotated one
      // drew half a stroke off along its length (measured: a transform placing
      // a break at y 7.5 for 81px drew low at both ends while the inspector
      // reported exactly that geometry), and a horizontal one does not straddle
      // its `y` either -- which left every string line half a stroke clear of
      // where the formulas put it, and every corner with a notch.
      //
      // A rectangle has no pivot, cap or stroke-alignment semantics: its ink
      // fills exactly [x, x+width] x [y, y+height]. That is what makes a break
      // meet a string line squarely, since both are then positioned from the
      // same centre line by the same half-thickness.
      const horizontal = item.y1 === item.y2;
      const vertical = item.x1 === item.x2;
      if (!horizontal && !vertical) {
        throw new Error(`${item.name}: lines must be axis-aligned`);
      }

      const thickness = item.strokeWeight;
      const rect = figma.createRectangle();
      rect.name = item.name;

      if (horizontal) {
        rect.x = Math.min(item.x1, item.x2);
        rect.y = item.y1 - thickness / 2;
        rect.resize(Math.abs(item.x2 - item.x1), thickness);
      } else {
        rect.x = item.x1 - thickness / 2;
        rect.y = Math.min(item.y1, item.y2);
        rect.resize(thickness, Math.abs(item.y2 - item.y1));
      }

      rect.fills = [solid(item.stroke)];
      rect.strokes = [];
      return rect;
    }

    case "rect": {
      const rect = figma.createRectangle();
      rect.name = item.name;
      rect.resize(item.width, item.height);
      rect.x = item.x;
      rect.y = item.y;
      rect.fills = [solid(item.fill)];
      rect.strokes = [];
      return rect;
    }

    case "text": {
      const text = figma.createText();
      text.name = item.name;
      applyTextStyle(text, font, item.fontSize);
      text.characters = item.characters;
      text.fills = [solid(item.fill)];
      // The scene's y is already the top edge: core did the centring.
      text.x = item.x;
      text.y = item.y;
      return text;
    }
  }
}

function createRow(row: RowScene, parent: FrameNode, font: FontName): FrameNode {
  const frame = figma.createFrame();
  frame.name = row.name;
  frame.fills = [];
  frame.clipsContent = true;

  // Appended before sizing: `layoutSizing*` is only meaningful once the node is
  // a child of an auto-layout frame, and the parent would otherwise hug this
  // row to its contents instead of honouring the computed extent.
  parent.appendChild(frame);
  frame.layoutSizingHorizontal = "FIXED";
  frame.layoutSizingVertical = "FIXED";
  frame.resize(row.width, row.height);

  // No auto-layout inside a row: its children are absolutely positioned,
  // because cell text deliberately overlaps the string lines' band.
  for (const item of row.items) {
    frame.appendChild(createItem(item, font));
  }

  return frame;
}

/**
 * Build the whole diagram. Returns the parent frame, unpositioned.
 *
 * With `into`, re-renders that frame in place: every child is discarded and
 * rebuilt from the scene, and nothing inspects the old subtree first. Its
 * **name is deliberately left alone** -- a re-rendered frame keeps its id,
 * name, position and parent, so the diagram holds its place in the document.
 */
export function renderTablature(
  scene: TablatureScene,
  font: FontName,
  into?: FrameNode,
): FrameNode {
  const parent = into ?? figma.createFrame();
  if (!into) parent.name = scene.name;

  for (const child of [...parent.children]) child.remove();

  parent.fills = [];
  parent.clipsContent = true;
  parent.layoutMode = "VERTICAL";
  parent.itemSpacing = scene.rowGap;
  parent.paddingTop = 0;
  parent.paddingBottom = 0;
  parent.paddingLeft = 0;
  parent.paddingRight = 0;

  for (const row of scene.rows) {
    createRow(row, parent, font);
  }

  // Hug last, so the frame takes its size from the rows it now holds.
  parent.layoutSizingHorizontal = "HUG";
  parent.layoutSizingVertical = "HUG";

  return parent;
}
