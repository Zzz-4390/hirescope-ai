# SiteHeader Logo Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复参考图中的多段斜向 Logo 和轻量导航字重，同时保持全站唯一 SiteHeader。

**Architecture:** `Logo.tsx` 仅负责品牌 SVG 与文字结构；`globals.css` 的唯一全局 SiteHeader 区块负责尺寸和字重。静态测试验证结构与样式契约，不锁死坐标。

**Tech Stack:** React、TypeScript、SVG、CSS、Vitest、Browser。

---

### Task 1: Logo 与字重契约

**Files:**
- Modify: `apps/web/src/components/Logo.test.tsx`
- Modify: `apps/web/src/app/site-header-styles.test.ts`

- [ ] 测试 Logo 至少包含 5 个 `path`，不再包含旧的 3 个旋转 `rect`。
- [ ] 测试全局导航 `font-weight:400`、CTA `font-weight:500`、中文 `18px/650`、英文 `9px/400`。
- [ ] 运行测试确认旧实现失败。

### Task 2: SVG 与全局样式实现

**Files:**
- Modify: `apps/web/src/components/Logo.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] 用多段圆角 path 重绘斜向结构，保持 `viewBox` 和渐变。
- [ ] 调整品牌文字、主导航、登录和 CTA 字重。
- [ ] 运行契约测试与 `SiteHeader` 测试。

### Task 3: 完整验证

- [ ] 运行 web test、typecheck、lint、build。
- [ ] 同一桌面视口截图首页、产品能力页、登录页，比较几何和计算样式。
- [ ] 对照参考图审查 Logo 节奏与导航轻量感，审计无页面级 header 覆盖和导航逻辑修改。
