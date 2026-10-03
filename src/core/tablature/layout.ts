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
  knockoutFill,
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
  /** In z-order: string labels, string lines, knockouts, cell text. */
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
  /** Slot left edge, `X(n)`. Every cell in the slot starts here. */
  x: number;
  /** `W(n)`: the widest cell in the slot. */
  width: number;
  cells: { cell: Cell; width: number }[];
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

  // Slot positions accumulate: a slot advances by its widest cell plus
  // `noteGap`, so the whitespace between every cell and the next slot is
  // exactly `noteGap` no matter how wide the cells are. `x = n * noteGap`
  // breaks on TC-3 and TC-7, where one slot is far wider than another.
  const slots: SlotMetrics[] = [];
  let x = labelColumn + noteGap / 2;
  for (const slot of group.slots) {
    const cells = slot.cells.map((cell) => ({ cell, width: measure(cell.characters, fontSize) }));
    const width = cells.reduce((widest, entry) => Math.max(widest, entry.width), 0);
    slots.push({ x, width, cells });
    x += width + noteGap;
  }

  const last = slots.at(-1);
  // A row with no slots is `empty-row-group`, which blocks the render; this just
  // keeps layout from reading a last slot that isn't there.
  const width = last ? last.x + last.width + noteGap / 2 : labelColumn;

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

  // One unbroken line per string. Where text would collide with it, a knockout
  // hides it -- the line is never cut into segments.
  for (let index = 0; index < strings; index++) {
    items.push({
      kind: "line",
      name: `String ${String(index)}`,
      x1: labelColumn,
      y1: stringY(index),
      x2: width,
      y2: stringY(index),
      strokeWeight,
      stroke: inkColor,
    });
  }

  // Only as tall as the line it hides, not as tall as the text: 5px at the
  // defaults rather than 12. Sized from the cell's own width, not the slot's,
  // so a narrow cell in a wide slot hides only itself.
  const knockoutHeight = strokeWeight + 2 * clearance;
  slots.forEach((slot, n) => {
    for (const { cell, width: cellWidth } of slot.cells) {
      items.push({
        kind: "rect",
        name: `Knockout Slot ${String(n)} String ${String(cell.stringIndex)}`,
        x: slot.x - clearance,
        y: stringY(cell.stringIndex) - knockoutHeight / 2,
        width: cellWidth + 2 * clearance,
        height: knockoutHeight,
        fill: knockoutFill,
      });
    }
  });

  // Left-aligned at the slot's edge: every cell of one chord begins in the same
  // character column in the source, and centring would stagger them whenever a
  // slot mixes widths.
  slots.forEach((slot, n) => {
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
