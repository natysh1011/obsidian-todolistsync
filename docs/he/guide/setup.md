# התקנה וחיבור

## דרישות

- Obsidian בגרסה 1.11.4 ומעלה.
- חשבון Todoist.
- Todoist API token, או token קיים שנשמר בידי הפלאגין Todoist Sync.

## התקנה ידנית

1. פתח את [Release 1.0.1](https://github.com/natysh1011/obsidian-todolistsync/releases/tag/1.0.1).
2. הורד את `todoist-task-notes-1.0.1.zip`.
3. חלץ את `manifest.json`,‏ `main.js` ו־`styles.css` אל `<vault-config>/plugins/todoist-task-notes/`.
4. ב־Obsidian פתח **Settings → Community plugins** והפעל את **Todoist Task Notes**.

`<vault-config>` היא תיקיית ההגדרות שהוגדרה לכספת. בדרך כלל שמה `.obsidian`, אך Obsidian מאפשר לבחור שם אחר לכל כספת.

## הוספה או החלפה של API token

1. ב־Todoist פתח **Settings → Integrations → Developer** והעתק את ה־API token.
2. ב־Obsidian פתח **Settings → Todoist Task Notes**.
3. הדבק את ה־token בשדה **Todoist API token**.
4. לחץ **Save token**. אם כבר שמור token של הפלאגין, הפעולה תיקרא **Replace token**.
5. לחץ **Test connection**.

השדה נשאר ריק בכוונה בכל פתיחה של ההגדרות. token שמור לעולם אינו מוצג שוב. ניתן להסיר רק את ה־token של הפלאגין בלי לשנות token שנשמר בידי Todoist Sync.

## סנכרון ראשון

הפעל **Todoist Task Notes: Sync now**. הסנכרון המוצלח הראשון הוא pull-only: הוא מייבא משימות פעילות ויוצר פתקים בלי לשנות את Todoist. בסנכרונים הבאים ניתן לשלוח שינויים שבוצעו במאפיינים המנוהלים של הפתק.

::: warning לפני הסנכרון הראשון
אל תיצור משימה חדשה דרך הפלאגין לפני שהייבוא הראשוני הצליח. הפלאגין זקוק קודם לנתוני הפרויקטים וההיררכיה העדכניים.
:::

