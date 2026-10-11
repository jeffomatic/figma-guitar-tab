// Checking a diagram of either mode: its parser plus its settings clamp.
//
// Both halves call this -- the UI on every keystroke for diagnostics, the
// sandbox as the authority before it renders -- so neither can dispatch on the
// mode differently from the other. Layout is deliberately not in here: the UI
// never runs it.

import type { ParseError } from "./diagnostics";
import { parseFretboard, type FretboardParse } from "./fretboard/parse";
import type { Diagram } from "./protocol";
import {
  clampFretboardSettings,
  clampTablatureSettings,
  type FretboardSettings,
  type TablatureSettings,
} from "./settings";
import { parseTablature, type TablatureParse } from "./tablature/parse";

export type CheckedDiagram =
  | {
      mode: "tablature";
      parse: TablatureParse;
      settings: TablatureSettings;
      diagnostics: ParseError[];
    }
  | {
      mode: "fretboard";
      parse: FretboardParse;
      settings: FretboardSettings;
      diagnostics: ParseError[];
    };

/** Parse diagnostics first, then setting diagnostics, as both halves list them. */
export function checkDiagram(diagram: Diagram): CheckedDiagram {
  switch (diagram.mode) {
    case "tablature": {
      const parse = parseTablature(diagram.source);
      const { settings, diagnostics } = clampTablatureSettings(diagram.settings);
      return {
        mode: "tablature",
        parse,
        settings,
        diagnostics: [...parse.diagnostics, ...diagnostics],
      };
    }
    case "fretboard": {
      const parse = parseFretboard(diagram.source);
      const { settings, diagnostics } = clampFretboardSettings(diagram.settings);
      return {
        mode: "fretboard",
        parse,
        settings,
        diagnostics: [...parse.diagnostics, ...diagnostics],
      };
    }
  }
}

/** Whether a checked diagram may be rendered. */
export function hasErrors(diagnostics: readonly ParseError[]): boolean {
  return diagnostics.some((error) => error.severity === "error");
}
