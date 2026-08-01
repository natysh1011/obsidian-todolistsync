import { describe, expect, it } from "vitest";
import {
  AVAILABLE_LOCALE_CODES,
  LOCALE_CODES,
  createI18n,
  getLocaleDisplayName,
  getLocaleOptions,
  isLanguagePreference,
  isLocaleAvailable,
  resolveLocale,
} from "../src/i18n";

describe("localization infrastructure", () => {
  it("registers and exposes every locale file", () => {
    expect(LOCALE_CODES).toHaveLength(73);
    expect(AVAILABLE_LOCALE_CODES).toHaveLength(73);
    expect(isLocaleAvailable("en")).toBe(true);
    expect(isLocaleAvailable("he")).toBe(true);
    expect(isLocaleAvailable("fr")).toBe(true);
    expect(isLanguagePreference("fr")).toBe(true);
  });

  it("shows native locale names for all available languages", () => {
    expect(getLocaleDisplayName("ga")).toBe("Gaeilge");
    expect(getLocaleDisplayName("de")).toBe("Deutsch");
    expect(getLocaleDisplayName("ar")).toBe("العربية");
    expect(getLocaleDisplayName("ga") === "אירית").toBe(false);

    const options = getLocaleOptions();
    expect(options).toHaveLength(73);
    expect(options.every(({ available }) => available)).toBe(true);
    expect(new Set(options.map(({ code }) => code)).size).toBe(73);
    expect(options.some(({ code }) => code === "en")).toBe(true);
    expect(options.some(({ code }) => code === "he")).toBe(true);
    expect(options.some(({ code }) => code === "fr")).toBe(true);
  });

  it("uses an available system locale and falls back from unavailable ones", () => {
    expect(resolveLocale("system", "he", [])).toBe("he");
    expect(resolveLocale("system", "en-US", [])).toBe("en");
    expect(resolveLocale("system", "ar", [])).toBe("ar");
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
