// Tablature geometry: a parse result plus settings plus measurement -> a scene.
//
// A scene is plain data in spec coordinates. The renderer walks it and creates
// nodes; it makes no layout decisions and does no arithmetic beyond translating
// coordinates onto a frame. Every geometry question is therefore answerable in a
// unit test, with no Figma runtime and no screenshots.

import type { Measure } from "../measure";
import {
  clearance,
  defaultTunings,
  inkColor,
  stringLabelGap,
  type TablatureSettings,
} from "../settings";
import type { Cell, RowGroup, TablatureParse } from "./parse";

export type SceneItem =
  | {
      kind: "line";
      name: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeWeight: number;
      stroke: string;
    }
  | {
      kind: "rect";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
    }
  | {
      kind: "text";
      name: string;
      /** Left edge. Text is never positioned by a centre point. */
      x: number;
      /** Top edge, already offset by half the font size. */
      y: number;
      characters: string;
      fontSize: number;
      fill: string;
    };

export interface RowScene {
  name: string;
  width: number;
  height: number;
  /** In z-order: string labels, string segments, measure breaks, cell text. */
  items: SceneItem[];
}

export interface TablatureScene {
  name: string;
  /**
   * The parent frame's auto-layout `itemSpacing`. It appears here and nowhere
   * else -- row coordinates are row-local, so no item's `y` includes it.
   */
  rowGap: number;
  rows: RowScene[];
}

/** One slot's measured geometry, plus each of its cells' own width. */
interface SlotMetrics {
  /** Slot left edge. Every cell in the slot starts here. */
  x: number;
  /** The widest cell in the slot. Zero for a measure break. */
  width: number;
  /** Empty for a measure break, which holds no cells. */
  cells: { cell: Cell; width: number }[];
  isBreak: boolean;
}

/**
 * Assumes a diagnostic-free parse: the sandbox checks diagnostics before it
 * renders, and the UI disables rendering while any error stands.
 */
export function layoutTablature(
  parse: TablatureParse,
  settings: TablatureSettings,
  measure: Measure,
): TablatureScene {
  const { stringCount } = parse;
  const rows =
    stringCount === null
      ? []
      : parse.rows.map((group, index) => layoutRow(group, index, stringCount, settings, measure));

  return { name: "Guitar Tab", rowGap: settings.rowGap, rows };
}

function layoutRow(
  group: RowGroup,
  rowIndex: number,
  stringCount: 4 | 6 | 7,
  settings: TablatureSettings,
  measure: Measure,
): RowScene {
  const { fontSize, stringGap, noteGap, strokeWeight } = settings;

  // Substituting the default tuning is a layout concern, not a parsing one: the
  // parse result records only what the source wrote.
  const labels = group.labels ?? defaultTunings[stringCount];
  const strings = labels.length;

  // `L` is per row group, from that row's own labels. Rows whose labels differ
  // in width start their string lines at different x and do not align with each
  // other -- deliberate, so the rendering respects what the ASCII says.
  const labelWidths = labels.map((label) => measure(label, fontSize));
  const labelColumn = Math.max(...labelWidths) + stringLabelGap;

  // Half the tallest ornament on a string line, plus clearance. Not cosmetic:
  // text on the first and last strings is centred on them, so without it half
  // of each glyph falls outside the clipping frame. It also makes the row's
  // bounds equal its ink, so the auto-layout gap is the gap the user sees.
  //
  // This assumes every text node is exactly `fontSize` tall, which holds only
  // because the renderer pins `lineHeight` to `fontSize`. If that is ever
  // dropped, node heights become a font metric and this is wrong.
  const padY = fontSize / 2 + clearance;
  const stringY = (index: number): number => padY + index * stringGap;
  const height = 2 * padY + (strings - 1) * stringGap;

  // The row is bracketed by measure breaks, drawn whether or not the source
  // wrote them. The opening one sits where the string lines begin.
  const openX = labelColumn;

  // Slot positions accumulate: a slot advances by its widest cell plus
  // `noteGap`, so the whitespace between every cell and the next slot is
  // exactly `noteGap` no matter how wide the cells are. `x = n * noteGap`
  // breaks on TC-3 and TC-7, where one slot is far wider than another.
  // A measure break has no cells, so it advances by `noteGap` alone -- which is
  // what gives it a full gap on each side.
  const slots: SlotMetrics[] = [];
  let x = openX + noteGap;
  for (const slot of group.slots) {
    const cells =
      slot.kind === "notes"
        ? slot.cells.map((cell) => ({ cell, width: measure(cell.characters, fontSize) }))
        : [];
    const width = cells.reduce((widest, entry) => Math.max(widest, entry.width), 0);
    slots.push({ x, width, cells, isBreak: slot.kind === "break" });
    x += width + noteGap;
  }

  const last = slots.at(-1);
  // A row with no slots at all is `empty-row-group`, which blocks the render;
  // this just keeps layout from reading a last slot that isn't there.
  const closeX = last ? last.x + last.width + noteGap : openX + noteGap;

  // A full stroke past the closing break, not half of one. Half is what the
  // break's ink actually occupies, but that puts its outer edge exactly on the
  // frame's clip boundary, where it gets cut; a whole weight leaves the ink
  // strictly inside. Same argument `padY` makes vertically, where `clearance`
  // plays the part of the slack. The left edge needs no allowance: `openX` is
  // the label column's width, always wider than the heaviest stroke.
  const width = closeX + strokeWeight;

  const items: SceneItem[] = [];

  // Right-aligned against the label column, but emitted as a left edge so that
  // every text node in the scene is positioned the same way.
  labels.forEach((label, index) => {
    items.push({
      kind: "text",
      name: `Label ${label}`,
      x: labelColumn - stringLabelGap - (labelWidths[index] ?? 0),
      y: stringY(index) - fontSize / 2,
      characters: label,
      fontSize,
      fill: inkColor,
    });
  });

  // Note slots are numbered among themselves, so a measure break between two of
  // them doesn't advance the slot number: a layer name should read the way a
  // player counts notes, not the way the array is indexed.
  const noteSlots = slots.filter((slot) => !slot.isBreak);

  // Each string is the segments left over once every cell on it has cut its
  // gap. A gap is sized from the cell's own width, not the slot's, so a narrow
  // cell in a wide slot cuts only itself, and a string with no cell in a slot
  // runs straight through it. Nothing is drawn in a gap, so the background
  // shows through whatever colour it is.
  for (let index = 0; index < strings; index++) {
    const gaps: Span[] = [];
    for (const slot of noteSlots) {
      for (const { cell, width: cellWidth } of slot.cells) {
        if (cell.stringIndex !== index) continue;
        gaps.push([slot.x - clearance, slot.x + cellWidth + clearance]);
      }
    }

    stringSegments(openX, closeX, gaps).forEach(([x1, x2], k) => {
      items.push({
        kind: "line",
        name: `String ${String(index)} Segment ${String(k)}`,
        x1,
        y1: stringY(index),
        x2,
        y2: stringY(index),
        strokeWeight,
        stroke: inkColor,
      });
    });
  }

  // Vertical, joining the top string's line to the bottom's. Numbered among
  // breaks, including the two the row adds itself, so the names read 0, 1, 2
  // rather than skipping slot indices.
  //
  // Each one overshoots the outermost string lines by half a stroke. Ending it
  // on `stringY(0)` would end it at the *centre* of the top string's stroke,
  // leaving the outer half of that stroke's thickness uninked where the two
  // meet -- a notch at the row's top corners. Overshooting covers exactly that
  // half, and is invisible on an interior break, which simply runs half a
  // stroke past the outer strings inside `padY`'s slack.
  const overshoot = strokeWeight / 2;
  const breakXs = [openX, ...slots.filter((slot) => slot.isBreak).map((slot) => slot.x), closeX];
  breakXs.forEach((breakX, index) => {
    items.push({
      kind: "line",
      name: `Measure Break ${String(index)}`,
      x1: breakX,
      y1: stringY(0) - overshoot,
      x2: breakX,
      y2: stringY(strings - 1) + overshoot,
      strokeWeight,
      stroke: inkColor,
    });
  });

  // Left-aligned at the slot's edge: every cell of one chord begins in the same
  // character column in the source, and centring would stagger them whenever a
  // slot mixes widths.
  noteSlots.forEach((slot, n) => {
    for (const { cell } of slot.cells) {
      items.push({
        kind: "text",
        name: `Slot ${String(n)} String ${String(cell.stringIndex)}`,
        x: slot.x,
        y: stringY(cell.stringIndex) - fontSize / 2,
        characters: cell.characters,
        fontSize,
        fill: inkColor,
      });
    }
  });

  return { name: `Row ${String(rowIndex)}`, width, height, items };
}

/** A horizontal extent, `[left, right]`. */
type Span = readonly [number, number];

/**
 * Two gaps closer than this are treated as touching. It exists only to absorb
 * floating-point noise from measurement, so that gaps meeting exactly -- which
 * `noteGap` at its minimum produces -- leave no sliver of line between them.
 */
const epsilon = 1e-6;

/**
 * The parts of `[from, to]` that no gap covers, left to right.
 *
 * Gaps are merged where they overlap or touch before the complement is taken,
 * so no zero-length segment is ever emitted. They are not clamped to the row:
 * every gap sits at least `noteGap - clearance` inside the nearest measure
 * break, so none can reach either end.
 */
function stringSegments(from: number, to: number, gaps: Span[]): Span[] {
  const segments: Span[] = [];
  let x = from;
  for (const [left, right] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (left - x > epsilon) segments.push([x, left]);
    x = Math.max(x, right);
  }
  if (to - x > epsilon) segments.push([x, to]);
  return segments;
}
