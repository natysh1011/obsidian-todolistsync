import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress/client";
import DashboardPreview from "./DashboardPreview.vue";
import HomeLayout from "./HomeLayout.vue";
import Layout from "./Layout.vue";
import "./custom.css";

const theme: Theme = {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("DashboardPreview", DashboardPreview);
    app.component("home", HomeLayout);
  },
};

export default theme;
