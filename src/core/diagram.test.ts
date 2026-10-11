import { describe, expect, it } from "vitest";

import { checkDiagram, hasErrors } from "./diagram";
import { TCF2, TCF4 } from "./fretboard/fixtures";
import { fretboardDefaults, fretboardRanges, tablatureDefaults } from "./settings";
import { TC1 } from "./tablature/fixtures";

describe("checkDiagram", () => {
  it("checks tablature with the tablature parser and clamp", () => {
    const checked = checkDiagram({ mode: "tablature", source: TC1, settings: tablatureDefaults });
    expect(checked.mode).toBe("tablature");
    expect(checked.diagnostics).toEqual([]);
    expect(checked.settings).toEqual(tablatureDefaults);
  });

  it("checks a fretboard with the fretboard parser and clamp", () => {
    const checked = checkDiagram({ mode: "fretboard", source: TCF4, settings: fretboardDefaults });
    expect(checked.mode).toBe("fretboard");
    expect(checked.diagnostics).toEqual([]);
    expect(checked.mode === "fretboard" && checked.parse.stringCount).toBe(6);
  });

  it("gives each mode's own verdict on the same source", () => {
    // A chord shape is not tablature: no playable region starts with `-`.
    const asTablature = checkDiagram({
      mode: "tablature",
      source: TCF2,
      settings: tablatureDefaults,
    });
    const asFretboard = checkDiagram({
      mode: "fretboard",
      source: TCF2,
      settings: fretboardDefaults,
    });
    expect(hasErrors(asTablature.diagnostics)).toBe(true);
    expect(hasErrors(asFretboard.diagnostics)).toBe(false);
  });

  it("lists parse diagnostics before setting diagnostics", () => {
    const checked = checkDiagram({
      mode: "fretboard",
      source: "",
      settings: { ...fretboardDefaults, leadingFrets: 99 },
    });
    expect(checked.diagnostics.map((error) => error.code)).toEqual([
      "empty-source",
      "setting-out-of-range",
    ]);
  });

  it("returns clamped settings", () => {
    const checked = checkDiagram({
      mode: "fretboard",
      source: TCF2,
      settings: { ...fretboardDefaults, trailingFrets: 99 },
    });
    expect(checked.mode === "fretboard" && checked.settings.trailingFrets).toBe(
      fretboardRanges.trailingFrets.max,
    );
    expect(hasErrors(checked.diagnostics)).toBe(false);
  });
});
