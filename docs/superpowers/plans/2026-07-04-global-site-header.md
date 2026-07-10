# Global SiteHeader Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页、产品能力页和登录页使用完全相同的 SiteHeader 视觉，只保留 active 项差异。

**Architecture:** 保持 `SiteHeader.tsx` 及 `current` 机制不变，将唯一导航视觉契约集中到全局基础选择器。删除首页和登录页的 header/nav/logo 页面级覆盖，并用静态 CSS 测试防止回归。

**Tech Stack:** Next.js 16、React 19、CSS、Vitest、应用内 Browser。

---

### Task 1: Header 样式隔离契约

**Files:**
- Create: `apps/web/src/app/site-header-styles.test.ts`
- Verify: `apps/web/src/components/SiteHeader.tsx`

- [ ] 写测试读取 `globals.css`，断言不存在 `.site-header:has(+ .home-page)`、`.login-page .site-header`、`.login-page .header-inner`、登录页/首页限定的 nav、actions、brand、logo 视觉选择器。
- [ ] 运行 `pnpm --filter @hirescope/web test -- site-header-styles.test.ts`，确认因现有覆盖规则失败。
- [ ] 断言 `SiteHeader.tsx` 仍包含 `current === item.key` 和 `current === "login"`，且文件不被修改。

### Task 2: 建立唯一 SiteHeader 视觉

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/app/site-header-styles.test.ts`

- [ ] 将基础 header 统一为产品能力设计稿尺寸：统一高度、最大宽度、左右 padding、三列宽度、Logo、导航 gap、15px 导航字体和右侧 actions。
- [ ] 删除首页 `:has` header 覆盖和登录页 header/nav/logo 覆盖，保留登录主体、表单、页脚布局规则。
- [ ] 保持移动端统一规则，三页面共享相同 Logo 与 actions 尺寸。
- [ ] 运行 header 契约测试和现有 `SiteHeader.test.tsx`，确认通过。

### Task 3: 自动化与三页面视觉验证

**Files:**
- Verify: `apps/web/src/app/globals.css`
- Verify: `apps/web/src/components/SiteHeader.tsx`

- [ ] 运行 `pnpm --filter @hirescope/web test && pnpm --filter @hirescope/web typecheck && pnpm --filter @hirescope/web lint && pnpm --filter @hirescope/web build`。
- [ ] 在相同桌面视口截图 `/`、`/capabilities`、`/login`，采集 header、Logo、nav、actions 边界框与计算样式。
- [ ] 对比三页面，除 active 项和下划线外边界框与样式一致。
- [ ] 检查移动端和控制台，复核 diff 未修改页面内容、路由、接口或业务逻辑。
