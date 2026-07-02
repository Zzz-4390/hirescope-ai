# HireScope AI User MVP 数据库与 API 设计

## 1. 范围

本设计仅覆盖求职者 User MVP 的数据库与 REST API，不包含管理员端、面试官端、复杂 RBAC、前端路由和具体实现代码。

系统边界：

- PostgreSQL 是最终业务数据来源。
- Redis 用于 BullMQ、Refresh Token 和短期任务运行缓存。
- ZIP 与解压文件保存在 Docker Volume。
- API 负责认证、上传、查询、状态变更和创建任务。
- Worker 不提供 HTTP 业务接口，只消费 BullMQ 任务并写回 PostgreSQL。

## 2. 命名与通用约定

- Prisma 模型使用单数 `PascalCase`，数据库表通过 `@@map` 映射为小写复数。
- 数据库列使用 `snake_case`，Prisma 字段使用 `camelCase` 并通过 `@map` 映射。
- 主键使用 UUID。
- 所有时间列使用 `TIMESTAMPTZ`。
- 所有 User 业务资源访问必须在服务端校验 `user_id`。
- JSONB 写入前必须通过固定 DTO 或 Zod Schema 校验，不保存未经校验的 AI 原始输出。
- 面向用户的失败信息使用稳定的 `failure_code` 和脱敏后的 `failure_message`。

## 3. 枚举

### 3.1 ProjectStatus

```text
UPLOADED
QUEUED
ANALYZING
COMPLETED
FAILED
DELETING
DELETED
```

状态语义：

- `UPLOADED`：ZIP 已完成校验并持久化，数据库项目及任务记录已创建，但 BullMQ 尚未投递成功。
- `QUEUED`：分析任务已成功投递 BullMQ，等待 Worker 消费。
- `ANALYZING`：Worker 正在执行安全解压、项目分析或结果写入。
- `COMPLETED`：项目分析结果已成功持久化。
- `FAILED`：项目分析达到最大重试次数后失败。
- `DELETING`：项目已对用户隐藏，文件清理任务正在等待或执行。
- `DELETED`：文件清理完成，存储路径已清空。

允许的主要流转：

```text
UPLOADED --投递成功--> QUEUED --> ANALYZING --> COMPLETED
    |                                |
    +--投递失败：保持本状态           +--> FAILED

UPLOADED / QUEUED / ANALYZING / COMPLETED / FAILED
    --> DELETING --> DELETED
```

队列投递失败时，项目保持 `UPLOADED`，对应任务保持 `PENDING`；补偿扫描成功投递后，两者分别更新为 `QUEUED`。

### 3.2 TaskStatus

```text
PENDING
QUEUED
PROCESSING
SUCCEEDED
FAILED
CANCELLED
```

状态语义：

- `PENDING`：数据库任务已创建，但 BullMQ 任务尚未投递成功。
- `QUEUED`：BullMQ 任务已投递，正在等待 Worker 消费。
- `PROCESSING`：Worker 已领取任务并正在处理。
- `SUCCEEDED`：处理结果及业务终态已成功写入 PostgreSQL。
- `FAILED`：任务达到最大重试次数后失败，失败信息已持久化。
- `CANCELLED`：关联资源已删除或不再允许处理，Worker 主动终止且不写回业务结果。

### 3.3 TaskType

```text
PROJECT_ANALYSIS
CODE_REVIEW
INTERVIEW_QUESTION_GENERATION
INTERVIEW_REPORT_GENERATION
PROJECT_CLEANUP
```

### 3.4 InterviewStatus

```text
GENERATING
READY
IN_PROGRESS
SUBMITTED
REPORT_GENERATING
COMPLETED
FAILED
```

### 3.5 InterviewDifficulty

```text
EASY
MEDIUM
HARD
```

## 4. 数据库表

### 4.1 users

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| email | VARCHAR(320) | NOT NULL, UNIQUE |
| password_hash | VARCHAR | NOT NULL |
| display_name | VARCHAR(100) | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

MVP 不设置 `role` 字段。

邮箱规则：注册和登录输入必须先执行 `trim().toLowerCase()`，数据库只保存规范化后的小写邮箱；唯一约束作用于规范化后的值。MVP 不引入 `CITEXT`。

### 4.2 projects

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK users.id |
| name | VARCHAR(120) | NOT NULL |
| description | TEXT | NULL |
| original_file_name | VARCHAR(255) | NOT NULL |
| zip_storage_path | VARCHAR | NULL |
| extract_storage_path | VARCHAR | NULL |
| file_size | BIGINT | NOT NULL |
| file_hash | VARCHAR(64) | NOT NULL, SHA-256 |
| status | ProjectStatus | NOT NULL |
| failure_code | VARCHAR(100) | NULL |
| failure_message | VARCHAR(500) | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

索引：

- `(user_id, created_at)`
- `(user_id, status)`
- `(user_id, file_hash)`

`DELETED` 项目默认不参与列表和详情查询。清理成功后将两个存储路径置空，保留审计所需元数据。

### 4.3 project_analyses

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| project_id | UUID | NOT NULL, UNIQUE, FK projects.id |
| summary | TEXT | NOT NULL |
| tech_stack | JSONB | NOT NULL |
| directory_tree | JSONB | NOT NULL |
| core_modules | JSONB | NOT NULL |
| entry_files | JSONB | NOT NULL |
| statistics | JSONB | NOT NULL |
| analyzer_version | VARCHAR(50) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

### 4.4 code_reviews

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| project_id | UUID | NOT NULL, FK projects.id |
| user_id | UUID | NOT NULL, FK users.id |
| status | TaskStatus | NOT NULL |
| summary | TEXT | NULL |
| score | INTEGER | NULL, CHECK 0..100 |
| result | JSONB | NULL |
| model | VARCHAR(100) | NULL |
| failure_code | VARCHAR(100) | NULL |
| failure_message | VARCHAR(500) | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |
| completed_at | TIMESTAMPTZ | NULL |

索引：

- `(user_id, created_at)`
- `(project_id, status)`

### 4.5 interviews

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| project_id | UUID | NOT NULL, FK projects.id |
| user_id | UUID | NOT NULL, FK users.id |
| title | VARCHAR(150) | NOT NULL |
| status | InterviewStatus | NOT NULL |
| difficulty | InterviewDifficulty | NOT NULL |
| question_count | INTEGER | NOT NULL, CHECK 5..15 |
| current_index | INTEGER | NOT NULL, DEFAULT 0 |
| failure_code | VARCHAR(100) | NULL |
| failure_message | VARCHAR(500) | NULL |
| started_at | TIMESTAMPTZ | NULL |
| submitted_at | TIMESTAMPTZ | NULL |
| completed_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

索引：

- `(user_id, created_at)`
- `(project_id, status)`

`current_index` 仅用于前端恢复上次浏览或答题位置，不作为完成度事实来源。题目 `sequence` 从 1 开始，`current_index = 0` 表示尚未作答；保存答案时在同一事务中更新为 `max(current_index, question.sequence)`，不单独增加进度接口。真实完成度以 `interview_answers` 中该面试的有效答案数量为准；提交时必须验证答案数量等于 `question_count`。

### 4.6 interview_questions

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| interview_id | UUID | NOT NULL, FK interviews.id |
| sequence | INTEGER | NOT NULL |
| category | VARCHAR(100) | NOT NULL |
| difficulty | InterviewDifficulty | NOT NULL |
| question | TEXT | NOT NULL |
| reference_points | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

唯一约束：`(interview_id, sequence)`。

`reference_points` 不得在答题阶段的 API 响应中返回。

### 4.7 interview_answers

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| question_id | UUID | NOT NULL, UNIQUE, FK interview_questions.id |
| interview_id | UUID | NOT NULL, FK interviews.id |
| user_id | UUID | NOT NULL, FK users.id |
| content | TEXT | NOT NULL |
| answered_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

索引：

- `(interview_id)`
- `(user_id, interview_id)`

保存或覆盖答案前，Service 必须使用 `question_id + interview_id + user_id + IN_PROGRESS` 联合查询，确保问题属于该面试、面试属于当前用户且处于可答题状态。查不到时统一返回 `404`。该校验及答案写入必须在同一事务中完成，不能信任客户端单独提交的 `interview_id`。

### 4.8 interview_reports

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| interview_id | UUID | NOT NULL, UNIQUE, FK interviews.id |
| user_id | UUID | NOT NULL, FK users.id |
| overall_score | INTEGER | NOT NULL, CHECK 0..100 |
| summary | TEXT | NOT NULL |
| dimensions | JSONB | NOT NULL |
| question_reviews | JSONB | NOT NULL |
| strengths | JSONB | NOT NULL |
| improvements | JSONB | NOT NULL |
| result | JSONB | NOT NULL |
| model | VARCHAR(100) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

索引：`(user_id, created_at)`。

### 4.9 async_tasks

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK users.id |
| project_id | UUID | NULL, FK projects.id |
| code_review_id | UUID | NULL, FK code_reviews.id |
| interview_id | UUID | NULL, FK interviews.id |
| type | TaskType | NOT NULL |
| status | TaskStatus | NOT NULL |
| bull_job_id | VARCHAR(100) | NULL, UNIQUE |
| attempts | INTEGER | NOT NULL, DEFAULT 0 |
| progress | INTEGER | NOT NULL, DEFAULT 0, CHECK 0..100 |
| failure_code | VARCHAR(100) | NULL |
| failure_message | VARCHAR(500) | NULL |
| started_at | TIMESTAMPTZ | NULL |
| completed_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

索引：

- `(user_id, status)`
- `(project_id, type)`
- `(type, status)`
- `(code_review_id)`
- `(interview_id)`

BullMQ 的 `jobId` 固定使用 `async_tasks.id` 的 UUID 字符串；投递成功后同值写入 `bull_job_id`。`bull_job_id` 使用唯一约束而不是普通索引，PostgreSQL 允许该可空唯一列存在多个 `NULL`。Worker 只接受任务 ID，并通过该 ID 从 PostgreSQL 查询任务类型和业务关联，不信任队列 payload 中重复携带的业务参数。

业务规则要求任务至少关联一个有效业务资源；不同 `type` 对关联字段的要求由服务层固定校验。

任务关联规则：

| type | 必须非空的关联字段 | 必须为空的其他业务关联字段 |
| --- | --- | --- |
| `PROJECT_ANALYSIS` | `project_id` | `code_review_id`, `interview_id` |
| `CODE_REVIEW` | `project_id`, `code_review_id` | `interview_id` |
| `INTERVIEW_QUESTION_GENERATION` | `project_id`, `interview_id` | `code_review_id` |
| `INTERVIEW_REPORT_GENERATION` | `project_id`, `interview_id` | `code_review_id` |
| `PROJECT_CLEANUP` | `project_id` | `code_review_id`, `interview_id` |

Service 创建任务时必须验证以上规则。Prisma migration 还应使用按 `type` 分支的 PostgreSQL `CHECK` 约束阻止绕过 Service 的脏数据；该约束通过自定义 migration SQL 添加，不仅依赖 TypeScript 校验。

为防止重复点击或补偿逻辑产生并发任务，migration 必须增加以下活跃任务 partial unique index：

```sql
CREATE UNIQUE INDEX uniq_active_project_analysis_task
ON async_tasks (project_id)
WHERE type = 'PROJECT_ANALYSIS'
  AND status IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX uniq_active_code_review_task
ON async_tasks (project_id)
WHERE type = 'CODE_REVIEW'
  AND status IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX uniq_active_interview_question_task
ON async_tasks (project_id)
WHERE type = 'INTERVIEW_QUESTION_GENERATION'
  AND status IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX uniq_active_interview_report_task
ON async_tasks (interview_id)
WHERE type = 'INTERVIEW_REPORT_GENERATION'
  AND status IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX uniq_active_project_cleanup_task
ON async_tasks (project_id)
WHERE type = 'PROJECT_CLEANUP'
  AND status IN ('PENDING', 'QUEUED', 'PROCESSING');
```

API 必须在同一数据库事务中创建业务记录和任务。命中活跃任务唯一约束时回滚事务，并返回 `409 TASK_ALREADY_ACTIVE`；不得创建孤立的代码审查或面试记录。

### 4.10 ai_call_logs

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK users.id |
| project_id | UUID | NULL, FK projects.id |
| task_id | UUID | NULL, FK async_tasks.id |
| scene | VARCHAR(100) | NOT NULL |
| provider | VARCHAR(50) | NOT NULL |
| model | VARCHAR(100) | NOT NULL |
| prompt_version | VARCHAR(50) | NULL |
| schema_version | VARCHAR(50) | NULL |
| retry_count | INTEGER | NOT NULL, DEFAULT 0 |
| status | VARCHAR(30) | NOT NULL |
| prompt_tokens | INTEGER | NULL |
| completion_tokens | INTEGER | NULL |
| total_tokens | INTEGER | NULL |
| duration_ms | INTEGER | NULL |
| error_code | VARCHAR(100) | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

索引：

- `(user_id, created_at)`
- `(project_id, created_at)`
- `(task_id)`

日志禁止保存密码、JWT、Refresh Token、API Key、完整源码、完整 Prompt 或未经脱敏的模型响应。

`ai_call_logs` 暂时保留 `user_id`、`project_id` 和 `task_id` 的普通外键，不增加复杂组合外键。后续 Service 写入日志时必须在同一数据库事务中校验：Project 属于 `user_id`，Task 属于 `user_id`，且 Task 与 Project 的关联和本次调用上下文一致；不得信任调用方直接提交的关联 ID。

## 5. 删除与一致性策略

- Project 删除采用 `DELETING -> DELETED`，不在 HTTP 请求内同步递归删除文件。
- API 在事务中更新业务状态、创建 `async_tasks`，事务提交后投递 BullMQ。
- 创建项目时先写入 `UPLOADED` 项目和 `PENDING` 任务；BullMQ 投递成功后再更新为 `QUEUED`。
- 若队列投递失败，项目保持 `UPLOADED`、任务保持 `PENDING`，由补偿扫描重新投递，不能伪装为成功。
- Worker 必须使用任务 ID 实现幂等，重复消费不能重复创建唯一结果。
- Worker 在事务中同时写入结果、业务状态和任务终态。
- Project 进入 `DELETING` 后禁止创建分析、审查和面试任务。
- Worker 在写入项目分析、代码审查、面试题或面试报告前，必须在写入事务内重新查询并锁定关联资源。若项目已进入 `DELETING` 或 `DELETED`，将任务更新为 `CANCELLED`，错误码记录为 `RESOURCE_DELETING`，不得写入结果，也不得将项目状态改回 `COMPLETED`。

## 6. REST API 约定

统一前缀：`/api/v1`。

统一错误响应：

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "项目不存在或无权访问",
    "requestId": "uuid"
  }
}
```

访问其他用户资源统一返回 `404`，避免资源枚举。

所有存储路径、内部文件哈希、AI 原始响应和未经脱敏的内部错误默认不得出现在用户 API 响应中，包括 `zip_storage_path`、`extract_storage_path` 和 `file_hash`。API 只返回业务展示字段；任务失败时仅返回允许公开的错误码和脱敏文案。

所有列表接口统一使用 `page`、`pageSize` 分页，`page` 从 1 开始，`pageSize` 默认 20、最大 100。响应格式统一为：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 100,
  "totalPages": 5
}
```

`totalPages` 按 `ceil(total / pageSize)` 计算；无结果时返回 `items: []`、`total: 0`、`totalPages: 0`。

### 6.1 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` | 邮箱密码注册 |
| POST | `/auth/login` | 登录并签发 Token |
| POST | `/auth/refresh` | Refresh Token Rotation |
| POST | `/auth/logout` | 注销当前会话 |
| GET | `/auth/me` | 查询当前用户 |

Access Token 默认 15 分钟并由前端保存在内存；Refresh Token 使用 `HttpOnly + SameSite=Lax` Cookie，生产环境必须启用 `Secure`。Redis 仅保存其哈希、用户 ID、会话 ID 和过期时间。

Cookie、CORS 与 CSRF 规则：

- API 的 CORS allowlist 只允许明确配置的 Web 前端 Origin，禁止生产环境使用通配符 `*`。
- 前后端请求启用 `credentials: true`，服务端同时返回精确的 `Access-Control-Allow-Origin`。
- `/auth/refresh` 与 `/auth/logout` 必须校验 `Origin`；兼容性需要时才回退校验 `Referer`，不匹配允许域名则拒绝。
- 优先将 Web 与 API 部署在同站域名下并保持 `SameSite=Lax`。
- 如果生产环境确实需要跨站 Cookie，必须使用 `SameSite=None; Secure`，并额外实现 CSRF Token，不能只依赖 CORS。

注册请求：

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "displayName": "张三"
}
```

登录响应：

```json
{
  "accessToken": "token",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "张三"
  }
}
```

### 6.2 项目

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/projects` | 上传 ZIP 并创建分析任务 |
| GET | `/projects` | 分页查询当前用户项目 |
| GET | `/projects/:projectId` | 查询项目详情 |
| DELETE | `/projects/:projectId` | 标记删除并创建清理任务 |
| GET | `/projects/:projectId/analysis` | 查询结构化分析结果 |

上传使用 `multipart/form-data`，字段为 `file`、`name` 和可选 `description`。建议默认限制：ZIP 50 MB、单个解压文件 2 MB、总解压大小 200 MB、文件数量 5000。

上传和解压安全规则：

- 同时校验扩展名、MIME 和 ZIP 文件签名，不能只信任客户端文件名。
- ZIP 内路径必须规范化并验证最终目标仍位于该项目专属解压目录内；出现绝对路径、`..` 路径穿越或 Zip Slip 时拒绝整个压缩包。
- 拒绝符号链接、硬链接和其他可能指向解压根目录之外的条目。
- 跳过 `.git`、`node_modules`、`dist`、`build`、`.next` 及其子目录。
- 只分析允许扩展名且通过文本探测的代码或配置文件，跳过图片、音视频、压缩文件、可执行文件和其他二进制内容。
- ZIP 条目文件名必须规范化，不直接信任或拼接 ZIP 内部路径；所有数量与解压大小限制必须在流式解压过程中执行。

上传成功返回 `202 Accepted`：

```json
{
  "project": { "id": "uuid", "name": "示例项目", "status": "QUEUED" },
  "task": { "id": "uuid", "type": "PROJECT_ANALYSIS", "status": "QUEUED" }
}
```

此响应只在 BullMQ 投递成功、项目和任务均更新为 `QUEUED` 后返回。投递失败时保留 `UPLOADED`/`PENDING` 数据供补偿扫描处理，并向当前请求返回脱敏的 `503`，不得返回虚假的 `QUEUED`。

列表查询参数：`page`、`pageSize`、`status` 和 `keyword`；默认排除 `DELETED`。

### 6.3 代码审查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/projects/:projectId/code-reviews` | 创建代码审查任务 |
| GET | `/projects/:projectId/code-reviews` | 查询项目审查历史 |
| GET | `/code-reviews/:codeReviewId` | 查询审查状态和结果 |

只有 `COMPLETED` 项目可创建审查。创建成功返回 `202` 和 `codeReview`、`task` 摘要。

### 6.4 模拟面试

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/projects/:projectId/interviews` | 创建题目生成任务 |
| GET | `/projects/:projectId/interviews` | 查询项目面试历史 |
| GET | `/interviews/:interviewId` | 查询面试、题目和作答进度 |
| POST | `/interviews/:interviewId/start` | 开始面试 |
| PUT | `/interviews/:interviewId/answers/:questionId` | 新增或覆盖答案 |
| POST | `/interviews/:interviewId/submit` | 提交整场面试并创建报告任务 |
| GET | `/interviews/:interviewId/report` | 查询面试报告 |

创建请求：

```json
{
  "questionCount": 8,
  "difficulty": "MEDIUM"
}
```

规则：

- `questionCount` 为 5 至 15。
- `GENERATING` 阶段不返回题目。
- 答题接口永不返回 `referencePoints`。
- `IN_PROGRESS` 状态允许覆盖保存答案。
- 保存答案时按题目 `sequence` 在同一事务中推进 `current_index`，取历史值与本次序号的较大值。
- `SUBMITTED` 后禁止修改答案。
- 提交前必须完成所有题目。
- 重复提交通过状态约束保证幂等。

### 6.5 异步任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/tasks/:taskId` | 查询当前用户任务状态 |

响应示例：

```json
{
  "id": "uuid",
  "type": "CODE_REVIEW",
  "status": "PROCESSING",
  "progress": 60,
  "failure": null,
  "createdAt": "2026-07-01T04:00:00.000Z",
  "completedAt": null
}
```

MVP 使用轮询，不引入 WebSocket 或 SSE。前台处理中建议每 2 秒轮询，进入后台后降低频率，进入终态后停止。

### 6.6 限流

限流计数存入 Redis。以下为 MVP 默认值，必须支持通过环境变量调整；超过限制统一返回 `429 RATE_LIMITED`，并返回标准 `Retry-After` 响应头。

| 接口 | 维度 | 默认限制 |
| --- | --- | --- |
| `POST /auth/login` | IP + 规范化 email | 15 分钟 10 次 |
| `POST /auth/register` | IP | 1 小时 5 次 |
| `POST /auth/refresh` | session_id | 5 分钟 30 次 |
| `POST /projects` | user_id | 1 小时 10 次 |
| `POST /projects/:projectId/code-reviews` | user_id + project_id | 1 小时 5 次 |
| `POST /projects/:projectId/interviews` | user_id + project_id | 1 小时 5 次 |

限流不能替代活跃任务唯一约束。认证失败响应不得暴露邮箱是否已注册；AI 成本型接口在限流检查后仍必须执行资源归属和状态校验。

## 7. HTTP 状态码

| 状态码 | 用途 |
| --- | --- |
| 200 | 查询或更新成功 |
| 201 | 同步创建成功 |
| 202 | 异步任务已接受 |
| 204 | 成功且无响应体 |
| 400 | 请求格式错误 |
| 401 | 未认证或 Token 无效 |
| 403 | 已认证，但没有权限执行该操作 |
| 404 | 资源不存在或不属于当前用户 |
| 409 | 重复操作或资源当前状态不允许操作 |
| 413 | 上传体积超限 |
| 415 | 文件类型不支持 |
| 422 | DTO 校验失败 |
| 429 | 请求频率超限 |
| 500 | 内部错误 |
| 503 | AI、Redis 等依赖暂时不可用 |

例如，项目处于 `ANALYZING` 时创建代码审查返回 `409 Conflict`：

```json
{
  "error": {
    "code": "PROJECT_NOT_READY",
    "message": "项目分析尚未完成，暂不能创建代码审查",
    "requestId": "uuid"
  }
}
```

## 8. 已确认但暂不展开

- Monorepo：`apps/web`、`apps/api`、`apps/worker`、`packages/shared-types`、`packages/eslint-config`、`prisma`、`storage`。
- AI：OpenAI-compatible，DeepSeek Base URL，默认模型 `deepseek-v4-flash`。
- API Key 只从后端环境变量读取。
- 模拟面试为纯文本、多轮流程，不包含语音、视频和数字人。
- 本文不定义前端页面路由、后端模块目录和实现步骤；这些在数据库与 API 设计确认后单独规划。
