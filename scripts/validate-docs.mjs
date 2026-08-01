import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = resolve(repository, "docs");

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(({ name }) => name !== ".vitepress" && name !== "public")
      .map(async (entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory()
          ? markdownFiles(path)
          : entry.name.endsWith(".md")
            ? [path]
            : [];
      }),
  );
  return nested.flat();
}

const files = await markdownFiles(docs);
const english = files
  .filter((path) => !relative(docs, path).startsWith("he/"))
  .map((path) => relative(docs, path))
  .sort();
const hebrew = files
  .filter((path) => relative(docs, path).startsWith("he/"))
  .map((path) => relative(resolve(docs, "he"), path))
  .sort();

if (JSON.stringify(english) !== JSON.stringify(hebrew)) {
  throw new Error(
    `English and Hebrew documentation pages differ.\nEnglish: ${english.join(", ")}\nHebrew: ${hebrew.join(", ")}`,
  );
}

const forbidden = [
  /\/Users\/natanielshulkin/i,
  /(?:^|\W)next-task(?:\W|$)/i,
  /(?:^|\W)task-list(?:\W|$)/i,
  /[`"]\/todoist[`"]/,
];

for (const path of files) {
  const source = await readFile(path, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      throw new Error(`${relative(repository, path)} contains private or unreleased content matching ${pattern}.`);
    }
  }
}

const combined = await Promise.all(files.map((path) => readFile(path, "utf8")));
if (!combined.some((source) => source.includes("MyProject"))) {
  throw new Error("Documentation must include the synthetic MyProject example.");
}

process.stdout.write(
  `Validated ${files.length} documentation pages with English/Hebrew parity and no private or unreleased content.\n`,
);
