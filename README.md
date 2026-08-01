# Todoist Task Notes for Obsidian

An Obsidian plugin that creates one Markdown note per Todoist task and keeps task fields synchronized in both directions.

## Features

- One note per task, subtask, and nested subtask.
- Hierarchical folders grouped by the real Todoist project.
- Hebrew RTL dashboard with project statistics and a collapsible task tree.
- Create tasks and subtasks from Obsidian.
- Sync title, description, labels, project, hierarchy, dates, priority, duration, recurrence, and completion.
- Offline task creation with idempotent retry.
- Conflict copies when Todoist and Obsidian changed the same field.
- User content under `## Notes` is never overwritten.

## Installation

1. Clone or download this repository.
2. Run `npm install` and `npm run build`.
3. Copy `manifest.json`, `main.js`, and `styles.css` into:

   ```text
   <vault>/.obsidian/plugins/todoist-task-notes/
   ```

4. Enable **Todoist Task Notes** in Obsidian's Community plugins settings.

## Todoist API token

The plugin reuses the API token configured by the existing [Todoist Sync plugin](https://github.com/jamiebrynes7/obsidian-todoist-plugin) through Obsidian SecretStorage. The token is never copied into task notes, plugin settings, or this repository.

## Dashboard

Add this block to any Markdown note:

````markdown
```todoist-task-notes
```
````

The dashboard groups tasks by their actual Todoist project under **My Projects**. Projects and task branches are collapsed by default.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

## Releases

Push a version tag that exactly matches `manifest.json`, without a `v` prefix:

```bash
git tag 1.0.0
git push origin 1.0.0
```

GitHub Actions validates and builds the plugin, then publishes `main.js`,
`manifest.json`, `styles.css`, and an installation ZIP to GitHub Releases.

## License

[MIT](LICENSE)

The first synchronization is pull-only and does not modify Todoist.
