// Text measurement, injected into layout.
//
// Slot widths and the label column both depend on measured text, so layout
// cannot be computed from a parse result and settings alone. Taking `measure`
// as a parameter keeps layout pure and its output deterministic in tests.

/** Width of `text` rendered at `fontSize`, in Figma pixels. */
export type Measure = (text: string, fontSize: number) => number;

/**
 * Stub advance width per character, as a fraction of font size.
 *
 * NOT a font metric, and nothing rendered depends on it: the sandbox always
 * measures with Figma, so a wrong value here would make test fixtures disagree
 * with reality rather than make the plugin draw incorrectly. 0.6 is chosen for
 * being round and close enough to real monospace metrics that fixture numbers
 * stay plausible when read as sanity checks.
 *
 * Don't "correct" it against Roboto Mono's real advance: that would invalidate
 * every fixture and buy nothing.
 */
const advanceRatio = 0.6;

/**
 * Analytic monospace measurement, for tests only.
 *
 * A **test double, not a fallback** -- the plugin never renders with it. In the
 * sandbox, `measure` sets characters on one reusable hidden TextNode and reads
 * its width, which is authoritative for any family including the proportional
 * Roboto fallback.
 */
export const analyticMeasure: Measure = (text, fontSize) => text.length * fontSize * advanceRatio;
