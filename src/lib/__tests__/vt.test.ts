// v1.8 view transitions gate.
import { describe, expect, it } from "vitest";
import { navDir, vtAllowed, vtOn } from "../vt";

describe("vtAllowed", () => {
  it("needs support and no reduced motion of either kind", () => {
    expect(vtAllowed({ supported: true, reduced: false, motionOff: false })).toBe(true);
    expect(vtAllowed({ supported: false, reduced: false, motionOff: false })).toBe(false);
    expect(vtAllowed({ supported: true, reduced: true, motionOff: false })).toBe(false);
    expect(vtAllowed({ supported: true, reduced: false, motionOff: true })).toBe(false);
  });
  it("vtOn is false without a document (server, tests)", () => {
    expect(vtOn()).toBe(false);
  });
});

describe("navDir", () => {
  const tab = (p: string) => ["/", "/gym", "/body", "/insights"].findIndex((h) => (h === "/" ? p === "/" : p.startsWith(h)));
  it("tab to tab is tab; tab to settings and back stay none; depth gives push/pop", () => {
    expect(navDir("/", "/gym", tab)).toBe("tab");
    expect(navDir("/insights", "/", tab)).toBe("tab");
    expect(navDir("/", "/settings", tab)).toBe("none");
    expect(navDir("/settings", "/body", tab)).toBe("none");
    expect(navDir("/settings", "/settings/term", tab)).toBe("push");
    expect(navDir("/settings/term", "/settings", tab)).toBe("pop");
    expect(navDir("/gym", "/gym", tab)).toBe("none");
  });
});
