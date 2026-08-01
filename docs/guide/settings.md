# Settings

Open **Settings → Todoist Task Notes**.

| Setting | Default | Purpose |
| --- | --- | --- |
| Language | System language | Uses an available Obsidian/system language, with English fallback. |
| Task-note root folder | `משימות/Todoist` | Root for project and task hierarchy folders. |
| Dashboard note | `משימות/Untitled.md` | Note that receives the managed dashboard actions block. |
| Automatic sync interval | 5 minutes | Runs while Obsidian is open; minimum is one minute. |
| Todoist API token | Empty | Save, replace, or remove this plugin's SecretStorage token. |
| API connection | — | Validates the available token without displaying it. |

## Languages

The selector shows available choices first:

1. **System language**
2. **English**
3. **עברית**

All planned but incomplete translations appear afterward in alphabetical order, using each language's native name, and are disabled. For example, Irish is shown as **Gaeilge**, not a translation supplied by the operating system.

Only English and Hebrew can be selected in 1.0.1. Hebrew mirrors the interface for RTL. User-authored task content is never translated.

## Token status

The status line distinguishes between a token saved for Todoist Task Notes, a shared token from Todoist Sync, and no available token. Saving a token here takes precedence. Removing it restores the shared-token fallback when one exists.

