# Product Capabilities Page Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精准还原产品能力页设计稿，提升 01–07 mockup 质感，并加入无障碍、无滚动劫持的分层 Reveal 动画。

**Architecture:** 保留现有页面 DOM 与导航组件，在产品能力页内增加专属客户端 Reveal 管理器，通过 data 属性标记分层动画。视觉调整集中在 `globals.css` 的 `.cap-*` 作用域；页面组件只补充展示细节、avatar 与图表语义结构。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、IntersectionObserver、Vitest、应用内 Browser。

---

### Task 1: 产品能力页 Reveal 行为

**Files:**
- Create: `apps/web/src/components/CapabilitiesRevealManager.tsx`
- Create: `apps/web/src/components/CapabilitiesRevealManager.test.tsx`
- Modify: `apps/web/src/app/capabilities/page.tsx`

- [ ] **Step 1: 写失败测试**

测试 `IntersectionObserver` 可用时为 `.cap-reveal-section` 添加观察，进入视口后添加 `is-visible`，并在 reduced motion 时直接显示。

- [ ] **Step 2: 验证测试失败**

Run: `pnpm --filter @hirescope/web test -- CapabilitiesRevealManager.test.tsx`
Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现最小管理器**

组件在 `useEffect` 内查询产品能力页节点，设置 `data-cap-reveal-ready`，使用阈值约 `0.12` 的 `IntersectionObserver`，每个 section 显示一次后取消观察；无 API 或 reduced motion 时直接添加 `is-visible`。

- [ ] **Step 4: 标记动画层**

在产品能力页根节点挂载管理器；section 使用 `.cap-reveal-section`，左侧标题、说明、功能点和右侧 mockup 使用 `data-cap-reveal-item` 与 `data-cap-reveal-delay`。

- [ ] **Step 5: 运行测试**

Run: `pnpm --filter @hirescope/web test -- CapabilitiesRevealManager.test.tsx page.test.ts`
Expected: PASS。

### Task 2: 首屏和通用视觉系统

**Files:**
- Modify: `apps/web/src/app/capabilities/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/capabilities/page.test.ts`

- [ ] **Step 1: 扩充静态契约测试**

断言页面包含专属 Reveal 标记、不可拆分的“能力报告”文本包装、流程闭环结构、avatar 和图表数据标签。

- [ ] **Step 2: 调整首屏 DOM**

为标题关键短语增加 `white-space: nowrap` 包装；保留六步顺序，补充流程轨道语义类；不改变可见文案含义。

- [ ] **Step 3: 精修通用 CSS**

将容器扩至接近设计稿比例，首屏左右列约 `43% / 57%`；统一 `.product-window`、`.mini-product-card`、`.cap-feature` 的边框、圆角、阴影、字体和间距。

- [ ] **Step 4: 实现 Reveal CSS**

仅在 `data-cap-reveal-ready` 后启用 `opacity: 0` 与 `translateY(28px)`；可见时以 `600ms cubic-bezier(0.22,1,0.36,1)` 复位，mockup 延迟 `140ms`。

- [ ] **Step 5: 加入兼容规则**

`prefers-reduced-motion: reduce` 和 `max-width: 760px` 下取消透明度、位移、延迟和过渡；确保移动端无页面级横向溢出。

### Task 3: 01–05 mockup 细节

**Files:**
- Modify: `apps/web/src/app/capabilities/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: 精修项目与审查窗口**

优化侧栏激活态、代码行、评分状态点、AI 建议列表和内容分隔，使 01/02 接近设计稿后台密度。

- [ ] **Step 2: 精修面试与报告窗口**

补强消息头像、时间、输入状态、评分进度条、雷达图网格、报告摘要和优缺点列表。

- [ ] **Step 3: 精修分享窗口**

统一表单控件、复选状态、有效期、开关、链接预览、主按钮和危险按钮视觉层级。

- [ ] **Step 4: 运行静态测试和类型检查**

Run: `pnpm --filter @hirescope/web test && pnpm --filter @hirescope/web typecheck`
Expected: PASS。

### Task 4: 06 avatar 与 07 数据图表

**Files:**
- Modify: `apps/web/src/app/capabilities/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: 替换候选人 avatar**

使用产品能力页内联、可访问的精致人物 avatar 图形，不新增远程依赖；保持设计稿人物照片式层次和稳定尺寸。

- [ ] **Step 2: 重做统计卡**

为四项数据加入图标容器、趋势标签和稳定的数字层级。

- [ ] **Step 3: 重做趋势图**

SVG 加入网格线、面积渐变、折线节点、当前点提示与日期标签。

- [ ] **Step 4: 重做条形图**

明确名称、轨道、数值和克制蓝色层级，保持 TOP 5 数据清晰。

### Task 5: 完整验证与范围审计

**Files:**
- Verify: `apps/web/src/app/capabilities/page.tsx`
- Verify: `apps/web/src/components/CapabilitiesRevealManager.tsx`
- Verify: `apps/web/src/app/globals.css`

- [ ] **Step 1: 自动化检查**

Run: `pnpm --filter @hirescope/web test && pnpm --filter @hirescope/web typecheck && pnpm --filter @hirescope/web lint && pnpm --filter @hirescope/web build`
Expected: 全部通过。

- [ ] **Step 2: 桌面端浏览器 QA**

验证首屏、01–07 section、标题换行、自然滚动、Reveal 分层、06 avatar、07 图表和控制台。

- [ ] **Step 3: 移动端与 reduced motion QA**

使用移动视口确认无页面横向溢出、位移动画和延迟已取消；模拟 reduced motion 确认内容直接显示。

- [ ] **Step 4: 设计稿对照**

保存实现截图到仓库外临时目录，使用 `view_image` 对照完整稿和关键分区稿，修复布局、字体、色彩、mockup、06、07 至无重大偏差。

- [ ] **Step 5: 范围审计**

Run: `git diff --name-only`
Expected: 本任务仅新增/修改产品能力页、其专属 Reveal、测试、规格和计划；现有首页未提交文件保持原样。
