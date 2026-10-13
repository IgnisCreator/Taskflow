import { describe, expect, it } from "vitest";
import { METRIC_HELP } from "../../src/lib/metric-help";

describe("METRIC_HELP", () => {
  it.each(Object.entries(METRIC_HELP))(
    "%s explains itself and cites an https source",
    (_key, help) => {
      for (const text of [help.what, help.why, help.read]) {
        expect(text.length).toBeGreaterThan(30);
      }
      expect(help.title.length).toBeGreaterThan(0);
      expect(help.source.label.length).toBeGreaterThan(0);
      expect(new URL(help.source.url).protocol).toBe("https:");
    },
  );
});
