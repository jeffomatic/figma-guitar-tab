import { describe, expect, it } from "vitest";

import { analyticMeasure } from "../measure";
import {
  clearance,
  dotDiameter,
  fretboardDefaults,
  fretLabelGap,
  inkColor,
  knockoutFill,
  maxFret,
  minFrets,
  nutStrokeWeight,
  stringLabelGap,
  type FretboardSettings,
} from "../settings";
import { TCF1, TCF2, TCF3, TCF4 } from "./fixtures";
import { fretWindow, layoutFretboard, type FretboardItem, type FretboardScene } from "./layout";
import { parseFretboard } from "./parse";

const scene = (source: string, overrides: Partial<FretboardSettings> = {}): FretboardScene =>
  layoutFretboard(parseFretboard(source), { ...fretboardDefaults, ...overrides }, analyticMeasure);

/** Normalize IEEE noise from the analytic measure's 0.6 before comparing. */
const px = (n: number): number => Math.round(n * 1e6) / 1e6;

type Kind = FretboardItem["kind"];
type ItemOf<K extends Kind> = Extract<FretboardItem, { kind: K }>;

const ofKind = <K extends Kind>(s: FretboardScene, kind: K): ItemOf<K>[] =>
  s.items.filter((item): item is ItemOf<K> => item.kind === kind);

const prefixed = <K extends Kind>(s: FretboardScene, kind: K, prefix: string): ItemOf<K>[] =>
  ofKind(s, kind).filter((item) => item.name.startsWith(prefix));

const boundaries = (s: FretboardScene) =>
  ofKind(s, "line").filter((item) => item.name === "Nut" || item.name.startsWith("Fret Boundary"));
const stringLines = (s: FretboardScene) => prefixed(s, "line", "String ");
const dots = (s: FretboardScene) => prefixed(s, "disc", "Dot ");
const opens = (s: FretboardScene) => prefixed(s, "disc", "Open String ");
const stringLabels = (s: FretboardScene) => prefixed(s, "text", "Label ");
const fretLabels = (s: FretboardScene) => prefixed(s, "text", "Fret Label ");

const centerX = (item: ItemOf<"disc">): number => px(item.x + item.diameter / 2);
const centerY = (item: ItemOf<"disc">): number => px(item.y + item.diameter / 2);

const named = (s: FretboardScene, name: string): FretboardItem => {
  const item = s.items.find((candidate) => candidate.name === name);
  if (!item) throw new Error(`no item named ${name}`);
  return item;
};

// Derived from the spec's formulas, with the literals the spec states asserted
// alongside, so a wrong formula can't agree with a wrong expectation.
const { fontSize, fretGapWidth, stringGap, strokeWeight } = fretboardDefaults;
const charWidth = analyticMeasure("x", fontSize);
const labelColumn = charWidth + stringLabelGap;
const padY = Math.max(dotDiameter, fontSize) / 2 + clearance;
const boardHeight = 5 * stringGap;

describe("fret window", () => {
  // The spec's worked examples, with minFrets = 4.
  it("minFrets is the spec's 4", () => {
    expect(minFrets).toBe(4);
  });

  const cases: [string, number[], boolean, number, number, number, number][] = [
    ["2,3,4,5: lo would be 1 anyway; the nut lands in view", [2, 3, 4, 5], false, 1, 1, 1, 6],
    ["0,2,3 open chord", [2, 3], true, 1, 1, 1, 4],
    ["7 plus a 0: step 3, an open string needs the nut", [7], true, 1, 1, 1, 8],
    ["0 only: step 1, minFrets wide from the nut", [], true, 1, 1, 1, 4],
    ["7,9,10", [7, 9, 10], false, 2, 1, 5, 11],
    ["2,3: step 2 clamps, then step 5 widens", [2, 3], false, 3, 0, 1, 4],
    ["12: step 5 widens a one-fret shape rightward", [12], false, 1, 1, 11, 14],
    ["7,9: a large leadingFrets hits the step 2 clamp", [7, 9], false, 24, 1, 1, 10],
    ["30: step 4 clamps hi, step 5 widens leftward", [30], false, 1, 1, 27, 30],
  ];

  for (const [name, frets, hasOpen, leading, trailing, lo, hi] of cases) {
    it(name, () => {
      expect(fretWindow(frets, hasOpen, leading, trailing)).toEqual({ lo, hi });
    });
  }

  it("large buffers at the top of the neck stop at maxFret", () => {
    expect(fretWindow([30], false, 24, 24)).toEqual({ lo: 6, hi: maxFret });
  });

  it("always lies within [1, maxFret], holds every source fret, and is at least minFrets wide", () => {
    for (let low = 1; low <= maxFret; low++) {
      for (let high = low; high <= Math.min(maxFret, low + 6); high++) {
        for (const hasOpen of [false, true]) {
          for (const [leading, trailing] of [
            [0, 0],
            [1, 1],
            [3, 0],
            [0, 3],
            [24, 24],
          ] as const) {
            const { lo, hi } = fretWindow([low, high], hasOpen, leading, trailing);
            expect(lo).toBeGreaterThanOrEqual(1);
            expect(hi).toBeLessThanOrEqual(maxFret);
            expect(lo).toBeLessThanOrEqual(low);
            expect(hi).toBeGreaterThanOrEqual(high);
            expect(hi - lo + 1).toBeGreaterThanOrEqual(minFrets);
            if (hasOpen) expect(lo).toBe(1);
          }
        }
      }
    }
  });
});

describe("fretboard layout", () => {
  it("the spec's stated constants come out of the formulas", () => {
    expect(px(labelColumn)).toBe(15.2);
    expect(px(padY)).toBe(8);
  });

  it("TC-F1 scale shape", () => {
    const s = scene(TCF1);
    // Window 1-6: seven boundaries, the first of them the nut.
    expect(boundaries(s)).toHaveLength(7);
    expect(boundaries(s)[0]?.name).toBe("Nut");
    expect(boundaries(s)[0]?.strokeWeight).toBe(nutStrokeWeight);
    expect(stringLines(s)).toHaveLength(6);
    expect(dots(s)).toHaveLength(15);
    expect(opens(s)).toHaveLength(0);
    expect(fretLabels(s).map((t) => t.characters)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(stringLabels(s).map((t) => t.characters)).toEqual(["e", "B", "G", "D", "A", "E"]);
  });

  it("TC-F2 open chord", () => {
    const s = scene(TCF2);
    // Window 1-4.
    expect(fretLabels(s).map((t) => t.characters)).toEqual(["1", "2", "3", "4"]);
    expect(dots(s)).toHaveLength(4);
    expect(opens(s).map((d) => d.name)).toEqual(["Open String 2", "Open String 3"]);
    for (const open of opens(s)) expect(centerX(open)).toBe(px(labelColumn));
    expect(stringLabels(s).map((t) => t.characters)).toEqual(["e", "B", "G", "D", "A", "E"]);
  });

  it("TC-F3 source-supplied fretboard labels", () => {
    const s = scene(TCF3);
    expect(stringLabels(s).map((t) => t.characters)).toEqual(["e", "B", "G", "D", "A", "E"]);

    // Labels from the source, not the defaults: proved by a tuning the
    // defaults don't hold, which also widens L and moves everything right.
    const dropD = scene(TCF3.replace("E 3", "Db 3"));
    expect(stringLabels(dropD).at(-1)?.characters).toBe("Db");
    const wideL = analyticMeasure("Db", fontSize) + stringLabelGap;
    expect(px((named(dropD, "Nut") as ItemOf<"line">).x1)).toBe(px(wideL));
    for (const open of opens(dropD)) expect(centerX(open)).toBe(px(wideL));

    // The open discs sit on the nut, and carry both a fill and a stroke:
    // without the fill the nut would run through them, without the stroke
    // they would be invisible.
    expect(opens(s)).toHaveLength(2);
    opens(s).forEach((open, n) => {
      expect(centerX(open)).toBe(px(labelColumn));
      expect(centerY(open)).toBe(px(padY + (n + 2) * stringGap));
      expect(open.diameter).toBe(dotDiameter);
      expect(open.fill).toBe(knockoutFill);
      expect(open.stroke).toBe(inkColor);
      expect(open.strokeWeight).toBe(strokeWeight);
    });
  });

  describe("TC-F4 shifted window, no nut", () => {
    const s = scene(TCF4);

    it("no nut: boundary 0 is an ordinary boundary", () => {
      expect(s.items.some((item) => item.name === "Nut")).toBe(false);
      const first = named(s, "Fret Boundary 0");
      expect(first.kind === "line" && first.strokeWeight).toBe(strokeWeight);
    });

    it("string labels", () => {
      const labels = stringLabels(s);
      expect(labels.map((t) => t.characters)).toEqual(["e", "B", "G", "D", "A", "E"]);
      for (const label of labels) {
        // Right-aligned at L - stringLabelGap.
        expect(px(label.x + analyticMeasure(label.characters, fontSize))).toBe(7.2);
        expect(px(label.x + charWidth)).toBe(px(labelColumn - stringLabelGap));
      }
    });

    it("boundary lines", () => {
      const lines = boundaries(s);
      expect(lines.map((l) => px(l.x1))).toEqual([15.2, 51.2, 87.2, 123.2, 159.2, 195.2, 231.2]);
      expect(lines.map((l) => px(l.x1))).toEqual(
        Array.from({ length: 7 }, (_, j) => px(labelColumn + j * fretGapWidth)),
      );
      for (const line of lines) {
        expect(line.x2).toBe(line.x1);
        // Half a string stroke past the outer strings, so their ends are covered.
        expect([line.y1, line.y2]).toEqual([7.5, 88.5]);
      }
    });

    it("string lines", () => {
      const lines = stringLines(s);
      expect(lines.map((l) => l.y1)).toEqual([8, 24, 40, 56, 72, 88]);
      for (const line of lines) {
        expect(line.y2).toBe(line.y1);
        expect([px(line.x1), px(line.x2)]).toEqual([15.2, 231.2]);
        expect(line.strokeWeight).toBe(strokeWeight);
      }
    });

    it("frame", () => {
      // A full stroke past the last boundary, so its ink isn't clipped.
      expect([px(s.width), s.height]).toEqual([232.2, 106]);
      expect(s.height).toBe(padY + boardHeight + fretLabelGap + fontSize);
    });

    it("dots", () => {
      expect(dots(s)).toHaveLength(15);
      for (const dot of dots(s)) {
        expect(dot.fill).toBe(inkColor);
        expect(dot.diameter).toBe(dotDiameter);
      }
    });

    it("fret labels carry absolute fret numbers, centred under each gap", () => {
      const labels = fretLabels(s);
      expect(labels.map((t) => t.characters)).toEqual(["5", "6", "7", "8", "9", "10"]);
      expect(labels.map((t) => px(t.x + analyticMeasure(t.characters, fontSize) / 2))).toEqual([
        33.2, 69.2, 105.2, 141.2, 177.2, 213.2,
      ]);
      for (const label of labels) expect(label.y).toBe(94);
    });

    it("the leading and trailing buffer frets hold no dots", () => {
      const gapOf = (x: number): number => Math.floor((x - labelColumn) / fretGapWidth) + 5;
      const frets = new Set(dots(s).map((d) => gapOf(centerX(d))));
      expect(frets.has(5)).toBe(false);
      expect(frets.has(10)).toBe(false);
    });

    it("the low E string's dots sit on frets 7 and 9", () => {
      const lowE = dots(s).filter((d) => d.name.startsWith("Dot String 5 "));
      expect(lowE.map((d) => d.name)).toEqual(["Dot String 5 Fret 7", "Dot String 5 Fret 9"]);
      expect(lowE.map(centerX)).toEqual([105.2, 177.2]);
      expect(lowE.map(centerY)).toEqual([88, 88]);
    });

    it("nothing is drawn above y = 2 or below the frame", () => {
      for (const item of s.items) {
        const [top, bottom] =
          item.kind === "line"
            ? [Math.min(item.y1, item.y2), Math.max(item.y1, item.y2)]
            : item.kind === "disc"
              ? [item.y, item.y + item.diameter]
              : [item.y, item.y + item.fontSize];
        expect(top, item.name).toBeGreaterThanOrEqual(2);
        expect(bottom, item.name).toBeLessThanOrEqual(s.height);
      }
    });
  });

  it("the nut appears once leadingFrets reaches it", () => {
    expect(scene(TCF4, { leadingFrets: 4 }).items.some((i) => i.name === "Nut")).toBe(false);
    const reached = scene(TCF4, { leadingFrets: 5 });
    expect(named(reached, "Nut").kind).toBe("line");
  });

  it("the nut covers the full thickness of the outer string lines", () => {
    for (const weight of [1, 3, 8]) {
      const s = scene(TCF2, { strokeWeight: weight });
      const nut = named(s, "Nut") as ItemOf<"line">;
      const lines = stringLines(s);
      const top = Math.min(...lines.map((l) => l.y1)) - weight / 2;
      const bottom = Math.max(...lines.map((l) => l.y1)) + weight / 2;
      expect([nut.y1, nut.y2]).toEqual([top, bottom]);
      for (const line of boundaries(s)) expect([line.y1, line.y2]).toEqual([top, bottom]);
    }
  });

  it("the last boundary's ink stays inside the frame", () => {
    for (const weight of [1, 8]) {
      const s = scene(TCF2, { strokeWeight: weight });
      const last = boundaries(s).at(-1);
      expect(last && last.x1 + weight / 2).toBeLessThan(s.width);
    }
  });

  it("an open disc stays inside the frame on the left", () => {
    for (const open of opens(scene(TCF2))) expect(open.x).toBeGreaterThan(0);
  });

  it("z-order: labels, boundaries, strings, dots, open discs, fret labels", () => {
    const group = (item: FretboardItem): number => {
      if (item.name.startsWith("Label ")) return 0;
      if (item.name === "Nut" || item.name.startsWith("Fret Boundary ")) return 1;
      if (item.name.startsWith("String ")) return 2;
      if (item.name.startsWith("Dot ")) return 3;
      if (item.name.startsWith("Open String ")) return 4;
      return 5;
    };
    const order = scene(TCF2).items.map(group);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });

  it("every dot is centred in its own fret's gap", () => {
    const s = scene(TCF1);
    const parse = parseFretboard(TCF1);
    parse.strings.forEach((string, index) => {
      for (const fret of string.frets) {
        const dot = named(s, `Dot String ${String(index)} Fret ${String(fret)}`) as ItemOf<"disc">;
        expect(centerX(dot)).toBe(px(labelColumn + (fret - 1 + 0.5) * fretGapWidth));
        expect(centerY(dot)).toBe(px(padY + index * stringGap));
      }
    });
  });

  it("supports four and seven strings", () => {
    const bass = scene(["0", "2", "2", "0"].join("\n"));
    expect(stringLabels(bass).map((t) => t.characters)).toEqual(["G", "D", "A", "E"]);
    expect(stringLines(bass)).toHaveLength(4);
    const seven = scene(["3", "3", "0", "0", "2", "3", "3"].join("\n"));
    expect(stringLabels(seven).at(-1)?.characters).toBe("B");
    expect(seven.height).toBe(padY + 6 * stringGap + fretLabelGap + fontSize);
  });
});
