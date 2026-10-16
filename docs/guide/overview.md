# Overview

Todoist Task Notes creates one Markdown file for every task it tracks. The folder structure mirrors the Todoist project and parent chain, while YAML properties hold the fields that synchronize with Todoist.

## What it does

- Imports active tasks without changing Todoist on the first synchronization.
- Preserves tasks, subtasks, and deeper nested levels.
- Synchronizes title, description, labels, project, parent, due data, deadline, priority, duration, recurrence, and completion.
- Creates Todoist tasks from a focused form in the vault.
- Moves completed, inactive, and remotely deleted notes to Obsidian's configured trash.
- Preserves everything below `## Notes`.
- Saves displaced local content in a timestamped conflict note when both sides changed.
- Uses task folders only for tasks with subtasks; leaf tasks are direct Markdown files.
- Never treats a missing local note as permission to delete a Todoist task.

## Current interface

Version 1.0.2 includes a managed dashboard-note path, the
**Todoist: Add dashboard** command and editor suggestion, compact task-note
folders, inactive-note cleanup, the `todoist-task-notes` dashboard block, and
the `todoist-task-actions` block inside managed notes.

## Data ownership

Task data stays between your local vault and Todoist's API. The documentation site is static, has no analytics, and contains only synthetic examples such as `MyProject`.

