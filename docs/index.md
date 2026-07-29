---
layout: home

hero:
  name: imagemin-rs
  text: Imagemin compatibility, powered by Rust
  tagline: A composable, observable, cross-platform image optimization pipeline running codecs through napi-rs workers.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Open Playground
      link: /playground

features:
  - title: Familiar interface
    details: Keep imagemin(), imagemin.buffer(), and function plugins while gaining a typed optimize() result with per-step statistics.
  - title: CPU-safe native work
    details: Native codecs run in napi-rs AsyncTask workers instead of blocking the JavaScript event loop behind an async wrapper.
  - title: Explicit compatibility
    details: Every adapter documents its upstream target, intentional differences, safety limits, and release evidence.
---
