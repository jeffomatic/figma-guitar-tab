// Scene items: what layout emits and the renderer draws, in spec coordinates.
//
// Plain data, shared by both modes. Each mode's layout declares the union of
// the kinds it actually emits, so the renderer's switch only has to handle a
// kind once some mode produces it.

/**
 * An axis-aligned line: two endpoints and a thickness, centred on the segment
 * between them. Which node draws it is the renderer's business.
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
