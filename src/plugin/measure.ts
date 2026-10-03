// The Figma-backed `Measure` that layout actually renders with.
//
// `src/core/measure.ts`'s analytic implementation is a test double; this is the
// real one, and it is authoritative for any family including the proportional
// Roboto fallback.

import type { Measure } from "../core/measure";
import { applyTextStyle } from "./font";

export interface Measurer {
  measure: Measure;
  /** Remove the hidden node. Always call this, including on a failed render. */
  dispose: () => void;
}

/**
 * One reusable hidden text node: set characters, read width.
 *
 * Results are memoized because a six-string row measures the same handful of
 * one-character strings dozens of times.
 */
export function createMeasurer(font: FontName): Measurer {
  // Created nodes are appended to figma.currentPage automatically.
  const node = figma.createText();
  node.name = "Measuring";
  node.visible = false;

  const widths = new Map<string, number>();
  let appliedFontSize = -1;

  const measure: Measure = (text, fontSize) => {
    const key = `${String(fontSize)}:${text}`;
    const cached = widths.get(key);
    if (cached !== undefined) return cached;

    if (fontSize !== appliedFontSize) {
      applyTextStyle(node, font, fontSize);
      appliedFontSize = fontSize;
    }
    node.characters = text;

    const width = node.width;
    widths.set(key, width);
    return width;
  };

  return { measure, dispose: () => node.remove() };
}
