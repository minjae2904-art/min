// Round E: Settings.lang / langDev in normalize and mergeStates (spec 5.1).
import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, mergeStates, normalize, type State } from "../model";

const v18 = () => ({ profile: { name: "x", setup: true }, settings: { theme: "dark" }, days: {} }) as unknown as Partial<State>;

describe("Settings.lang", () => {
  it("a pre-v1.9 state with a profile stays Thai", () => {
    expect(normalize(v18()).settings.lang).toBe("th");
  });
  it("a brand-new install follows the device", () => {
    expect(DEFAULT_STATE.settings.lang).toBe("auto");
    expect(normalize({}).settings.lang).toBe("auto");
    expect(normalize(null).settings.lang).toBe("auto");
  });
  it("invalid values fall back by the same rule; valid ones are kept", () => {
    expect(normalize({ ...v18(), settings: { lang: "fr" } } as unknown as Partial<State>).settings.lang).toBe("th");
    expect(normalize({ settings: { lang: 7 } } as unknown as Partial<State>).settings.lang).toBe("auto");
    expect(normalize({ ...v18(), settings: { lang: "en" } } as unknown as Partial<State>).settings.lang).toBe("en");
    expect(normalize({ ...v18(), settings: { lang: "auto" } } as unknown as Partial<State>).settings.lang).toBe("auto");
    expect(normalize({ profile: [] } as unknown as Partial<State>).settings.lang).toBe("auto");
  });
  it("langDev: valid kept, anything else null", () => {
    expect(normalize({ settings: { langDev: "en" } } as unknown as Partial<State>).settings.langDev).toBe("en");
    expect(normalize({ settings: { langDev: "xx" } } as unknown as Partial<State>).settings.langDev).toBeNull();
    expect(normalize({}).settings.langDev).toBeNull();
  });
  it("mergeStates keeps the newer copy's lang and langDev", () => {
    const a = normalize({ ...v18(), settings: { lang: "en", langDev: "en" } } as unknown as Partial<State>);
    const b = normalize({ ...v18(), settings: { lang: "th", langDev: null } } as unknown as Partial<State>);
    const m = mergeStates(a, b);
    expect([m.settings.lang, m.settings.langDev]).toEqual(["en", "en"]);
    expect(mergeStates(b, a).settings.lang).toBe("th");
  });
});
