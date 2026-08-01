# Todoist Task Notes for Obsidian

An Obsidian plugin that creates one Markdown note per Todoist task and keeps task fields synchronized in both directions.

**Documentation:** [English](https://natysh1011.github.io/obsidian-todolistsync/) · [עברית](https://natysh1011.github.io/obsidian-todolistsync/he/)

## Features

- One note per task, subtask, and nested subtask.
- Hierarchical folders grouped by the real Todoist project.
- Hebrew RTL dashboard with project statistics and a collapsible task tree.
- Create tasks and subtasks from Obsidian.
- Sync title, description, labels, project, hierarchy, dates, priority, duration, recurrence, and completion.
- Offline task creation with idempotent retry.
- Conflict copies when Todoist and Obsidian changed the same field.
- User content under `## Notes` is never overwritten.
- Localized interface and task-note details in English and Hebrew, with RTL support.

## Installation

1. Clone or download this repository.
2. Run `npm install` and `npm run build`.
3. Copy `manifest.json`, `main.js`, and `styles.css` into:

   ```text
   <vault>/.obsidian/plugins/todoist-task-notes/
   ```

4. Enable **Todoist Task Notes** in Obsidian's Community plugins settings.

## Todoist API token

Open **Settings → Todoist Task Notes** to paste, save, replace, test, or remove
your Todoist API token. The password field is always blank when settings open,
and a saved token is never displayed again. The value is stored only in Obsidian
SecretStorage; it is never written to `data.json`, task notes, logs, or this
repository.

If this plugin does not have its own token, it can reuse the token configured by
the existing [Todoist Sync plugin](https://github.com/jamiebrynes7/obsidian-todoist-plugin).
Removing a token saved by Todoist Task Notes does not change Todoist Sync's
token.

## Dashboard

Add this block to any Markdown note:

````markdown
```todoist-task-notes
```
````

The dashboard groups tasks by their actual Todoist project under **My Projects**. Projects and task branches are collapsed by default.

## Languages

Choose **System language**, **English**, or **עברית** in the plugin settings.
Hebrew uses a fully mirrored RTL interface; English uses LTR. The localization
registry contains a separate JSON file for each planned locale under
`translate/`, but languages without a complete translation are shown as
unavailable and cannot be selected. Available languages are listed first; every
language is labeled by its native name (for example, `Gaeilge`). An unsupported
system language safely falls back to English.

Technical identifiers, command names, code-block names, frontmatter keys, and
the `## Notes` heading remain in English for compatibility. User-authored task
titles, descriptions, labels, project names, and notes are never translated.

## Development

```bash
npm install
npm run locales:validate
npm run check
npm test
npm run build
npm run docs:build
```

`translate/en.json` is the canonical message source. Every available locale must
have identical keys and placeholders. Run `npm run locales:generate` after
changing registry metadata, then complete active translations and run the
validator before committing.

## Releases

Push a version tag that exactly matches `manifest.json`, without a `v` prefix:

```bash
git tag X.Y.Z
git push origin X.Y.Z
```

GitHub Actions validates and builds the plugin, then publishes `main.js`,
`manifest.json`, `styles.css`, and an installation ZIP to GitHub Releases.

## License

[MIT](LICENSE)

The first synchronization is pull-only and does not modify Todoist.
