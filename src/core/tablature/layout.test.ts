import { describe, expect, it } from "vitest";

import { analyticMeasure } from "../measure";
import { clearance, inkColor, knockoutFill, stringLabelGap, tablatureDefaults } from "../settings";
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
const knockoutHeight = strokeWeight + 2 * clearance;

describe("tablature layout", () => {
  it("the spec's stated constants come out of the formulas", () => {
    expect(px(labelColumn)).toBe(15.2);
    expect(px(padY)).toBe(8);
    expect(px(firstSlotX)).toBe(31.2);
    expect(px(knockoutHeight)).toBe(5);
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

  it("TC-8 knockouts are sized from each cell, not from its slot", () => {
    const r = row(scene(TC7), 0);
    const rects = kinds(r, "rect");
    expect(rects).toHaveLength(6);

    const expected = [
      // name, x, width, y -- strings 0-based, as everywhere else.
      ["Knockout Slot 0 String 0", 29.2, 18.4, 5.5],
      ["Knockout Slot 1 String 0", 59.6, 40, 5.5],
      ["Knockout Slot 2 String 0", 111.6, 11.2, 5.5],
      ["Knockout Slot 0 String 1", 29.2, 11.2, 21.5],
      ["Knockout Slot 2 String 1", 111.6, 11.2, 21.5],
      ["Knockout Slot 0 String 5", 29.2, 11.2, 85.5],
    ] as const;

    for (const [name, x, width, y] of expected) {
      const item = named(r, name);
      if (item.kind !== "rect") throw new Error("expected rect");
      expect([name, px(item.x), px(item.width), px(item.y)]).toEqual([name, x, width, y]);
      expect(px(item.height)).toBe(5);
      expect(item.fill).toBe(knockoutFill);
    }

    // Strings 2, 3 and 4 play nothing, so they have no rectangles at all --
    // their lines are uninterrupted by construction, not by a complement.
    for (const index of [2, 3, 4]) {
      expect(rects.filter((item) => item.name.endsWith(`String ${String(index)}`))).toEqual([]);
    }

    // String 1 has no cell in slot 1, so nothing covers its line there, even
    // though slot 1 is 40px wide for `12b14` on string 0.
    expect(rects.some((item) => item.name === "Knockout Slot 1 String 1")).toBe(false);

    // Each is sized from its own cell: `10` is 18.4 where `5` is 11.2.
    const wide = named(r, "Knockout Slot 0 String 0");
    const narrow = named(r, "Knockout Slot 0 String 1");
    if (wide.kind !== "rect" || narrow.kind !== "rect") throw new Error("expected rects");
    expect(px(wide.width)).toBeGreaterThan(px(narrow.width));

    // Consecutive knockouts on one string never overlap, and sit exactly
    // noteGap apart less the clearance each one adds. Overlap is only reachable
    // if noteGap drops below 2 x clearance, which its range forbids -- and the
    // renderer would cope anyway, since rectangles are independent.
    const bend = named(r, "Knockout Slot 1 String 0");
    const seven = named(r, "Knockout Slot 2 String 0");
    if (bend.kind !== "rect" || seven.kind !== "rect") throw new Error("expected rects");
    expect(px(seven.x - (bend.x + bend.width))).toBe(px(noteGap - 2 * clearance));
  });

  it("TC-7 string lines are single nodes spanning the row", () => {
    const r = row(scene(TC7), 0);
    const lines = stringLines(r);
    expect(lines).toHaveLength(6);

    for (const [index, line] of lines.entries()) {
      if (line.kind !== "line") throw new Error("expected line");
      expect(line.name).toBe(`String ${String(index)}`);
      expect([px(line.x1), px(line.x2)]).toEqual([15.2, 136.8]);
      expect(px(line.y1)).toBe(px(line.y2));
      expect(px(line.y1)).toBe(px(padY + index * stringGap));
      expect(line.strokeWeight).toBe(strokeWeight);
      expect(line.stroke).toBe(inkColor);
    }
  });

  it("TC-1 multiple rows, and the two rows are identical", () => {
    const s = scene(TC1);
    expect(s.rows).toHaveLength(2);
    expect(s.rowGap).toBe(tablatureDefaults.rowGap);

    // Row coordinates are row-local, so the second row is not offset.
    expect(row(s, 0).items).toEqual(row(s, 1).items);

    const r = row(s, 0);
    expect(stringLines(r)).toHaveLength(6);
    expect(kinds(r, "rect")).toHaveLength(30);
    expect(r.items.filter((i) => i.name.startsWith("Label "))).toHaveLength(6);
    expect(r.items.filter((i) => i.name.startsWith("Slot "))).toHaveLength(30);

    expect(px(r.width)).toBe(148.2);
    expect(px(r.height)).toBe(96);
    expect(px(r.height)).toBe(px(2 * padY + 5 * stringGap));

    // Five knockouts per string, tiling the line without touching.
    const xs = kinds(r, "rect")
      .filter((item) => item.name.endsWith("String 0"))
      .map((item) => (item.kind === "rect" ? px(item.x) : 0));
    expect(xs).toEqual([29.2, 52.4, 75.6, 98.8, 122]);
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

  it("TC-5 a silent string produces no knockout in that slot", () => {
    const r = row(scene(TC5), 0);
    expect(kinds(r, "rect")).toHaveLength(5);
    // The `2` is alone in slot 1.
    expect(
      kinds(r, "rect").filter((item) => item.name.startsWith("Knockout Slot 1 ")),
    ).toHaveLength(1);
  });

  it("TC-9 muted notes lay out exactly like fret numbers", () => {
    const r = row(scene(TC9), 0);
    const first = named(r, "Slot 0 String 0");
    const second = named(r, "Slot 1 String 0");
    if (first.kind !== "text" || second.kind !== "text") throw new Error("expected text");

    expect(px(first.x)).toBe(31.2);
    expect(px(second.x)).toBe(54.4);
    expect(px(r.width)).toBe(78.6);

    // Every cell is one character, so every knockout is 11.2 x 5.
    for (const rect of kinds(r, "rect")) {
      if (rect.kind !== "rect") throw new Error("expected rect");
      expect([px(rect.width), px(rect.height)]).toEqual([11.2, 5]);
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
    // The string lines run between them.
    for (const line of stringLines(r)) {
      if (line.kind !== "line") throw new Error("expected line");
      expect([px(line.x1), px(line.x2)]).toEqual([15.2, 147.2]);
    }
  });

  it("rowGap never reaches a coordinate", () => {
    const normal = scene(TC1);
    const wild = scene(TC1, { rowGap: 9999 });
    expect(wild.rows).toEqual(normal.rows);
    expect(wild.rowGap).toBe(9999);
  });

  it("z-order is labels, string lines, measure breaks, knockouts, text", () => {
    const r = row(scene(TC7), 0);
    const order = r.items.map((item) =>
      item.name.startsWith("Label ")
        ? "label"
        : item.name.startsWith("String ")
          ? "line"
          : item.name.startsWith("Measure Break ")
            ? "break"
            : item.name.startsWith("Knockout ")
              ? "knockout"
              : "text",
    );
    type Group = (typeof order)[number];
    const firstIndex = (group: Group): number => order.indexOf(group);
    const lastIndex = (group: Group): number => order.lastIndexOf(group);
    expect(lastIndex("label")).toBeLessThan(firstIndex("line"));
    expect(lastIndex("line")).toBeLessThan(firstIndex("break"));
    expect(lastIndex("break")).toBeLessThan(firstIndex("knockout"));
    expect(lastIndex("knockout")).toBeLessThan(firstIndex("text"));
  });

  it("a parse with no supported string count yields no rows", () => {
    expect(scene("-1-\n-1-\n-1-\n-1-\n-1-").rows).toEqual([]);
  });
});
