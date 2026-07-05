# 全站 SiteHeader 统一设计

## 目标

首页、产品能力页和登录页统一使用一套 `SiteHeader` 视觉样式。以产品能力页设计稿导航栏为基准，保持轻、干净、左侧 Logo 更靠外、导航与右侧操作稳定对齐。

## 唯一视觉契约

- 全站只保留一套 `.site-header`、`.header-inner`、`.brand`、`.logo`、`.desktop-nav`、`.header-actions` 和 `.header-cta` 样式。
- 所有页面使用完全相同的高度、最大宽度、左右内边距、三列网格、Logo 尺寸、导航间距、字体、字重和右侧操作间距。
- 页面之间只允许 `current` 产生的 `.active` 项和下划线不同。
- 登录页 active 状态只复用现有 `SiteHeader current="login"` 机制，不新增或修改导航逻辑；首页作用于“首页”，产品能力页作用于“产品能力”。

## CSS 清理

- 删除 `.site-header:has(+ .home-page)` 及其后代 header/nav/logo 覆盖。
- 删除 `.login-page .site-header`、`.login-page .header-inner`、`.login-page .desktop-nav`、`.login-page .header-actions` 和 `.login-page .logo-*` 的视觉覆盖。
- 产品能力页不得新增或保留任何影响 `.site-header`、导航或 Logo 的页面级规则。
- 登录页主体仍可依据统一 header 高度使用布局变量，但不得重新定义导航栏视觉。

## 范围限制

- 不修改 `SiteHeader` 导航数据、链接、认证状态逻辑或 active 判断。
- 不修改首页、产品能力页、登录表单和登录页主体内容。
- 不修改路由、接口、业务逻辑或全局状态。
- 修改集中在 `globals.css` 的 header 视觉规则与对应静态测试。

## 响应式

- 桌面端三页面使用相同导航栏。
- 既有移动端隐藏桌面导航的行为保持一致。
- 移动端 Logo、右侧登录和立即体验在三页面使用相同尺寸与位置。

## 验证

- 增加静态 CSS 契约测试，仅禁止首页、产品能力页和登录页出现覆盖 header/nav/logo 视觉的页面级选择器；登录页表单、主体网格、页脚等页面布局选择器不在禁止范围内。
- 运行 web tests、typecheck、lint 和 build。
- 使用同一桌面视口分别截图 `/`、`/capabilities`、`/login`。
- 比较 header 边界框、Logo、导航项、字重、间距和右侧操作；除 active 项与下划线外应一致。
- 检查三页面控制台和移动端 header。
