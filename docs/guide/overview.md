# Overview

Todoist Task Notes creates one Markdown file for every task it tracks. The folder structure mirrors the Todoist project and parent chain, while YAML properties hold the fields that synchronize with Todoist.

## What it does

- Imports active tasks without changing Todoist on the first synchronization.
- Preserves tasks, subtasks, and deeper nested levels.
- Synchronizes title, description, labels, project, parent, due data, deadline, priority, duration, recurrence, and completion.
- Creates Todoist tasks from a focused form in the vault.
- Keeps completed notes in place and removes them from the active dashboard.
- Preserves everything below `## Notes`.
- Saves displaced local content in a timestamped conflict note when both sides changed.
- Marks a note `detached` after a remote task remains missing; a missing local note never deletes a Todoist task.

## Current interface

Version 1.0.1 includes the `todoist-task-notes` dashboard block, the `todoist-task-actions` block inside managed notes, ribbon actions, and seven Command Palette commands. The interface is fully available in English and Hebrew.

## Data ownership

Task data stays between your local vault and Todoist's API. The documentation site is static, has no analytics, and contains only synthetic examples such as `MyProject`.

