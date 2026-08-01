import { describe, expect, it } from "vitest";
import {
  AVAILABLE_LOCALE_CODES,
  LOCALE_CODES,
  createI18n,
  isLanguagePreference,
  isLocaleAvailable,
  resolveLocale,
} from "../src/i18n";

describe("localization infrastructure", () => {
  it("registers all locale files but exposes only English and Hebrew", () => {
    expect(LOCALE_CODES).toHaveLength(73);
    expect([...AVAILABLE_LOCALE_CODES]).toEqual(["en", "he"]);
    expect(isLocaleAvailable("en")).toBe(true);
    expect(isLocaleAvailable("he")).toBe(true);
    expect(isLocaleAvailable("fr")).toBe(false);
    expect(isLanguagePreference("fr")).toBe(false);
  });

  it("uses an available system locale and falls back from unavailable ones", () => {
    expect(resolveLocale("system", "he", [])).toBe("he");
    expect(resolveLocale("system", "en-US", [])).toBe("en");
    expect(resolveLocale("system", "ar", [])).toBe("en");
    expect(resolveLocale("system", "xx", ["he-IL"])).toBe("he");
  });

  it("interpolates, pluralizes, and exposes the correct direction", () => {
    const english = createI18n("en", "en");
    const hebrew = createI18n("he", "he");
    expect(english.direction).toBe("ltr");
    expect(hebrew.direction).toBe("rtl");
    expect(english.t("dashboard.progress", { project: "MyProject" })).toBe(
      "Progress for MyProject",
    );
    expect(hebrew.t("dashboard.newTask")).toBe("משימה חדשה");
    expect(english.plural("dashboard.taskCount", 1)).toBe("1 task");
    expect(english.plural("dashboard.taskCount", 3)).toBe("3 tasks");
    expect(hebrew.plural("dashboard.remainingCount", 2)).toContain("2");
  });
});
