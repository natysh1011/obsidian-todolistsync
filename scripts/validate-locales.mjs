import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  availableLocaleCodes,
  localeDefinitions,
} from "./locale-registry.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(repository, "translate");
const expectedLocales = localeDefinitions.map(({ code }) => code).sort();
const definitionsByCode = new Map(
  localeDefinitions.map((definition) => [definition.code, definition]),
);
const activeLocales = new Set(availableLocaleCodes);

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
  const definition = definitionsByCode.get(locale);
  if (!definition) throw new Error(`${locale}: missing registry definition`);
  const value = JSON.parse(await readFile(resolve(directory, `${locale}.json`), "utf8"));
  if (value._meta?.locale !== locale) throw new Error(`${locale}: invalid metadata locale`);
  if (value._meta?.nativeName !== definition.nativeName) {
    throw new Error(`${locale}: expected native name ${definition.nativeName}`);
  }
  if (value._meta?.sourceHash !== hash) throw new Error(`${locale}: stale English source hash`);
  const expectedDirection = definition.direction;
  if (value._meta?.direction !== expectedDirection) throw new Error(`${locale}: expected ${expectedDirection}`);
  const expectedAvailability = activeLocales.has(locale);
  if (value._meta?.available !== expectedAvailability) {
    throw new Error(`${locale}: expected available=${expectedAvailability}`);
  }
  const actualKeys = Object.keys(value.messages ?? {}).sort();
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
