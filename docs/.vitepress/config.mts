import { defineConfig } from "vitepress";

const repositoryUrl = "https://github.com/natysh1011/obsidian-todolistsync";

const englishSidebar = [
  {
    text: "Start here",
    items: [
      { text: "Overview", link: "/guide/overview" },
      { text: "Install and connect", link: "/guide/setup" },
      { text: "Settings", link: "/guide/settings" },
    ],
  },
  {
    text: "Use the plugin",
    items: [
      { text: "Task notes", link: "/guide/task-notes" },
      { text: "Create tasks", link: "/guide/create-tasks" },
      { text: "Dashboard", link: "/guide/dashboard" },
      { text: "Synchronization", link: "/guide/synchronization" },
      { text: "Commands", link: "/guide/commands" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "Security and privacy", link: "/reference/security" },
      { text: "Troubleshooting", link: "/reference/troubleshooting" },
      { text: "Release 1.0.1", link: "/reference/release-1.0.1" },
    ],
  },
];

const hebrewSidebar = [
  {
    text: "מתחילים כאן",
    items: [
      { text: "סקירה", link: "/he/guide/overview" },
      { text: "התקנה וחיבור", link: "/he/guide/setup" },
      { text: "הגדרות", link: "/he/guide/settings" },
    ],
  },
  {
    text: "שימוש בפלאגין",
    items: [
      { text: "פתקי משימות", link: "/he/guide/task-notes" },
      { text: "יצירת משימות", link: "/he/guide/create-tasks" },
      { text: "דשבורד", link: "/he/guide/dashboard" },
      { text: "סנכרון", link: "/he/guide/synchronization" },
      { text: "פקודות", link: "/he/guide/commands" },
    ],
  },
  {
    text: "מידע נוסף",
    items: [
      { text: "אבטחה ופרטיות", link: "/he/reference/security" },
      { text: "פתרון תקלות", link: "/he/reference/troubleshooting" },
      { text: "גרסה 1.0.1", link: "/he/reference/release-1.0.1" },
    ],
  },
];

export default defineConfig({
  base: "/obsidian-todolistsync/",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://natysh1011.github.io/obsidian-todolistsync/",
  },
  head: [
    ["link", { rel: "icon", href: "/obsidian-todolistsync/logo.svg" }],
    ["meta", { name: "theme-color", content: "#6d4aff" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      dir: "ltr",
      title: "Todoist Task Notes",
      description: "Hierarchical Todoist task notes, synchronization, and dashboards.",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/overview" },
          { text: "Dashboard", link: "/guide/dashboard" },
          { text: "1.0.1", link: "/reference/release-1.0.1" },
        ],
        sidebar: englishSidebar,
        outline: { label: "On this page" },
        docFooter: { prev: "Previous", next: "Next" },
        lastUpdated: { text: "Last updated" },
        editLink: {
          pattern: `${repositoryUrl}/edit/main/docs/:path`,
          text: "Edit this page on GitHub",
        },
        footer: {
          message: "Released under the MIT License.",
          copyright: "Todoist Task Notes",
        },
        returnToTopLabel: "Back to top",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Appearance",
        lightModeSwitchTitle: "Switch to light theme",
        darkModeSwitchTitle: "Switch to dark theme",
        langMenuLabel: "Change language",
        skipToContentLabel: "Skip to content",
      },
    },
    he: {
      label: "עברית",
      lang: "he",
      dir: "rtl",
      link: "/he/",
      title: "Todoist Task Notes",
      description: "פתקי משימות היררכיים, סנכרון ודשבורד ל־Todoist.",
      themeConfig: {
        nav: [
          { text: "מדריך", link: "/he/guide/overview" },
          { text: "דשבורד", link: "/he/guide/dashboard" },
          { text: "1.0.1", link: "/he/reference/release-1.0.1" },
        ],
        sidebar: hebrewSidebar,
        outline: { label: "בעמוד זה" },
        docFooter: { prev: "הקודם", next: "הבא" },
        lastUpdated: { text: "עודכן לאחרונה" },
        editLink: {
          pattern: `${repositoryUrl}/edit/main/docs/:path`,
          text: "עריכת העמוד ב־GitHub",
        },
        footer: {
          message: "מופץ ברישיון MIT.",
          copyright: "Todoist Task Notes",
        },
        returnToTopLabel: "חזרה למעלה",
        sidebarMenuLabel: "תפריט",
        darkModeSwitchLabel: "תצוגה",
        lightModeSwitchTitle: "מעבר לתצוגה בהירה",
        darkModeSwitchTitle: "מעבר לתצוגה כהה",
        langMenuLabel: "שינוי שפה",
        skipToContentLabel: "דילוג לתוכן",
        notFound: {
          title: "העמוד לא נמצא",
          quote: "ייתכן שהקישור השתנה או שהעמוד אינו קיים.",
          link: "/he/",
          linkLabel: "חזרה לעמוד הבית",
          linkText: "חזרה לעמוד הבית",
        },
      },
    },
  },
  themeConfig: {
    search: {
      provider: "local",
      options: {
        locales: {
          he: {
            translations: {
              button: {
                buttonText: "חיפוש",
                buttonAriaLabel: "חיפוש בתיעוד",
              },
              modal: {
                displayDetails: "הצגת פירוט",
                resetButtonTitle: "איפוס החיפוש",
                backButtonTitle: "סגירת החיפוש",
                noResultsText: "לא נמצאו תוצאות",
                footer: {
                  selectText: "בחירה",
                  selectKeyAriaLabel: "Enter לבחירה",
                  navigateText: "ניווט",
                  navigateUpKeyAriaLabel: "חץ למעלה",
                  navigateDownKeyAriaLabel: "חץ למטה",
                  closeText: "סגירה",
                  closeKeyAriaLabel: "Escape לסגירה",
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: "github", link: repositoryUrl }],
  },
});
