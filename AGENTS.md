# HireScope AI Agent 指南

## 1. 项目与范围

HireScope AI 是面向 User 端的 AI 项目代码审查与模拟面试平台，核心流程为：注册登录 → 上传 ZIP 项目 → 项目分析 → AI 代码审查 → AI 模拟面试 → 查看报告。

除非任务明确要求，不扩展 Interviewer、Admin、移动端或平板端功能。

## 2. 当前架构

- Monorepo：Node.js 22、pnpm 11.7.0、TypeScript 5.9、pnpm workspace。
- Web：`apps/web`，Next.js 16、React 19；负责页面、交互和 `/api/*` 转发。
- API：`apps/api`，NestJS 11、Prisma 6、JWT/Passport；负责认证、权限、业务接口、持久化和任务入队。
- Worker：`apps/worker`，BullMQ；负责项目分析、代码审查、面试题和报告等异步任务。
- 共享契约：`packages/shared-types`，集中维护跨端类型和 Zod Schema。
- 数据与队列：PostgreSQL 16、Redis 7。
- AI：DeepSeek OpenAI-compatible API；输出必须经过结构校验，并保留确定性回退。
- 运行环境：Docker Compose。生产环境只对外暴露 Web，API、Worker、PostgreSQL、Redis 在内部网络通信。

保持 Web、API、Service/Worker、数据库访问、共享契约和 AI Prompt 的职责边界，不把核心业务逻辑堆入页面组件或 Controller。

## 3. 核心约束

### 修改边界

- 先读取实际配置和相关实现，再修改；以 `package.json`、README 和当前代码为准，不猜测文件、接口或命令。
- 只改任务所需的最小范围；复用已有组件、工具、service 和共享类型，不引入无关依赖，不格式化无关文件。
- 保留用户已有和未提交的改动。未经明确要求，不执行提交、推送、合并、重置、stash、分支删除或大范围重构。
- 修改 `.env*`、依赖与 lockfile、Prisma Schema/migration、Docker、认证、数据库或 AI 基础设施前，先确认影响范围。
- 不提交 `.env`、上传文件、日志、测试/构建产物、`.next`、`dist`、`build` 或 `node_modules`。

### 数据、安全与上传

- 所有用户资源访问必须在服务端校验身份和 `userId` 归属。
- 密码使用安全哈希；日志不得包含密码、Token、API Key、源码机密或其他凭据。
- 所有输入和 AI 输出都必须校验；错误响应不得泄露敏感配置或内部细节。
- ZIP 上传必须限制类型、文件大小、单文件与总解压大小，防止 Zip Slip，并跳过 `.git`、`node_modules`、`dist`、`build`、`.next`、二进制和超大文件。
- 不随意修改既有 migration；Schema 变更必须创建新 migration，并验证数据库约束。

### AI 与异步任务

- Prompt 集中管理，不一次性发送整个项目源码；使用受控、有限、可追溯的上下文。
- 模型引用的路径和证据必须来自真实项目文件；拒绝虚构路径、无效 JSON 和缺失关键字段的输出。
- 重要 AI 调用记录必要元数据，但不记录源码全文和凭据。
- API 先持久化业务对象与任务状态，再入队；Worker 处理器保持幂等，失败和重试不得制造重复业务记录或虚假成功状态。

### 前端范围

- 默认只适配 PC 桌面端，重点覆盖 `1280px`、`1440px`、`1600px`、`1920px`。
- 使用弹性布局和 `max-width`，不按 `1920px` 固定写死。
- 未明确要求时，不新增移动端导航、抽屉、触摸交互或移动端媒体查询；小于 `1024px` 可保持最小宽度或提示使用电脑访问。

## 4. 开发流程

1. 检查 Git 状态、相关配置、受影响模块和现有测试，避免覆盖无关改动。
2. 按现有分层和契约实施最小修改；涉及认证、上传、AI、队列或数据库时同步检查对应安全边界。
3. 先运行最小必要的定向测试和 typecheck；改动范围较大或任务明确要求时，再运行完整矩阵。
4. 失败时只读取定位所需日志；修复后重跑直接相关检查。长命令设置合理 timeout，避免重复轮询。
5. 完成后执行 `git diff --check`，确认无敏感信息、构建产物和无关修改，并简要汇报变更、检查及剩余风险。

本地开发基线：

```powershell
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm db:deploy
pnpm api:dev
pnpm worker:dev
pnpm --filter @hirescope/web dev -- --port 4200
```

生产迁移使用 `pnpm db:deploy`；不得在生产环境运行 `pnpm db:migrate` 或 `pnpm db:reset`。

## 5. 测试命令

按改动范围选择：

```powershell
# Prisma 与共享契约
pnpm db:validate
pnpm db:generate
pnpm --filter @hirescope/shared-types test

# Web
pnpm --filter @hirescope/web lint
pnpm --filter @hirescope/web typecheck
pnpm --filter @hirescope/web test
pnpm --filter @hirescope/web build

# API
pnpm api:typecheck
pnpm api:test
pnpm api:build
pnpm api:test:e2e

# Worker
pnpm worker:typecheck
pnpm worker:test
pnpm worker:build
pnpm worker:test:integration

# 浏览器 E2E 与数据库约束
pnpm test:e2e
pnpm db:test

# 文本与补丁检查
git diff --check
```

`api:test:e2e`、`worker:test:integration`、`test:e2e` 和 `db:test` 依赖隔离的 PostgreSQL/Redis 测试环境；环境配置以 `.github/workflows/ci.yml` 为准。`tests/e2e/run-e2e-tests.ts` 会操作测试数据库和 Redis 测试 DB，运行前必须确认目标是测试环境。
