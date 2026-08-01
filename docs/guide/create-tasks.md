# Create tasks

Run **Todoist Task Notes: New task**, use the ribbon action, or select **New task** on the dashboard.

## Choose the parent without a long list

The form uses progressive hierarchy selection:

1. Choose a Todoist project.
2. Optionally choose a root task from that project only.
3. If it has children, optionally choose one direct child.
4. Continue one level at a time or stop at any level.

Changing a higher level clears all lower selections. A breadcrumb shows the final parent path. When opened from **Add subtask**, the project and parent are already locked.

## Task fields

- Required title and optional description.
- Project and optional parent.
- Comma-separated labels; missing labels can be created.
- Due date and time.
- Deadline and priority.
- Duration as a number plus minutes, hours, or days.
- Recurrence as a number plus minutes, hours, or days.

## Offline creation

If Todoist is unreachable, the plugin saves a local `pending-create` note with an idempotency key. The next successful synchronization retries the API creation without intentionally duplicating the task.

