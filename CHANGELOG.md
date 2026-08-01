# Changelog

## 1.0.1 — 2026-08-01

- Added a typed localization system for all user-facing plugin text.
- Added separate JSON files for 73 planned locales under `translate/`.
- Enabled complete English and Hebrew interfaces; all other locales remain
  visible but unavailable until their translations and documentation are ready.
- Added system-language resolution with safe English fallback.
- Added runtime LTR/RTL direction, locale-aware date formatting, interpolation,
  pluralization, and native language names.
- Added secure in-plugin controls to save, replace, test, and remove a Todoist
  API token without displaying or writing it to plugin data.
- Preserved automatic fallback to the token stored by Todoist Sync without
  changing that shared token.
- Localized task creation, dashboards, settings, notices, accessibility labels,
  task-note details, and conflict notes.
- Added locale generation/validation scripts, tests, and CI/release gates.

## 1.0.0 — 2026-08-01

- Initial public release with hierarchical Todoist task notes, two-way sync,
  offline creation, conflicts, task actions, and the collapsible dashboard.
