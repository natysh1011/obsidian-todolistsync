import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import https from "node:https";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const translateDirectory = resolve(repository, "translate");
const delimiter = "<<<TTN_SPLIT_9f8a7b6c>>>";
const placeholderPattern = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

const localeAliases = {
  kab: "fr",
  kh: "km",
  nn: "no",
  "nan-TW": "zh-TW",
};
const forceLocales = new Set(
  (process.env.FORCE_LOCALES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const forceAll = process.env.FORCE_ALL === "1";

function encodePlaceholders(value) {
  const placeholders = [];
  const encoded = value.replace(placeholderPattern, (match) => {
    const token = `___TTNPH_${placeholders.length}___`;
    placeholders.push(match);
    return token;
  });
  return { encoded, placeholders };
}

function decodePlaceholders(value, placeholders) {
  return placeholders.reduce((current, placeholder, index) => {
    const exact = `___TTNPH_${index}___`;
    if (current.includes(exact)) {
      return current.replaceAll(exact, placeholder);
    }

    const fuzzy = new RegExp(`_{3}[^\\s{}]*_${index}_{3}`, "g");
    if (fuzzy.test(current)) {
      return current.replace(fuzzy, placeholder);
    }

    if (!current.includes(placeholder)) {
      return `${current} ${placeholder}`.trim();
    }
    return current;
  }, value);
}

function extractTranslatedText(payload) {
  const value = JSON.parse(payload);
  return value[0].map((item) => item[0]).join("");
}

async function translateBatch(text, targetLocale, attempt = 1) {
  const target = localeAliases[targetLocale] ?? targetLocale;
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: target,
    dt: "t",
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

  const payload = await new Promise((resolveRequest, rejectRequest) => {
    const request = https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            rejectRequest(
              new Error(`${targetLocale}: HTTP ${response.statusCode} ${data.slice(0, 120)}`),
            );
            return;
          }
          if (!data.startsWith("[[[")) {
            rejectRequest(
              new Error(`${targetLocale}: non-JSON payload ${data.slice(0, 120)}`),
            );
            return;
          }
          try {
            resolveRequest(extractTranslatedText(data));
          } catch (error) {
            rejectRequest(
              new Error(`${targetLocale}: parse failed ${String(error)} ${data.slice(0, 120)}`),
            );
          }
        });
      },
    );

    request.on("error", (error) => rejectRequest(error));
  });

  return payload;
}

async function translateWithRetry(text, locale, retries = 5) {
  let error;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await translateBatch(text, locale, attempt);
    } catch (attemptError) {
      error = attemptError;
      const backoff = 500 * 2 ** (attempt - 1);
      process.stderr.write(`retry ${attempt}/${retries} for ${locale}: ${String(attemptError)}\n`);
      await sleep(backoff);
    }
  }
  throw error;
}

function getLocaleFromFile(file) {
  return file.replace(/\.json$/, "");
}

async function translateEntriesFallback(encodedEntries, locale) {
  const messages = {};
  for (let index = 0; index < encodedEntries.length; index += 1) {
    const { key, encoded, placeholders } = encodedEntries[index];
    const translated = await translateWithRetry(encoded, locale);
    messages[key] = decodePlaceholders(translated.trim(), placeholders);
    await sleep(80);
  }
  return messages;
}

async function main() {
  const english = JSON.parse(
    await readFile(resolve(translateDirectory, "en.json"), "utf8"),
  );
  const englishEntries = Object.entries(english.messages);

  const files = (await readdir(translateDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const locale = getLocaleFromFile(file);
    if (locale === "en") continue;

    const path = resolve(translateDirectory, file);
    const payload = JSON.parse(await readFile(path, "utf8"));
    const hasMessages = payload.messages && Object.keys(payload.messages).length > 0;

    if (hasMessages && !forceAll && !forceLocales.has(locale)) {
      payload._meta.available = true;
      await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
      process.stdout.write(`keep ${locale}\n`);
      continue;
    }

    const encodedEntries = englishEntries.map(([key, value]) => {
      const { encoded, placeholders } = encodePlaceholders(value);
      return { key, encoded, placeholders };
    });

    const text = encodedEntries.map((entry) => entry.encoded).join(`\n${delimiter}\n`);
    const translated = await translateWithRetry(text, locale);
    const translatedChunks = translated.split(delimiter);

    let messages;
    if (translatedChunks.length !== encodedEntries.length) {
      process.stderr.write(
        `${locale}: batch split mismatch, switching to per-message fallback\n`,
      );
      messages = await translateEntriesFallback(encodedEntries, locale);
    } else {
      messages = {};
      for (let index = 0; index < encodedEntries.length; index += 1) {
        const { key, placeholders } = encodedEntries[index];
        messages[key] = decodePlaceholders(translatedChunks[index].trim(), placeholders);
      }
    }

    payload._meta.available = true;
    payload.messages = messages;
    await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
    process.stdout.write(`done ${locale}\n`);

    await sleep(300);
  }
}

await main();
