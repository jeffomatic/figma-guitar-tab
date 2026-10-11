// Fretboard geometry: a parse result plus settings plus measurement -> a scene.
//
// As for tablature, the scene is plain data in spec coordinates and the
// renderer makes no layout decisions. The one computation here with real
// logic in it is the fret window; the rest is the spec's formulas.

import type { Measure } from "../measure";
import type { DiscItem, LineItem, TextItem } from "../scene";
import {
  clearance,
  defaultTunings,
  dotDiameter,
  fretLabelGap,
  inkColor,
  knockoutFill,
  maxFret,
  minFrets,
  nutStrokeWeight,
  stringLabelGap,
  type FretboardSettings,
} from "../settings";
import type { FretboardParse } from "./parse";

export type FretboardItem = LineItem | DiscItem | TextItem;

export interface FretboardScene {
  name: string;
  width: number;
  height: number;
  /**
   * In z-order: string labels, fret boundaries (the nut first, when drawn),
   * string lines, dots, open discs, fret labels. An open disc drawn before the
   * nut would be hidden by it.
   */
  items: FretboardItem[];
}

/** The inclusive range of frets drawn. */
export interface FretWindow {
  lo: number;
  hi: number;
}

/**
 * The spec's five steps. Clamps rather than rejects at both ends, so no
 * setting the user can reach produces an error, and the window always lies
 * within `[1, maxFret]` and always holds every source fret.
 *
 * `frets` are the source's fretted positions -- `0` is not a fret and is
 * passed as `hasOpen` instead. `leadingFrets` and `trailingFrets` are whole
 * numbers: the settings clamp rounds them.
 */
export function fretWindow(
  frets: readonly number[],
  hasOpen: boolean,
  leadingFrets: number,
  trailingFrets: number,
): FretWindow {
  // Step 1. With only open strings there is nothing to buffer.
  if (frets.length === 0) return { lo: 1, hi: minFrets };
  let lo = Math.min(...frets) - leadingFrets;
  let hi = Math.max(...frets) + trailingFrets;

  // Step 2: there is no fret below 1 to draw.
  lo = Math.max(lo, 1);
  // Step 3: an open-string marker sits on the nut, so the nut must be drawn.
  if (hasOpen) lo = 1;
  // Step 4: nor any fret past the end of the neck.
  hi = Math.min(hi, maxFret);

  // Step 5: widen a narrow window, rightward first, then leftward.
  while (hi - lo + 1 < minFrets && hi < maxFret) hi++;
  while (hi - lo + 1 < minFrets && lo > 1) lo--;

  return { lo, hi };
}

/**
 * Assumes a diagnostic-free parse: the sandbox checks diagnostics before it
 * renders, and the UI disables rendering while any error stands.
 */
export function layoutFretboard(
  parse: FretboardParse,
  settings: FretboardSettings,
  measure: Measure,
): FretboardScene {
  const { fretGapWidth, stringGap, strokeWeight, fontSize } = settings;
  const { stringCount, strings } = parse;
  const name = "Fretboard Diagram";
  if (stringCount === null) return { name, width: 0, height: 0, items: [] };

  const { lo, hi } = fretWindow(
    strings.flatMap((string) => string.frets),
    strings.some((string) => string.open),
    settings.leadingFrets,
    settings.trailingFrets,
  );
  const fretCount = hi - lo + 1;

  // Substituting the default tuning is a layout concern, not a parsing one: the
  // parse result records only what the source wrote.
  const labels = parse.labels ?? defaultTunings[stringCount];
  const labelWidths = labels.map((label) => measure(label, fontSize));
  // `L`, exactly as in tablature. Never 0, since every string has a label,
  // which is what keeps an open disc centred on the nut inside the frame.
  const labelColumn = Math.max(...labelWidths) + stringLabelGap;

  // Half the tallest thing centred on a string line, plus clearance, so a dot
  // or label on the first string isn't clipped by the frame.
  const padY = Math.max(dotDiameter, fontSize) / 2 + clearance;
  const stringY = (index: number): number => padY + index * stringGap;
  const boardHeight = (labels.length - 1) * stringGap;
  const boundaryX = (j: number): number => labelColumn + j * fretGapWidth;
  const width = boundaryX(fretCount);
  const height = padY + boardHeight + fretLabelGap + fontSize;
  // Fret labels and dots sit in the gap, not on a boundary line, so a label is
  // directly beneath the dots it applies to.
  const gapCenter = (fret: number): number => labelColumn + (fret - lo + 0.5) * fretGapWidth;

  const items: FretboardItem[] = [];

  labels.forEach((label, index) => {
    items.push({
      kind: "text",
      name: `Label ${label}`,
      // Right-aligned to the label column's inner edge.
      x: labelColumn - stringLabelGap - (labelWidths[index] ?? 0),
      y: stringY(index) - fontSize / 2,
      characters: label,
      fontSize,
      fill: inkColor,
    });
  });

  for (let j = 0; j <= fretCount; j++) {
    // Boundary 0 is the nut only when the window starts at the first fret.
    const isNut = j === 0 && lo === 1;
    items.push({
      kind: "line",
      name: isNut ? "Nut" : `Fret Boundary ${String(j)}`,
      x1: boundaryX(j),
      y1: padY,
      x2: boundaryX(j),
      y2: padY + boardHeight,
      strokeWeight: isNut ? nutStrokeWeight : strokeWeight,
      stroke: inkColor,
    });
  }

  labels.forEach((_, index) => {
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
  });

  const disc = (cx: number, cy: number): Pick<DiscItem, "x" | "y" | "diameter"> => ({
    x: cx - dotDiameter / 2,
    y: cy - dotDiameter / 2,
    diameter: dotDiameter,
  });

  strings.forEach((string, index) => {
    for (const fret of string.frets) {
      items.push({
        kind: "disc",
        name: `Dot String ${String(index)} Fret ${String(fret)}`,
        ...disc(gapCenter(fret), stringY(index)),
        fill: inkColor,
        stroke: null,
        strokeWeight: 0,
      });
    }
  });

  strings.forEach((string, index) => {
    if (!string.open) return;
    // On the nut itself: there is no fret gap for an open string to sit in.
    // The fill is what stops the nut and string line running through it.
    items.push({
      kind: "disc",
      name: `Open String ${String(index)}`,
      ...disc(labelColumn, stringY(index)),
      fill: knockoutFill,
      stroke: inkColor,
      strokeWeight,
    });
  });

  for (let fret = lo; fret <= hi; fret++) {
    // The absolute fret number, not a position in the window: in a shifted
    // window those differ, and the diagram would be silently mislabeled.
    const characters = String(fret);
    items.push({
      kind: "text",
      name: `Fret Label ${characters}`,
      x: gapCenter(fret) - measure(characters, fontSize) / 2,
      y: padY + boardHeight + fretLabelGap,
      characters,
      fontSize,
      fill: inkColor,
    });
  }

  return { name, width, height, items };
}
