import { describe, expect, it } from "vitest";

import { analyticMeasure } from "../measure";
import {
  clearance,
  inkColor,
  stringLabelGap,
  tablatureDefaults,
  tablatureRanges,
} from "../settings";
import { TC1, TC10, TC11, TC2, TC3, TC4, TC5, TC6, TC7, TC9 } from "./fixtures";
import { layoutTablature, type RowScene, type SceneItem, type TablatureScene } from "./layout";
import { parseTablature } from "./parse";

const scene = (source: string, overrides: Partial<typeof tablatureDefaults> = {}): TablatureScene =>
  layoutTablature(parseTablature(source), { ...tablatureDefaults, ...overrides }, analyticMeasure);

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

const row = (s: TablatureScene, index: number): RowScene => at(s.rows, index);

/**
 * Normalize IEEE noise before comparing a scalar.
 *
 * `measure` multiplies by 0.6, which is not representable, so a one-character
 * cell at size 12 is 7.199999999999999 rather than 7.2. Sums happen to land
 * exact more often than not, but not reliably. Equivalence cases compare raw
 * values instead -- identical noise on both sides.
 */
const px = (n: number): number => Math.round(n * 1e6) / 1e6;

const kinds = (r: RowScene, kind: SceneItem["kind"]): SceneItem[] =>
  r.items.filter((item) => item.kind === kind);

/** Measure breaks are lines too, so the two have to be told apart by name. */
const stringLines = (r: RowScene): SceneItem[] =>
  kinds(r, "line").filter((item) => item.name.startsWith("String "));
const breakLines = (r: RowScene): SceneItem[] =>
  kinds(r, "line").filter((item) => item.name.startsWith("Measure Break "));

/** One string's segments as `[x1, x2]`, left to right, normalized. */
const segments = (r: RowScene, index: number): [number, number][] =>
  stringLines(r)
    .filter((item) => item.name.startsWith(`String ${String(index)} Segment `))
    .map((item) => (item.kind === "line" ? [px(item.x1), px(item.x2)] : [0, 0]));

/** Every string's segments, in string order. */
const allSegments = (r: RowScene, strings = 6): [number, number][][] =>
  Array.from({ length: strings }, (_, index) => segments(r, index));

const named = (r: RowScene, name: string): SceneItem => {
  const item = r.items.find((candidate) => candidate.name === name);
  if (!item) throw new Error(`no item named ${name}`);
  return item;
};

// Derived from the spec's formulas rather than transcribed, so a change to a
// default moves these with it. The literals the spec states are asserted
// alongside, so a wrong formula can't agree with a wrong expectation.
const { fontSize, noteGap, stringGap, strokeWeight } = tablatureDefaults;
const charWidth = analyticMeasure("x", fontSize);
const labelColumn = charWidth + stringLabelGap;
const padY = fontSize / 2 + clearance;
// The opening measure break sits at the label column; the first slot is a
// full gap past it.
const openX = labelColumn;
const firstSlotX = openX + noteGap;

describe("tablature layout", () => {
  it("the spec's stated constants come out of the formulas", () => {
    expect(px(labelColumn)).toBe(15.2);
    expect(px(padY)).toBe(8);
    expect(px(firstSlotX)).toBe(31.2);
    expect(px(charWidth)).toBe(7.2);
  });

  it("TC-7 slot advances and positions accumulate", () => {
    const r = row(scene(TC7), 0);
    const texts = kinds(r, "text").filter((item) => item.name.startsWith("Slot "));

    // The spec's W / A / X table: {10,5,3} then {12b14} then {7,0}.
    const slotX = [0, 1, 2].map((n) => {
      const item = named(r, `Slot ${String(n)} String 0`);
      if (item.kind !== "text") throw new Error("expected text");
      return px(item.x);
    });
    expect(slotX).toEqual([31.2, 61.6, 113.6]);

    // Each advance is its own widest cell plus noteGap -- nothing is a
    // multiple of anything, and the gap is the same both times.
    expect(px(slotX[1] ?? 0)).toBe(px(firstSlotX + 14.4 + noteGap));
    expect(px(slotX[2] ?? 0)).toBe(px((slotX[1] ?? 0) + 36 + noteGap));

    // Row width = X(N-1) + W(N-1) + noteGap / 2.
    expect(px(r.width)).toBe(137.8);
    // The closing break, plus a whole stroke: half is what the ink occupies,
    // but that lands exactly on the clip boundary and gets cut.
    expect(px(r.width)).toBe(px((slotX[2] ?? 0) + charWidth + noteGap + strokeWeight));

    expect(texts).toHaveLength(6);
  });

  it("TC-8 string gaps are cut around each cell, not each slot", () => {
    const r = row(scene(TC7), 0);
    // No knockouts: the line is simply absent where a cell sits.
    expect(kinds(r, "rect")).toEqual([]);

    // Each gap spans the cell's own width plus clearance on each side.
    expect(allSegments(r)).toEqual([
      // `10`, `12b14`, `7`.
      [
        [15.2, 29.2],
        [47.6, 59.6],
        [99.6, 111.6],
        [122.8, 136.8],
      ],
      // `5` and `0`, with nothing in slot 1: the line runs straight across it,
      // even though slot 1 is 36px wide for `12b14` on string 0.
      [
        [15.2, 29.2],
        [40.4, 111.6],
        [122.8, 136.8],
      ],
      // Strings 2, 3 and 4 play nothing, so each is one segment spanning the row.
      [[15.2, 136.8]],
      [[15.2, 136.8]],
      [[15.2, 136.8]],
      // `3`.
      [
        [15.2, 29.2],
        [40.4, 136.8],
      ],
    ]);

    // Each gap is sized from its own cell: `10` cuts 18.4 where `5` cuts 11.2.
    const gapAfter = (index: number): number => {
      const [first, second] = segments(r, index);
      return px((second?.[0] ?? 0) - (first?.[1] ?? 0));
    };
    expect(gapAfter(0)).toBe(18.4);
    expect(gapAfter(1)).toBe(11.2);

    // The segment between consecutive gaps is noteGap less the clearance each
    // gap adds: the shortest a segment gets at the defaults.
    const between = segments(r, 0)[2];
    expect(px((between?.[1] ?? 0) - (between?.[0] ?? 0))).toBe(px(noteGap - 2 * clearance));
  });

  it("TC-7 string segments sit on their string and span the row together", () => {
    const r = row(scene(TC7), 0);
    for (let index = 0; index < 6; index++) {
      const lines = stringLines(r).filter((item) =>
        item.name.startsWith(`String ${String(index)} Segment `),
      );
      expect(lines.map((line) => line.name)).toEqual(
        lines.map((_, k) => `String ${String(index)} Segment ${String(k)}`),
      );
      for (const line of lines) {
        if (line.kind !== "line") throw new Error("expected line");
        expect(px(line.y1)).toBe(px(line.y2));
        expect(px(line.y1)).toBe(px(padY + index * stringGap));
        expect(line.strokeWeight).toBe(strokeWeight);
        expect(line.stroke).toBe(inkColor);
      }
      const spans = segments(r, index);
      expect(spans[0]?.[0]).toBe(15.2);
      expect(spans.at(-1)?.[1]).toBe(136.8);
    }
  });

  it("TC-1 multiple rows, and the two rows are identical", () => {
    const s = scene(TC1);
    expect(s.rows).toHaveLength(2);
    expect(s.rowGap).toBe(tablatureDefaults.rowGap);

    // Row coordinates are row-local, so the second row is not offset.
    expect(row(s, 0).items).toEqual(row(s, 1).items);

    const r = row(s, 0);
    // Five cells per string cut each line into six segments.
    expect(stringLines(r)).toHaveLength(36);
    expect(kinds(r, "rect")).toEqual([]);
    expect(r.items.filter((i) => i.name.startsWith("Label "))).toHaveLength(6);
    expect(r.items.filter((i) => i.name.startsWith("Slot "))).toHaveLength(30);

    expect(px(r.width)).toBe(148.2);
    expect(px(r.height)).toBe(96);
    expect(px(r.height)).toBe(px(2 * padY + 5 * stringGap));

    // Every segment ends where a gap begins, and no two gaps touch.
    expect(segments(r, 0).map(([x1]) => x1)).toEqual([15.2, 40.4, 63.6, 86.8, 110, 133.2]);
    expect(segments(r, 0).map(([, x2]) => x2)).toEqual([29.2, 52.4, 75.6, 98.8, 122, 147.2]);
  });

  it("TC-1 defaults the labels to standard tuning, right-aligned", () => {
    const r = row(scene(TC1), 0);
    const labels = r.items.filter((item) => item.name.startsWith("Label "));
    expect(labels.map((item) => (item.kind === "text" ? item.characters : ""))).toEqual([
      "e",
      "B",
      "G",
      "D",
      "A",
      "E",
    ]);
    // Right edge sits at L - stringLabelGap for every label.
    for (const label of labels) {
      if (label.kind !== "text") throw new Error("expected text");
      expect(px(label.x + analyticMeasure(label.characters, fontSize))).toBe(
        px(labelColumn - stringLabelGap),
      );
    }
  });

  it("TC-3 a long cell widens its slot", () => {
    const r = row(scene(TC3), 0);
    const first = named(r, "Slot 0 String 1");
    const second = named(r, "Slot 1 String 1");
    if (first.kind !== "text" || second.kind !== "text") throw new Error("expected text");

    // `2h3p2` is 36px wide, so its slot advances by 36 + noteGap and the next
    // slot starts a full gap clear of the text rather than hard against it.
    expect(px(second.x)).toBe(px(first.x + 36 + noteGap));
    expect(px(second.x - (first.x + 36))).toBe(px(noteGap));

    // Both strings' cells in slot 0 share one left edge.
    const sameSlot = named(r, "Slot 0 String 0");
    if (sameSlot.kind !== "text") throw new Error("expected text");
    expect(px(sameSlot.x)).toBe(px(first.x));
  });

  it("TC-5 a silent string has no gap in that slot", () => {
    const r = row(scene(TC5), 0);
    const slot1 = named(r, "Slot 1 String 3");
    if (slot1.kind !== "text") throw new Error("expected text");

    // The `2` is alone in slot 1, so only its string is cut there.
    const cutAt = (spans: [number, number][]): boolean =>
      spans.every(([x1, x2]) => x2 <= px(slot1.x) || x1 > px(slot1.x));
    expect(allSegments(r).map(cutAt)).toEqual([false, false, false, true, false, false]);
  });

  it("TC-9 muted notes lay out exactly like fret numbers", () => {
    const r = row(scene(TC9), 0);
    const first = named(r, "Slot 0 String 0");
    const second = named(r, "Slot 1 String 0");
    if (first.kind !== "text" || second.kind !== "text") throw new Error("expected text");

    expect(px(first.x)).toBe(31.2);
    expect(px(second.x)).toBe(54.4);
    expect(px(r.width)).toBe(78.6);

    // Every cell is one character, so every gap is 11.2 wide.
    for (const spans of allSegments(r)) {
      for (let k = 0; k < spans.length - 1; k++) {
        expect(px((spans[k + 1]?.[0] ?? 0) - (spans[k]?.[1] ?? 0))).toBe(11.2);
      }
    }
  });

  it("TC-2 hyphenspace collapses to identical geometry", () => {
    const s = scene(TC2);
    // Everything but the row's own name, which is an index and so differs.
    const geometry = (r: RowScene): unknown => ({
      items: r.items,
      width: r.width,
      height: r.height,
    });
    expect(geometry(row(s, 0))).toEqual(geometry(row(s, 1)));
  });

  it("TC-6 lays out identically to TC-4", () => {
    expect(scene(TC6)).toEqual(scene(TC4));
  });

  it("TC-4 reads its labels from the source", () => {
    const r = row(scene(TC4), 0);
    const labels = r.items
      .filter((item) => item.name.startsWith("Label "))
      .map((item) => (item.kind === "text" ? item.characters : ""));
    expect(labels).toEqual(["e", "B", "G", "D", "A", "E"]);
  });

  it("every gap between consecutive slots is exactly noteGap", () => {
    // The regression test for the formula this replaced, now walking slots
    // rather than cells: the advance used to be max(slotPitch, W + cellGap), so
    // the whitespace *shrank* as cells got wider -- 16.8px after one character,
    // 4px after three. Walking slots rather than cells is also what makes a
    // measure break covered: a break is a zero-width slot, so it must sit one
    // gap from its neighbours on each side rather than two.
    for (const [name, source] of Object.entries({ TC1, TC2, TC3, TC5, TC7, TC9, TC10, TC11 })) {
      for (const r of scene(source).rows) {
        // Each slot as (left edge, right edge). A break is a point.
        const breaks = breakLines(r).map((item) => (item.kind === "line" ? item.x1 : 0));
        const notes = new Map<number, number>();
        for (const item of r.items) {
          if (item.kind !== "text" || !item.name.startsWith("Slot ")) continue;
          const right = item.x + analyticMeasure(item.characters, fontSize);
          notes.set(item.x, Math.max(notes.get(item.x) ?? 0, right));
        }

        const edges = [
          ...breaks.map((x) => [x, x] as const),
          ...[...notes].map(([left, right]) => [left, right] as const),
        ].sort((a, b) => a[0] - b[0]);

        for (let i = 0; i < edges.length - 1; i++) {
          const gap = (edges[i + 1]?.[0] ?? 0) - (edges[i]?.[1] ?? 0);
          expect(px(gap), `${name} gap after slot ${String(i)}`).toBe(px(noteGap));
        }
      }
    }
  });

  it("TC-10 brackets the row and spaces an interior break evenly", () => {
    const r = row(scene(TC10), 0);
    const xs = breakLines(r).map((item) => (item.kind === "line" ? px(item.x1) : 0));
    // Opening, the written interior break, closing. The written edge breaks
    // were absorbed -- the row draws them anyway, so there are three, not five.
    expect(xs).toEqual([15.2, 54.4, 93.6]);
    expect(px(r.width)).toBe(94.6);

    // Each break joins the top string's line to the bottom's, overshooting
    // each by half a stroke so the corners have no uninked notch.
    for (const line of breakLines(r)) {
      if (line.kind !== "line") throw new Error("expected line");
      expect([px(line.y1), px(line.y2)]).toEqual([7.5, 88.5]);
      expect([px(line.y1), px(line.y2)]).toEqual([
        px(padY - strokeWeight / 2),
        px(padY + 5 * stringGap + strokeWeight / 2),
      ]);
      expect(line.strokeWeight).toBe(strokeWeight);
    }
  });

  it("TC-11 draws a row of empty measures with no notes at all", () => {
    const r = row(scene(TC11), 0);
    expect(r.items.filter((item) => item.name.startsWith("Slot "))).toEqual([]);
    expect(kinds(r, "rect")).toEqual([]);
    expect(breakLines(r).map((item) => (item.kind === "line" ? px(item.x1) : 0))).toEqual([
      15.2, 31.2, 47.2,
    ]);
    expect(px(r.width)).toBe(48.2);
  });

  it("a break's ink stays inside the frame it is clipped by", () => {
    // The bug this guards: half a stroke of allowance is exactly enough in
    // arithmetic and not enough in practice, because the ink then sits on the
    // clip boundary. Checked at the heaviest stroke, where it is visible.
    for (const weight of [tablatureDefaults.strokeWeight, 8]) {
      for (const source of [TC1, TC7, TC10, TC11]) {
        const r = row(scene(source, { strokeWeight: weight }), 0);
        for (const line of breakLines(r)) {
          if (line.kind !== "line") throw new Error("expected line");
          expect(px(line.x1 + weight / 2)).toBeLessThan(px(r.width));
          expect(px(line.x1 - weight / 2)).toBeGreaterThan(0);
          // Vertically too: the overshoot must stay inside padY's slack.
          expect(px(line.y1)).toBeGreaterThan(0);
          expect(px(line.y2)).toBeLessThan(px(r.height));
        }
      }
    }
  });

  it("a row with no written breaks still gets exactly two", () => {
    const r = row(scene(TC1), 0);
    const xs = breakLines(r).map((item) => (item.kind === "line" ? px(item.x1) : 0));
    expect(xs).toEqual([15.2, 147.2]);
    // Each string's segments run between them.
    for (const spans of allSegments(r)) {
      expect([spans[0]?.[0], spans.at(-1)?.[1]]).toEqual([15.2, 147.2]);
    }
  });

  it("rowGap never reaches a coordinate", () => {
    const normal = scene(TC1);
    const wild = scene(TC1, { rowGap: 9999 });
    expect(wild.rows).toEqual(normal.rows);
    expect(wild.rowGap).toBe(9999);
  });

  it("z-order is labels, string segments, measure breaks, text", () => {
    const r = row(scene(TC7), 0);
    const order = r.items.map((item) =>
      item.name.startsWith("Label ")
        ? "label"
        : item.name.startsWith("String ")
          ? "line"
          : item.name.startsWith("Measure Break ")
            ? "break"
            : "text",
    );
    type Group = (typeof order)[number];
    const firstIndex = (group: Group): number => order.indexOf(group);
    const lastIndex = (group: Group): number => order.lastIndexOf(group);
    expect(lastIndex("label")).toBeLessThan(firstIndex("line"));
    expect(lastIndex("line")).toBeLessThan(firstIndex("break"));
    expect(lastIndex("break")).toBeLessThan(firstIndex("text"));
  });

  it("gaps that touch merge, leaving no empty segment", () => {
    // At noteGap's minimum, neighbouring gaps meet exactly: the segment between
    // two one-character cells would be noteGap - 2 x clearance = 0 long.
    expect(tablatureRanges.noteGap.min).toBe(2 * clearance);
    const r = row(scene(TC1, { noteGap: tablatureRanges.noteGap.min }), 0);

    // So each string is only the line before the first cell and after the last,
    // and the stretch from the last gap to each break is noteGap - clearance.
    for (const spans of allSegments(r)) {
      expect(spans).toHaveLength(2);
      for (const [x1, x2] of spans) {
        expect(px(x2 - x1)).toBe(px(tablatureRanges.noteGap.min - clearance));
      }
    }
  });

  it("no segment runs under a cell, in any case", () => {
    const sources = { TC1, TC2, TC3, TC4, TC5, TC6, TC7, TC9, TC10, TC11 };
    for (const [name, source] of Object.entries(sources)) {
      for (const noteGapValue of [tablatureRanges.noteGap.min, noteGap]) {
        for (const r of scene(source, { noteGap: noteGapValue }).rows) {
          for (const line of stringLines(r)) {
            if (line.kind !== "line") throw new Error("expected line");
            expect(px(line.x2 - line.x1), `${name} ${line.name}`).toBeGreaterThan(0);

            const index = /^String (\d+) /.exec(line.name)?.[1] ?? "";
            for (const item of r.items) {
              if (item.kind !== "text" || !item.name.endsWith(` String ${index}`)) continue;
              if (!item.name.startsWith("Slot ")) continue;
              const left = item.x - clearance;
              const right = item.x + analyticMeasure(item.characters, fontSize) + clearance;
              const overlap = Math.min(line.x2, right) - Math.max(line.x1, left);
              expect(px(overlap), `${name} ${line.name} under ${item.name}`).toBeLessThanOrEqual(0);
            }
          }
        }
      }
    }
  });

  it("a parse with no supported string count yields no rows", () => {
    expect(scene("-1-\n-1-\n-1-\n-1-\n-1-").rows).toEqual([]);
  });
});
