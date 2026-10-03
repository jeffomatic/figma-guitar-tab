// Font resolution and text-node creation, shared by both modes.
//
// The font is resolved ONCE per render and threaded through everything that
// touches text. Measuring with one family while drawing with another would
// compute every slot width from a font that isn't on screen -- cells would
// collide, and no test anywhere would fail, because `src/plugin/` is outside
// the test boundary by design.

import { fontFamily } from "../core/settings";

const regular = (family: string): FontName => ({ family, style: "Regular" });

/**
 * Roboto Mono, falling back to Roboto -- which is always available in Figma.
 *
 * Call once per render and pass the result to both the measurer and the
 * renderer. Must resolve before any text node is created or any `characters`
 * is assigned.
 */
export async function resolveFont(): Promise<FontName> {
  const preferred = regular(fontFamily);
  try {
    await figma.loadFontAsync(preferred);
    return preferred;
  } catch {
    const fallback = regular("Roboto");
    await figma.loadFontAsync(fallback);
    return fallback;
  }
}

/**
 * Configure a text node the way every formula assumes.
 *
 * `lineHeight` is pinned to `fontSize` and auto-resize is on both axes, which
 * makes the node exactly `fontSize` tall. Figma's default auto line height is
 * roughly 1.2x and varies by family, so without this a node's height is a font
 * metric -- and `padY` and the row-height formula in `src/core/` would both be
 * wrong while every one of their tests still passed.
 */
export function applyTextStyle(node: TextNode, font: FontName, fontSize: number): void {
  node.fontName = font;
  node.fontSize = fontSize;
  node.lineHeight = { value: fontSize, unit: "PIXELS" };
  node.textAutoResize = "WIDTH_AND_HEIGHT";
}
