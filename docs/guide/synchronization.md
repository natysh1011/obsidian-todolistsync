# Synchronization

Synchronization runs on startup, at the configured interval, after debounced task-note edits, and when you invoke **Sync now**.

## Direction and conflict handling

After the pull-only initial import, managed fields synchronize in both directions. If only the note changed, the plugin sends the supported fields to Todoist. If Todoist changed, the note is updated. If both sides changed the same synchronization state, Todoist wins and the complete displaced local note is stored under `_Conflicts` with a timestamp.

The `## Notes` section is always preserved.

## Completion and inactive tasks

Complete a task from the dashboard, Todoist, or the note's managed `status`.
After Todoist no longer reports the task as active, synchronization moves its
managed note to the configured Obsidian trash. The same rule applies to tasks
that were deleted remotely, so stale notes are not recreated on later syncs.

## Project and parent changes

Use the dedicated Command Palette actions to move the current task to another project or choose a different parent. The plugin updates Todoist and relocates the managed note to the matching folder.

## Deletions and detaching

Deleting a local note is never treated as permission to delete the Todoist task.
Remote completion or deletion removes the corresponding local managed note
through Obsidian's trash behavior. You can still use **Detach current task
safely** while a task is active to keep a local note out of synchronization
without deleting the Todoist task.

## No-change behavior

The plugin compares generated content before writing. Unchanged task notes are not rewritten during an otherwise successful synchronization.

