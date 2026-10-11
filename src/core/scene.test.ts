import { describe, expect, it } from "vitest";

import { lineBox, type LineItem, type Transform } from "./scene";

const line = (x1: number, y1: number, x2: number, y2: number, strokeWeight = 2): LineItem => ({
  kind: "line",
  name: "Line",
  x1,
  y1,
  x2,
  y2,
  strokeWeight,
  stroke: "#000000",
});

/** Where a point in the box's own coordinates lands on the frame. */
const apply = ([[a, c, tx], [b, d, ty]]: Transform, x: number, y: number): [number, number] => [
  a * x + c * y + tx,
  b * x + d * y + ty,
];

const close = ([x, y]: [number, number], [ex, ey]: [number, number]): void => {
  expect(x).toBeCloseTo(ex, 9);
  expect(y).toBeCloseTo(ey, 9);
};

describe("lineBox", () => {
  it("a horizontal line straddles its y, unrotated", () => {
    expect(lineBox(line(10, 20, 50, 20))).toEqual({
      width: 40,
      height: 2,
      transform: [
        [1, 0, 10],
        [0, 1, 19],
      ],
    });
  });

  it("a vertical line straddles its x, unrotated", () => {
    expect(lineBox(line(30, 50, 30, 10))).toEqual({
      width: 2,
      height: 40,
      transform: [
        [1, 0, 29],
        [0, 1, 10],
      ],
    });
  });

  it("endpoints may come in either order", () => {
    expect(lineBox(line(50, 20, 10, 20))).toEqual(lineBox(line(10, 20, 50, 20)));
  });

  for (const [x1, y1, x2, y2] of [
    [0, 0, 10, 10],
    [0, 10, 10, 0],
    [5, 5, 2, 9],
  ] as const) {
    it(`a diagonal from (${String(x1)}, ${String(y1)}) to (${String(x2)}, ${String(y2)}) is centred on its segment`, () => {
      const box = lineBox(line(x1, y1, x2, y2, 2));
      expect(box.width).toBeCloseTo(Math.hypot(x2 - x1, y2 - y1), 9);
      expect(box.height).toBe(2);

      // The middle of each short edge is an endpoint: square ends, no overhang.
      close(apply(box.transform, 0, box.height / 2), [x1, y1]);
      close(apply(box.transform, box.width, box.height / 2), [x2, y2]);

      // A rotation, not a skew or a scale, so the ink is the box's true size.
      const [[a, c], [b, d]] = box.transform;
      expect(a * a + b * b).toBeCloseTo(1, 9);
      expect(a * c + b * d).toBeCloseTo(0, 9);
      expect(a * d - b * c).toBeCloseTo(1, 9);
    });
  }
});
