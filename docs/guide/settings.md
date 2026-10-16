# Settings

Open **Settings → Todoist Task Notes**.

| Setting | Default | Purpose |
| --- | --- | --- |
| Language | System language | Uses an available Obsidian/system language, with English fallback. |
| Task-note root folder | `משימות/Todoist` | Root for project and task hierarchy folders. |
| Dashboard note | `משימות/Untitled.md` | Managed dashboard note; changing this path creates missing folders and the Markdown note immediately. |
| Automatic sync interval | 5 minutes | Runs while Obsidian is open; minimum is one minute. |
| Todoist API token | Empty | Save, replace, or remove this plugin's SecretStorage token. |
| API connection | — | Validates the available token without displaying it. |

## Languages

The selector begins with **System language**, followed by all 73 supported
locales. Each locale uses its native name; for example, Irish is shown as
**Gaeilge**, not a label supplied by the operating system. RTL layouts are
enabled for Arabic, Divehi, Persian, Hebrew, and Urdu. User-authored task content
is never translated.

## Token status

The status line distinguishes between a token saved for Todoist Task Notes, a shared token from Todoist Sync, and no available token. Saving a token here takes precedence. Removing it restores the shared-token fallback when one exists.

## Dashboard note path

Enter a vault-relative Markdown path. The `.md` extension is added when it is
missing. After the field loses focus, the saved path remains visible and the
plugin creates the note with one `todoist-task-notes` block. Existing text is
preserved, and every later synchronization verifies that the configured note
still exists.

