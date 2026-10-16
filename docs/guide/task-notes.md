# Task notes

## Folder hierarchy

Notes are nested beneath the configured root:

```text
משימות/Todoist/<Todoist project>/<leaf task>.md
משימות/Todoist/<Todoist project>/<parent task>/<parent task>.md
משימות/Todoist/<Todoist project>/<parent task>/<leaf subtask>.md
```

A task receives its own folder only while it has direct subtasks. Leaf tasks are
stored as files directly inside their parent task or project folder. The plugin
migrates notes between these two shapes as hierarchy changes and removes empty
managed folders. Duplicate titles receive a stable Todoist-ID suffix so notes
do not overwrite one another. Hebrew filenames and deeper task levels are
supported.

## Managed properties

Each note has YAML properties for:

- Todoist ID and link
- title and description
- status and synchronization state
- project and project ID
- parent link and parent ID
- labels and the `todoist-task` tag
- due date or date-time, due expression, deadline, priority, duration, and recurrence
- Todoist order, update timestamp, and last synchronization time

You can edit the synchronized task fields in the Properties view or YAML. The next sync compares the local state with the last known Todoist state.

## Protected Notes section

Everything below this heading belongs to you:

```markdown
## Notes
```

Synchronization never overwrites this section. Keep free-form notes, links, embeds, and checklists there.

## Add a subtask

An active synchronized task note includes an **Add subtask** action below its details and a small title-bar action. Both open the same form with the project and parent path locked. The action is disabled for completed, detached, and pending-create notes.

