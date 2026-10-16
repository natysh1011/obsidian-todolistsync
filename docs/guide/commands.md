# Commands

Open the Obsidian Command Palette and search for **Todoist Task Notes**.

| Command | Action |
| --- | --- |
| New task | Opens the progressive task-creation form. |
| Sync now | Runs synchronization immediately. |
| Todoist: Add dashboard | Inserts one `todoist-task-notes` block into the current Markdown note. |
| Preview pending local changes | Counts changed notes and pending creations without modifying Todoist. |
| Reparent current task | Selects a new parent for the active managed task. |
| Move current task to project | Moves the active task to another Todoist project. |
| Detach current task safely | Stops synchronization for the active note without deleting the Todoist task. |
| Open current task online | Opens the active task in Todoist. |

The ribbon also provides **New task** and **Sync task notes** actions. Managed active task notes add an **Add subtask** title-bar action.

Commands that require a current synchronized task are available only when the active note has the required Todoist metadata.

In a Markdown editor, `/todoist: add dashboard` opens the same dashboard
suggestion. The earlier `/add dashboard` form remains available as a
compatibility alias.

