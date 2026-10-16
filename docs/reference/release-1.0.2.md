# Release 1.0.2

Version 1.0.2 makes the dashboard note reliable and keeps the managed task tree
compact.

## Dashboard note

- Changing **Dashboard note** in settings creates missing folders and the target
  Markdown note immediately.
- Existing content is preserved and exactly one `todoist-task-notes` block is
  added.
- Every synchronization verifies that the configured dashboard note exists.
- **Todoist: Add dashboard** inserts the block into the current Markdown note.
- `/todoist: add dashboard` opens the same editor suggestion; previous
  dashboard aliases remain compatible.

## Active task-note layout

- Leaf tasks are direct Markdown files in their project or parent folder.
- A task receives its own folder only when it has subtasks.
- Existing notes migrate automatically and empty managed folders are moved
  through Obsidian's configured trash behavior.
- Completed, inactive, and remotely deleted task notes are removed from the
  managed tree through the same recoverable trash behavior.

## Compatibility and safety

- Missing local notes still never delete Todoist tasks.
- The first import remains pull-only.
- `## Notes` and user-authored content are preserved when an active note moves.
- Duplicate dashboard insertion is prevented.
- All 73 locale dictionaries remain validated with native language names and
  RTL metadata.

See the [GitHub release](https://github.com/natysh1011/obsidian-todolistsync/releases/tag/1.0.2) for downloadable files.
