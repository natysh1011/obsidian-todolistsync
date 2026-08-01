import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(repository, "translate");
const expectedLocales = [
  "af", "am", "ar", "az", "be", "bg", "bn", "ca", "cs", "da", "de",
  "dv", "el", "en-GB", "en", "eo", "es", "eu", "fa", "fi", "fr",
  "ga", "gl", "he", "hi", "hr", "hu", "id", "it", "ja", "ka", "kab",
  "kh", "kn", "ko", "ky", "la", "lt", "lv", "ml", "ms", "nan-TW",
  "ne", "nl", "nn", "no", "oc", "or", "pl", "pt-BR", "pt", "ro", "ru",
  "sa", "si", "sk", "sl", "sq", "sr", "sv", "sw", "ta", "te", "th",
  "tl", "tr", "tt", "uk", "ur", "uz", "vi", "zh-TW", "zh",
].sort();
const rtlLocales = new Set(["ar", "dv", "fa", "he", "ur"]);
const activeLocales = new Set(["en", "he"]);

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

const files = (await readdir(directory))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();
if (JSON.stringify(files) !== JSON.stringify(expectedLocales)) {
  throw new Error(`Locale files differ from the required registry.\nExpected: ${expectedLocales.join(", ")}\nActual: ${files.join(", ")}`);
}

const english = JSON.parse(await readFile(resolve(directory, "en.json"), "utf8"));
const keys = Object.keys(english.messages).sort();
const hash = createHash("sha256")
  .update(JSON.stringify(english.messages))
  .digest("hex");

for (const locale of expectedLocales) {
  const value = JSON.parse(await readFile(resolve(directory, `${locale}.json`), "utf8"));
  if (value._meta?.locale !== locale) throw new Error(`${locale}: invalid metadata locale`);
  if (value._meta?.sourceHash !== hash) throw new Error(`${locale}: stale English source hash`);
  const expectedDirection = rtlLocales.has(locale) ? "rtl" : "ltr";
  if (value._meta?.direction !== expectedDirection) throw new Error(`${locale}: expected ${expectedDirection}`);
  const expectedAvailability = activeLocales.has(locale);
  if (value._meta?.available !== expectedAvailability) {
    throw new Error(`${locale}: expected available=${expectedAvailability}`);
  }
  const actualKeys = Object.keys(value.messages ?? {}).sort();
  if (!expectedAvailability) {
    if (actualKeys.length) throw new Error(`${locale}: unavailable locale must be an empty stub`);
    continue;
  }
  if (JSON.stringify(actualKeys) !== JSON.stringify(keys)) {
    throw new Error(`${locale}: active-locale message key parity failed`);
  }
  for (const key of keys) {
    const translated = value.messages[key];
    if (typeof translated !== "string" || !translated.trim()) throw new Error(`${locale}.${key}: empty or non-string value`);
    if (JSON.stringify(placeholders(translated)) !== JSON.stringify(placeholders(english.messages[key]))) {
      throw new Error(`${locale}.${key}: placeholder mismatch`);
    }
  }
}

process.stdout.write(
  `Validated ${expectedLocales.length} locale files; ${activeLocales.size} active dictionaries have ${keys.length} messages each.\n`,
);
