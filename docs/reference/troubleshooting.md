# Troubleshooting

## No token is available

Open **Settings → Todoist Task Notes**, paste a new token, select **Save token**, then **Test connection**. If the plugin reports a shared token, it is using Todoist Sync's secure credential.

## The connection test fails

Confirm that the token is current in Todoist's Developer integration settings. Replace it in the plugin and retry. Also check connectivity, Todoist service status, and whether a firewall blocks API requests.

## A language is disabled

Only English and Hebrew have complete translations in 1.0.1. Other native language names are visible to show the translation registry, but cannot be selected until their message catalogs are complete.

## A task was saved as pending-create

The plugin could not reach Todoist during creation. Keep the note in place and run **Sync now** when online. The stored idempotency key is used for retry and duplicate prevention.

## A conflict note appeared

Todoist and the local managed state changed since the previous synchronization. Todoist's version was applied to the task note, while the displaced local file was copied to `_Conflicts`. Review the copy and manually restore any value you still want.

## A note is detached

The corresponding remote task stayed unavailable across repeated synchronizations, or you detached it manually. The note remains local and is excluded from active synchronization and dashboard counts.

## The dashboard does not appear

Confirm that the fenced code block is exactly `todoist-task-notes`, that the plugin is enabled, and that a successful synchronization has loaded tasks. Use **Sync now** and review any displayed last-sync error.

