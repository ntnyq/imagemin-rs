import { defineConfig } from "vitepress";

export default defineConfig({
  cleanUrls: true,
  description: "An imagemin-compatible image optimization pipeline powered by Rust and napi-rs.",
  head: [["link", { href: "/favicon.svg", rel: "icon", type: "image/svg+xml" }]],
  lastUpdated: true,
  locales: {
    root: {
      description:
        "An imagemin-compatible image optimization pipeline powered by Rust and napi-rs.",
      label: "English",
      lang: "en-US",
      themeConfig: {
        editLink: {
          pattern: "https://github.com/ntnyq/imagemin-rs/edit/main/docs/:path",
          text: "Edit this page on GitHub",
        },
        lastUpdated: { text: "Last updated" },
        nav: [
          { link: "/guide/getting-started", text: "Guide" },
          { link: "/api/", text: "API" },
          { link: "/playground", text: "Playground" },
          { link: "/guide/architecture", text: "Architecture" },
          { link: "/guide/roadmap", text: "Roadmap" },
        ],
        outline: { label: "On this page", level: [2, 3] },
        sidebar: [
          {
            items: [
              { link: "/guide/getting-started", text: "Quick Start" },
              { link: "/guide/browser-wasm", text: "Browser & Web Worker" },
              { link: "/guide/migration-from-imagemin", text: "Migration" },
              { link: "/guide/troubleshooting", text: "Troubleshooting" },
              { link: "/guide/platform-support", text: "Platform Support" },
              { link: "/guide/public-trial", text: "1.0 Public Trial" },
              { link: "/guide/svg", text: "SVG Optimization" },
              { link: "/guide/gif-png", text: "GIF & Lossless PNG" },
              { link: "/guide/pngquant", text: "Lossy PNG Quantization" },
              { link: "/guide/jpeg", text: "JPEG Optimization" },
              { link: "/guide/webp", text: "WebP Conversion" },
              { link: "/guide/avif", text: "AVIF Conversion" },
              { link: "/guide/architecture", text: "Architecture" },
              { link: "/guide/roadmap", text: "Roadmap" },
            ],
            text: "Guide",
          },
          {
            items: [
              { link: "/api/", text: "Node API" },
              { link: "/api/wasm", text: "Browser WASM API" },
            ],
            text: "Reference",
          },
        ],
      },
      title: "imagemin-rs",
    },
    zh: {
      description: "基于 Rust 与 napi-rs 的 imagemin 兼容图片优化管线。",
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      themeConfig: {
        editLink: {
          pattern: "https://github.com/ntnyq/imagemin-rs/edit/main/docs/:path",
          text: "在 GitHub 上编辑此页",
        },
        lastUpdated: { text: "最后更新" },
        nav: [
          { link: "/zh/guide/getting-started", text: "指南" },
          { link: "/zh/api/", text: "API" },
          { link: "/zh/playground", text: "Playground" },
          { link: "/zh/guide/architecture", text: "架构" },
          { link: "/zh/guide/roadmap", text: "路线图" },
        ],
        outline: { label: "本页目录", level: [2, 3] },
        sidebar: [
          {
            items: [
              { link: "/zh/guide/getting-started", text: "快速开始" },
              { link: "/zh/guide/browser-wasm", text: "浏览器与 Web Worker" },
              { link: "/zh/guide/migration-from-imagemin", text: "迁移指南" },
              { link: "/zh/guide/troubleshooting", text: "安装与运行排错" },
              { link: "/zh/guide/platform-support", text: "平台支持政策" },
              { link: "/zh/guide/public-trial", text: "1.0 公开试用" },
              { link: "/zh/guide/svg", text: "SVG 优化" },
              { link: "/zh/guide/gif-png", text: "GIF 与无损 PNG" },
              { link: "/zh/guide/pngquant", text: "PNG 有损量化" },
              { link: "/zh/guide/jpeg", text: "JPEG 优化" },
              { link: "/zh/guide/webp", text: "WebP 转码" },
              { link: "/zh/guide/avif", text: "AVIF 转码" },
              { link: "/zh/guide/architecture", text: "项目架构" },
              { link: "/zh/guide/roadmap", text: "路线图" },
            ],
            text: "指南",
          },
          {
            items: [
              { link: "/zh/api/", text: "Node API" },
              { link: "/zh/api/wasm", text: "浏览器 WASM API" },
            ],
            text: "参考",
          },
        ],
      },
      title: "imagemin-rs",
    },
  },
  markdown: { lineNumbers: true },
  sitemap: {
    hostname: "https://imagemin-rs.ntnyq.dev",
  },
  srcExclude: ["research/**/*.md"],
  themeConfig: {
    footer: {
      copyright: "Copyright © 2026-PRESENT ntnyq",
      message: "Released under the MIT License.",
    },
    search: {
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonAriaLabel: "搜索",
                buttonText: "搜索",
              },
              modal: {
                displayDetails: "显示详情",
                footer: {
                  closeKeyAriaLabel: "关闭",
                  closeText: "关闭",
                  navigateDownKeyAriaLabel: "向下",
                  navigateText: "切换",
                  navigateUpKeyAriaLabel: "向上",
                  selectKeyAriaLabel: "选择",
                  selectText: "选择",
                },
                noResultsText: "没有找到结果",
                resetButtonTitle: "重置搜索",
              },
            },
          },
        },
      },
      provider: "local",
    },
    socialLinks: [{ icon: "github", link: "https://github.com/ntnyq/imagemin-rs" }],
  },
  title: "imagemin-rs",
  vite: {
    worker: {
      format: "es",
    },
  },
});
