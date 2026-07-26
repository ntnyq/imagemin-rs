import { defineConfig } from "vitepress";

export default defineConfig({
  base: process.env.DOCS_BASE ?? "/",
  cleanUrls: true,
  description: "基于 Rust 与 napi-rs 的 imagemin 兼容图片优化管线。",
  lang: "zh-CN",
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  srcExclude: ["research/**/*.md"],
  themeConfig: {
    editLink: {
      pattern: "https://github.com/ntnyq/imagemin-rs/edit/main/docs/:path",
      text: "在 GitHub 上编辑此页",
    },
    footer: {
      copyright: "Copyright © 2026-PRESENT ntnyq",
      message: "Released under the MIT License.",
    },
    lastUpdated: {
      text: "最后更新",
    },
    nav: [
      { link: "/guide/getting-started", text: "指南" },
      { link: "/api/", text: "API" },
      { link: "/guide/architecture", text: "架构" },
      { link: "/guide/roadmap", text: "路线图" },
    ],
    outline: {
      label: "本页目录",
      level: [2, 3],
    },
    search: {
      provider: "local",
    },
    sidebar: [
      {
        items: [
          { link: "/guide/getting-started", text: "快速开始" },
          { link: "/guide/svg", text: "SVG 优化" },
          { link: "/guide/gif-png", text: "GIF 与无损 PNG" },
          { link: "/guide/pngquant", text: "PNG 有损量化" },
          { link: "/guide/jpeg", text: "JPEG 优化" },
          { link: "/guide/webp", text: "WebP 转码" },
          { link: "/guide/avif", text: "AVIF 转码" },
          { link: "/guide/architecture", text: "项目架构" },
          { link: "/guide/roadmap", text: "分阶段路线图" },
        ],
        text: "指南",
      },
      {
        items: [{ link: "/api/", text: "Node API" }],
        text: "参考",
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/ntnyq/imagemin-rs" }],
  },
  title: "imagemin-rs",
});
