// The geometry of the charts, as pure functions: scales, axes and the stacking of bands. The SVG
// components only draw what these return, so the part that can be wrong is the part that is tested.

/** The smallest of 1, 2, 5 or 10 times a power of ten that is at least `value` (1 for anything not above 0). */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/**
 * A y axis for values from 0 to `maxValue`: round ticks and a top that is a tick, so the highest
 * value is never on the very edge. The top is never below one step, so an empty chart still has a scale.
 */
export function axis(
  maxValue: number,
  count = 4,
): { max: number; ticks: number[] } {
  const step = niceCeil(Math.max(maxValue, 0) / count);
  const max = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 1e6; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return { max, ticks };
}

/** A function mapping [d0, d1] onto [r0, r1] (a flat domain maps to the start of the range). */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  return (value: number) => r0 + ((value - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

/**
 * Stacks series bottom to top, in the order given: for each one, the lower and the upper edge at
 * every point. The top of the last one is the total.
 */
export function stack(
  series: { counts: number[] }[],
): { lower: number[]; upper: number[] }[] {
  const length = series[0]?.counts.length ?? 0;
  const base = new Array<number>(length).fill(0);
  return series.map(({ counts }) => {
    const lower = [...base];
    const upper = counts.map((count, i) => base[i]! + count);
    upper.forEach((v, i) => (base[i] = v));
    return { lower, upper };
  });
}

const fixed = (n: number) => Math.round(n * 100) / 100;

/** The SVG path of the band between two edges: along the upper edge, back along the lower one. */
export function bandPath(
  xs: number[],
  lower: number[],
  upper: number[],
  y: (value: number) => number,
): string {
  if (xs.length === 0) return "";
  const top = xs.map((x, i) => `${fixed(x)},${fixed(y(upper[i]!))}`);
  const bottom = xs
    .map((x, i) => `${fixed(x)},${fixed(y(lower[i]!))}`)
    .reverse();
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

/** `count` indexes spread over 0..length-1, first and last included, for the labels of a long axis. */
export function labelIndexes(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from(
    new Set(
      Array.from({ length: count }, (_, i) =>
        Math.round((i * (length - 1)) / (count - 1)),
      ),
    ),
  );
}
