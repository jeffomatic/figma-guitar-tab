// Scene items: what layout emits and the renderer draws, in spec coordinates.
//
// Plain data, shared by both modes. Each mode's layout declares the union of
// the kinds it actually emits, so the renderer's switch only has to handle a
// kind once some mode produces it.

/**
 * A line: two endpoints and a thickness, centred on the segment between them.
 * Axis-aligned everywhere but the fretboard's muted X. Which node draws it is
 * the renderer's business; `lineBox` gives the geometry.
 */
export interface LineItem {
  kind: "line";
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWeight: number;
  stroke: string;
}

export interface RectItem {
  kind: "rect";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

export interface TextItem {
  kind: "text";
  name: string;
  /** Left edge. Text is never positioned by a centre point. */
  x: number;
  /** Top edge, already offset by half the font size. */
  y: number;
  characters: string;
  fontSize: number;
  fill: string;
}

/**
 * A circle, placed by the top-left corner of its bounding box -- where Figma
 * places an ellipse -- so the renderer does no arithmetic to draw one.
 */
export interface DiscItem {
  kind: "disc";
  name: string;
  x: number;
  y: number;
  diameter: number;
  /** null for no fill. */
  fill: string | null;
  /** null for no stroke, in which case `strokeWeight` means nothing. */
  stroke: string | null;
  strokeWeight: number;
}

/** A 2x3 affine transform in Figma's `relativeTransform` layout. */
export type Transform = [[number, number, number], [number, number, number]];

/**
 * A line as a rectangle: `width` along the line, `height` its thickness, placed
 * by `transform`.
 */
export interface LineBox {
  width: number;
  height: number;
  transform: Transform;
}

/**
 * The rectangle whose ink is exactly the line: every point within half the
 * stroke weight of the segment, with square ends at the endpoints.
 *
 * Axis-aligned lines come back unrotated -- a vertical one is a tall, narrow
 * box, not a wide one turned 90 degrees -- so the layers read naturally in
 * Figma's inspector. Only a diagonal is rotated.
 */
export function lineBox(item: LineItem): LineBox {
  const { x1, y1, x2, y2, strokeWeight: w } = item;
  const half = w / 2;

  if (y1 === y2) {
    return {
      width: Math.abs(x2 - x1),
      height: w,
      transform: [
        [1, 0, Math.min(x1, x2)],
        [0, 1, y1 - half],
      ],
    };
  }
  if (x1 === x2) {
    return {
      width: w,
      height: Math.abs(y2 - y1),
      transform: [
        [1, 0, x1 - half],
        [0, 1, Math.min(y1, y2)],
      ],
    };
  }

  // The rectangle's local x axis runs along the line and its y axis across it,
  // so its origin is the start point moved half a stroke against the normal.
  const length = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  // The normal: the line's direction turned a quarter towards +y.
  const nx = -uy;
  const ny = ux;
  return {
    width: length,
    height: w,
    transform: [
      [ux, nx, x1 - nx * half],
      [uy, ny, y1 - ny * half],
    ],
  };
}
