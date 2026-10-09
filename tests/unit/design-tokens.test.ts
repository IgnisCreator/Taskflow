import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [
      m[1]!,
      m[2]!,
    ]),
  );
}

function blockAfter(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} not found`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

const light = tokens(blockAfter(":root {"));
const darkSystem = tokens(blockAfter(':root:not([data-theme="light"]) {'));
const darkChosen = tokens(blockAfter(':root[data-theme="dark"] {'));

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// Text pairs need 4.5:1 (WCAG AA); borders and focus rings that identify a control need 3:1.
const textPairs = [
  ["fg", "page"],
  ["fg", "surface"],
  ["fg", "subtle"],
  ["fg", "danger-soft"],
  ["muted", "page"],
  ["muted", "surface"],
  ["muted", "subtle"],
  ["primary-fg", "primary"],
  ["primary-fg", "primary-hover"],
  ["link", "page"],
  ["link", "surface"],
  ["link", "subtle"],
  ["danger-fg", "danger"],
  ["danger-fg", "danger-hover"],
  ["danger-text", "surface"],
  ["danger-text", "danger-soft"],
  ["success-text", "surface"],
  ["success-text", "page"],
  ["success-text", "success-soft"],
] as const;
const uiPairs = [
  ["control", "surface"],
  ["control", "page"],
  ["link", "surface"],
  ["link", "page"], // focus outline
  ["danger-text", "danger-soft"], // focus outline on the danger card
] as const;

describe("design tokens", () => {
  it("define the same roles in light and both dark blocks", () => {
    expect(Object.keys(darkSystem).sort()).toEqual(Object.keys(light).sort());
  });

  it("keep the two copies of the dark theme identical", () => {
    expect(darkSystem).toEqual(darkChosen);
  });

  it("are all exposed to Tailwind through @theme", () => {
    for (const name of Object.keys(light)) {
      expect(css, name).toContain(`--color-${name}: var(--${name});`);
    }
  });

  describe.each([
    ["light", light],
    ["dark", darkChosen],
  ])("%s theme contrast", (_theme, t) => {
    it.each(textPairs)("%s on %s is at least 4.5:1", (fg, bg) => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(uiPairs)("%s against %s is at least 3:1", (fg, bg) => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
    });
  });
});
