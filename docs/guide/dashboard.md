# Dashboard

Add the following block to a Markdown note:

````markdown
```todoist-task-notes
```
````

The default dashboard note is `משימות/Untitled.md`. Changing the dashboard
path in settings creates the target note and block immediately, and every sync
keeps that configured note available. The rendered block includes **Sync now**
and **New task** actions.

To add another dashboard without changing the configured path, run
**Todoist: Add dashboard** in the Command Palette. You can also type
`/todoist: add dashboard` in a Markdown editor and select the suggestion.
Repeating either action does not add a duplicate block.

## Overview statistics

The summary shows:

- total open tasks;
- overdue tasks;
- tasks due today or in the next seven days;
- urgent P1 and P2 tasks.

Each Todoist project card shows remaining and known completed tasks, progress, the nearest dated task, overdue and urgent counts, and tasks without a date.

## Collapsible task tree

Projects and task branches are closed when the dashboard first opens. Expand a project, then expand any task with children. Several branches can remain open at once, and the expansion state survives dashboard refreshes during the same view.

The tree retains note links, completion controls, due dates, priorities, and labels. Dated items are ordered by nearest due date; undated items appear later. Inactive tasks are removed from the managed task-note tree during synchronization.

<DashboardPreview />

This interactive preview is intentionally generic and uses only synthetic English data.

