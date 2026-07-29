import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import ImagePlayground from "../components/ImagePlayground.vue";
import "./theme.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("ImagePlayground", ImagePlayground);
  },
} satisfies Theme;
