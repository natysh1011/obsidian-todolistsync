# Security and privacy

## API token

Tokens saved by Todoist Task Notes use Obsidian SecretStorage. The plugin does not write the token to `data.json`, Markdown notes, logs, Git, release files, or the documentation site. The token field never reveals an existing value.

The plugin can fall back to the SecretStorage token already configured by Todoist Sync. Removing this plugin's token does not remove or change the other plugin's credential.

Treat a Todoist API token like a password: do not paste it into a task note, screenshot, issue, or chat. Revoke and replace it from Todoist if it is exposed.

## Network access

The plugin communicates with Todoist's API to list and update task data. The documentation website is a static GitHub Pages site with no analytics, sign-in, or task-data collection.

## Safe synchronization rules

- The initial import is pull-only.
- Missing local notes never delete remote tasks.
- Remote deletions retain a detached local note.
- Simultaneous changes produce a conflict copy.
- Free-form `## Notes` content is preserved.

