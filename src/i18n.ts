import english from "../translate/en.json";
import {
  AVAILABLE_LOCALE_CODES,
  LOCALE_CODES,
  NATIVE_LOCALE_NAMES,
  TRANSLATION_CATALOG,
} from "./locale-catalog";

export { AVAILABLE_LOCALE_CODES, LOCALE_CODES };

export type LocaleCode = (typeof LOCALE_CODES)[number];
export type AvailableLocaleCode = (typeof AVAILABLE_LOCALE_CODES)[number];
export type LanguagePreference = "system" | AvailableLocaleCode;
export type MessageKey = keyof typeof english.messages;
export type MessageParams = Record<string, string | number>;
export type TextDirection = "ltr" | "rtl";

type MessageDictionary = Record<MessageKey, string>;

const localeSet = new Set<string>(LOCALE_CODES);
const availableLocaleSet = new Set<string>(AVAILABLE_LOCALE_CODES);
const localeNameCollator = new Intl.Collator("en", {
  sensitivity: "base",
  usage: "sort",
});
const localeAliases: Record<string, LocaleCode> = {
  "en-us": "en",
  "en-au": "en-GB",
  "en-ca": "en-GB",
  iw: "he",
  km: "kh",
  nb: "no",
  "pt-br": "pt-BR",
  "zh-cn": "zh",
  "zh-hans": "zh",
  "zh-hant": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-tw": "zh-TW",
};
const intlAliases: Partial<Record<LocaleCode, string>> = {
  kh: "km",
  "nan-TW": "zh-TW",
};
export interface LocaleOption {
  readonly code: LocaleCode;
  readonly nativeName: string;
  readonly available: boolean;
}

export interface I18n {
  readonly locale: LocaleCode;
  readonly intlLocale: string;
  readonly direction: TextDirection;
  t(key: MessageKey, params?: MessageParams): string;
  plural(
    base: "dashboard.taskCount" | "dashboard.remainingCount",
    count: number,
  ): string;
}

function normalizeLocale(value: string): LocaleCode | null {
  const trimmed = value.trim();
  if (localeSet.has(trimmed)) return trimmed as LocaleCode;
  const lower = trimmed.toLowerCase().replaceAll("_", "-");
  const alias = localeAliases[lower];
  if (alias) return alias;
  const exact = LOCALE_CODES.find((code) => code.toLowerCase() === lower);
  if (exact) return exact;
  const language = lower.split("-")[0];
  return localeSet.has(language) ? (language as LocaleCode) : null;
}

export function resolveLocale(
  preference: LanguagePreference,
  systemLanguage = "en",
  browserLanguages: readonly string[] =
    typeof navigator === "undefined" ? [] : navigator.languages,
): LocaleCode {
  if (preference !== "system") return preference;
  for (const candidate of [systemLanguage, ...browserLanguages]) {
    const resolved = normalizeLocale(candidate);
    if (resolved && availableLocaleSet.has(resolved)) {
      return resolved;
    }
  }
  return "en";
}

function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(
    /\{([A-Za-z][A-Za-z0-9_]*)\}/g,
    (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match,
  );
}

export function createI18n(
  preference: LanguagePreference,
  systemLanguage?: string,
): I18n {
  const locale = resolveLocale(preference, systemLanguage);
  const bundle = TRANSLATION_CATALOG[locale] as {
    _meta: { direction: TextDirection };
    messages: MessageDictionary;
  };
  const intlLocale = intlAliases[locale] ?? locale;
  const t = (key: MessageKey, params?: MessageParams): string =>
    interpolate(bundle.messages[key] ?? english.messages[key], params);

  return {
    locale,
    intlLocale,
    direction: bundle._meta.direction,
    t,
    plural(base, count) {
      const category = new Intl.PluralRules(intlLocale).select(count);
      const candidate = `${base}.${category}` as MessageKey;
      const key = Object.prototype.hasOwnProperty.call(
        english.messages,
        candidate,
      )
        ? candidate
        : (`${base}.other` as MessageKey);
      return t(key, { count });
    },
  };
}

export function getLocaleDisplayName(code: LocaleCode): string {
  return NATIVE_LOCALE_NAMES[code];
}

export function getLocaleOptions(): readonly LocaleOption[] {
  return LOCALE_CODES.map((code) => ({
    code,
    nativeName: getLocaleDisplayName(code),
    available: true,
  })).sort(
    (left, right) =>
      localeNameCollator.compare(left.nativeName, right.nativeName) ||
      left.code.localeCompare(right.code),
  );
}

export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return (
    value === "system" ||
    (typeof value === "string" && availableLocaleSet.has(value))
  );
}

export function isLocaleAvailable(code: LocaleCode): boolean {
  return availableLocaleSet.has(code);
}
