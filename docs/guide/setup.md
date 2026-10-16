# Install and connect

## Requirements

- Obsidian 1.11.4 or newer.
- A Todoist account.
- A Todoist API token, or an existing token stored by the Todoist Sync plugin.

## Manual installation

1. Open the [1.0.2 release](https://github.com/natysh1011/obsidian-todolistsync/releases/tag/1.0.2).
2. Download `todoist-task-notes-1.0.2.zip`.
3. Extract `manifest.json`, `main.js`, and `styles.css` into `<vault-config>/plugins/todoist-task-notes/`.
4. In Obsidian, open **Settings → Community plugins** and enable **Todoist Task Notes**.

`<vault-config>` is the vault's configured settings folder. It is commonly `.obsidian`, but Obsidian lets each vault use a different name.

## Add or replace the API token

1. In Todoist, open **Settings → Integrations → Developer** and copy the API token.
2. In Obsidian, open **Settings → Todoist Task Notes**.
3. Paste the token into **Todoist API token**.
4. Select **Save token**. If a token already belongs to this plugin, the action is labeled **Replace token**.
5. Select **Test connection**.

The field is intentionally blank whenever settings opens. A stored token is never revealed again. You can remove only this plugin's token without changing a token owned by Todoist Sync.

## First synchronization

Run **Todoist Task Notes: Sync now**. The first successful synchronization is pull-only: it imports active tasks and creates notes without modifying Todoist. Later synchronizations can send changes made to managed note properties.

::: warning Before the first sync
Do not create a new task through the plugin until the initial pull has succeeded. The plugin needs the current project and hierarchy data first.
:::

