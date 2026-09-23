import { describe, expect, it } from "vitest";
import { resolveInitialLanguage } from "./detectLanguage";

describe("resolveInitialLanguage", () => {
  it("picks Chinese when the browser prefers zh-CN", () => {
    expect(resolveInitialLanguage(["zh-CN", "en-US"])).toBe("zh");
  });

  it("picks English for an en-* locale", () => {
    expect(resolveInitialLanguage(["en-GB"])).toBe("en");
  });

  it("is case-insensitive on the language subtag", () => {
    expect(resolveInitialLanguage(["ZH-tw"])).toBe("zh");
  });

  it("falls back to English for an unsupported language", () => {
    expect(resolveInitialLanguage(["fr-FR", "de-DE"])).toBe("en");
  });

  it("falls back to English when no browser languages are given", () => {
    expect(resolveInitialLanguage([])).toBe("en");
  });

  it("skips unsupported entries before finding a supported one", () => {
    expect(resolveInitialLanguage(["fr-FR", "zh-SG"])).toBe("zh");
  });
});
