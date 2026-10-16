# Troubleshooting

## No token is available

Open **Settings → Todoist Task Notes**, paste a new token, select **Save token**, then **Test connection**. If the plugin reports a shared token, it is using Todoist Sync's secure credential.

## The connection test fails

Confirm that the token is current in Todoist's Developer integration settings. Replace it in the plugin and retry. Also check connectivity, Todoist service status, and whether a firewall blocks API requests.

## A language falls back to English

The plugin includes 73 locale dictionaries. If Obsidian or the operating system
reports a locale outside that registry, the interface safely falls back to
English. You can also choose a supported locale explicitly in plugin settings.

## A task was saved as pending-create

The plugin could not reach Todoist during creation. Keep the note in place and run **Sync now** when online. The stored idempotency key is used for retry and duplicate prevention.

## A conflict note appeared

Todoist and the local managed state changed since the previous synchronization. Todoist's version was applied to the task note, while the displaced local file was copied to `_Conflicts`. Review the copy and manually restore any value you still want.

## An inactive task note disappeared

Completed, inactive, and remotely deleted tasks are not kept in the managed
task-note tree. After a successful synchronization, their notes are moved using
Obsidian's configured trash behavior and can be recovered from that trash when
needed. A note detached manually while its Todoist task remains active stays
local and is excluded from active synchronization.

## The dashboard does not appear

Confirm that the fenced code block is exactly `todoist-task-notes`, that the
plugin is enabled, and that a successful synchronization has loaded tasks. Use
**Todoist: Add dashboard** in the Command Palette, or type
`/todoist: add dashboard` in the editor. Then use **Sync now** and review any
displayed last-sync error.

