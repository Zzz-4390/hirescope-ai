# Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可重复启动和验证的 pnpm monorepo 数据库基础，创建与 `database-api-design.md` 一致的 Prisma Schema，并通过 PostgreSQL custom migration 固化 CHECK 约束和活跃任务 partial unique index。

**Architecture:** 根目录管理 Prisma 6.19、PostgreSQL 和 Redis 基础设施；`prisma/schema.prisma` 是模型定义源，生成 migration 后在同一个 migration 中追加 Prisma Schema 无法表达的约束。该阶段不创建 Auth、Projects 或 Worker 业务代码，只交付后续模块可依赖的数据库契约。

**Tech Stack:** Node.js 22、pnpm 11 workspace、TypeScript 5、Prisma 6.19、PostgreSQL 16、Redis 7、Docker Compose、Vitest

---

## 实施边界与文件结构

```text
HireScope AI/
├─ .env.example
├─ .gitignore
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  │  └─ 20260701000100_init/
│  │     └─ migration.sql
│  └─ tests/
│     └─ database-constraints.spec.ts
└─ docs/superpowers/specs/2026-07-01-database-api-design.md
```

Prisma 版本固定为 6.19，避免在首个实现批次同时引入 Prisma 7 配置与 driver adapter 迁移。升级 Prisma 作为独立任务处理。

### Task 1: 初始化 pnpm workspace 与数据库基础设施

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: 创建根 package.json**

```json
{
  "name": "hirescope-ai",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.7.0",
  "scripts": {
    "db:generate": "prisma generate",
    "db:validate": "prisma validate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force",
    "db:test": "vitest run prisma/tests",
    "infra:up": "docker compose up -d postgres redis",
    "infra:down": "docker compose down"
  },
  "dependencies": {
    "@prisma/client": "6.19.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "prisma": "6.19.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 创建 workspace 与 TypeScript 基础配置**

`pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

`tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: 创建环境变量模板与忽略规则**

`.env.example`：

```dotenv
POSTGRES_DB=hirescope
POSTGRES_USER=hirescope
POSTGRES_PASSWORD=change_me_for_local_development
DATABASE_URL=postgresql://hirescope:change_me_for_local_development@localhost:5432/hirescope?schema=public
REDIS_URL=redis://localhost:6379
```

`.gitignore`：

```gitignore
.env
.env.*
!.env.example
node_modules/
.pnpm-store/
dist/
build/
.next/
coverage/
*.log
storage/*
!storage/.gitkeep
```

- [ ] **Step 4: 创建 Docker Compose 基础服务**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-hirescope}
      POSTGRES_USER: ${POSTGRES_USER:-hirescope}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change_me_for_local_development}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: ["redis-server", "--appendonly", "yes"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 5: 安装依赖并检查 lockfile**

Run: `pnpm install`

Expected: 生成 `pnpm-lock.yaml`，命令退出码为 0，未创建 `.env` 或提交任何凭据。

- [ ] **Step 6: 提交基础设施变更**

```powershell
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example docker-compose.yml
git commit -m "chore: initialize database workspace"
```

### Task 2: 创建完整 Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: 写入 Prisma Schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ProjectStatus {
  UPLOADED
  QUEUED
  ANALYZING
  COMPLETED
  FAILED
  DELETING
  DELETED
}

enum TaskStatus {
  PENDING
  QUEUED
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
}

enum TaskType {
  PROJECT_ANALYSIS
  CODE_REVIEW
  INTERVIEW_QUESTION_GENERATION
  INTERVIEW_REPORT_GENERATION
  PROJECT_CLEANUP
}

enum InterviewStatus {
  GENERATING
  READY
  IN_PROGRESS
  SUBMITTED
  REPORT_GENERATING
  COMPLETED
  FAILED
}

enum InterviewDifficulty {
  EASY
  MEDIUM
  HARD
}

model User {
  id               String            @id @default(uuid()) @db.Uuid
  email            String            @unique @db.VarChar(320)
  passwordHash     String            @map("password_hash") @db.VarChar(255)
  displayName      String?           @map("display_name") @db.VarChar(100)
  createdAt        DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  projects         Project[]
  codeReviews      CodeReview[]
  interviews       Interview[]
  interviewAnswers InterviewAnswer[]
  interviewReports InterviewReport[]
  asyncTasks       AsyncTask[]
  aiCallLogs       AiCallLog[]

  @@map("users")
}

model Project {
  id                 String           @id @default(uuid()) @db.Uuid
  userId             String           @map("user_id") @db.Uuid
  name               String           @db.VarChar(120)
  description        String?          @db.Text
  originalFileName   String           @map("original_file_name") @db.VarChar(255)
  zipStoragePath     String?          @map("zip_storage_path")
  extractStoragePath String?          @map("extract_storage_path")
  fileSize           BigInt           @map("file_size")
  fileHash           String           @map("file_hash") @db.VarChar(64)
  status             ProjectStatus
  failureCode        String?          @map("failure_code") @db.VarChar(100)
  failureMessage     String?          @map("failure_message") @db.VarChar(500)
  createdAt          DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  user               User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  analysis           ProjectAnalysis?
  codeReviews        CodeReview[]
  interviews         Interview[]
  asyncTasks         AsyncTask[]
  aiCallLogs         AiCallLog[]

  @@index([userId, createdAt])
  @@index([userId, status])
  @@index([userId, fileHash])
  @@map("projects")
}

model ProjectAnalysis {
  id              String   @id @default(uuid()) @db.Uuid
  projectId       String   @unique @map("project_id") @db.Uuid
  summary         String   @db.Text
  techStack       Json     @map("tech_stack") @db.JsonB
  directoryTree   Json     @map("directory_tree") @db.JsonB
  coreModules     Json     @map("core_modules") @db.JsonB
  entryFiles      Json     @map("entry_files") @db.JsonB
  statistics      Json     @db.JsonB
  analyzerVersion String   @map("analyzer_version") @db.VarChar(50)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("project_analyses")
}

model CodeReview {
  id             String       @id @default(uuid()) @db.Uuid
  projectId      String       @map("project_id") @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  status         TaskStatus
  summary        String?      @db.Text
  score          Int?
  result         Json?        @db.JsonB
  model          String?      @db.VarChar(100)
  failureCode    String?      @map("failure_code") @db.VarChar(100)
  failureMessage String?      @map("failure_message") @db.VarChar(500)
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)
  completedAt    DateTime?    @map("completed_at") @db.Timestamptz(6)
  project        Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  asyncTasks     AsyncTask[]

  @@index([userId, createdAt])
  @@index([projectId, status])
  @@map("code_reviews")
}

model Interview {
  id             String               @id @default(uuid()) @db.Uuid
  projectId      String               @map("project_id") @db.Uuid
  userId         String               @map("user_id") @db.Uuid
  title          String               @db.VarChar(150)
  status         InterviewStatus
  difficulty     InterviewDifficulty
  questionCount  Int                  @map("question_count")
  currentIndex   Int                  @default(0) @map("current_index")
  failureCode    String?              @map("failure_code") @db.VarChar(100)
  failureMessage String?              @map("failure_message") @db.VarChar(500)
  startedAt      DateTime?            @map("started_at") @db.Timestamptz(6)
  submittedAt    DateTime?            @map("submitted_at") @db.Timestamptz(6)
  completedAt    DateTime?            @map("completed_at") @db.Timestamptz(6)
  createdAt      DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime             @updatedAt @map("updated_at") @db.Timestamptz(6)
  project        Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user           User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  questions      InterviewQuestion[]
  answers        InterviewAnswer[]
  report         InterviewReport?
  asyncTasks     AsyncTask[]

  @@index([userId, createdAt])
  @@index([projectId, status])
  @@map("interviews")
}

model InterviewQuestion {
  id              String              @id @default(uuid()) @db.Uuid
  interviewId     String              @map("interview_id") @db.Uuid
  sequence        Int
  category        String              @db.VarChar(100)
  difficulty      InterviewDifficulty
  question        String              @db.Text
  referencePoints Json                @map("reference_points") @db.JsonB
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  interview       Interview           @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  answer          InterviewAnswer?

  @@unique([interviewId, sequence])
  @@map("interview_questions")
}

model InterviewAnswer {
  id          String            @id @default(uuid()) @db.Uuid
  questionId  String            @unique @map("question_id") @db.Uuid
  interviewId String            @map("interview_id") @db.Uuid
  userId      String            @map("user_id") @db.Uuid
  content     String            @db.Text
  answeredAt  DateTime          @default(now()) @map("answered_at") @db.Timestamptz(6)
  updatedAt   DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  question    InterviewQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  interview   Interview         @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([interviewId])
  @@index([userId, interviewId])
  @@map("interview_answers")
}

model InterviewReport {
  id              String    @id @default(uuid()) @db.Uuid
  interviewId     String    @unique @map("interview_id") @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  overallScore    Int       @map("overall_score")
  summary         String    @db.Text
  dimensions      Json      @db.JsonB
  questionReviews Json      @map("question_reviews") @db.JsonB
  strengths       Json      @db.JsonB
  improvements    Json      @db.JsonB
  result          Json      @db.JsonB
  model           String    @db.VarChar(100)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  interview       Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@map("interview_reports")
}

model AsyncTask {
  id             String       @id @default(uuid()) @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  projectId      String?      @map("project_id") @db.Uuid
  codeReviewId   String?      @map("code_review_id") @db.Uuid
  interviewId    String?      @map("interview_id") @db.Uuid
  type           TaskType
  status         TaskStatus
  bullJobId      String?      @unique @map("bull_job_id") @db.VarChar(100)
  attempts       Int          @default(0)
  progress       Int          @default(0)
  failureCode    String?      @map("failure_code") @db.VarChar(100)
  failureMessage String?      @map("failure_message") @db.VarChar(500)
  startedAt      DateTime?    @map("started_at") @db.Timestamptz(6)
  completedAt    DateTime?    @map("completed_at") @db.Timestamptz(6)
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  project        Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  codeReview     CodeReview?  @relation(fields: [codeReviewId], references: [id], onDelete: Cascade)
  interview      Interview?   @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  aiCallLogs     AiCallLog[]

  @@index([userId, status])
  @@index([projectId, type])
  @@index([type, status])
  @@index([codeReviewId])
  @@index([interviewId])
  @@map("async_tasks")
}

model AiCallLog {
  id               String     @id @default(uuid()) @db.Uuid
  userId           String     @map("user_id") @db.Uuid
  projectId        String?    @map("project_id") @db.Uuid
  taskId           String?    @map("task_id") @db.Uuid
  scene            String     @db.VarChar(100)
  provider         String     @db.VarChar(50)
  model            String     @db.VarChar(100)
  promptVersion    String?    @map("prompt_version") @db.VarChar(50)
  schemaVersion    String?    @map("schema_version") @db.VarChar(50)
  retryCount       Int        @default(0) @map("retry_count")
  status           String     @db.VarChar(30)
  promptTokens     Int?       @map("prompt_tokens")
  completionTokens Int?       @map("completion_tokens")
  totalTokens      Int?       @map("total_tokens")
  durationMs       Int?       @map("duration_ms")
  errorCode        String?    @map("error_code") @db.VarChar(100)
  createdAt        DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  user             User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  project          Project?   @relation(fields: [projectId], references: [id], onDelete: SetNull)
  task             AsyncTask? @relation(fields: [taskId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([projectId, createdAt])
  @@index([taskId])
  @@map("ai_call_logs")
}
```

- [ ] **Step 2: 格式化并验证 Schema**

Run: `Copy-Item .env.example .env; pnpm prisma format; pnpm db:validate`

Expected: `The schema at prisma\schema.prisma is valid`。

- [ ] **Step 3: 生成 Prisma Client**

Run: `pnpm db:generate`

Expected: Prisma Client generation succeeds with exit code 0.

- [ ] **Step 4: 提交 Schema**

```powershell
git add prisma/schema.prisma
git commit -m "feat: define user mvp database schema"
```

### Task 3: 生成并补充 PostgreSQL custom migration

**Files:**
- Create: `prisma/migrations/20260701000100_init/migration.sql`

- [ ] **Step 1: 启动 PostgreSQL**

Run: `pnpm infra:up`

Expected: `docker compose ps` 显示 `postgres` 为 `healthy`。

- [ ] **Step 2: 生成固定路径的初始 migration DDL**

```powershell
New-Item -ItemType Directory -Force -Path 'prisma/migrations/20260701000100_init'
pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | Set-Content -LiteralPath 'prisma/migrations/20260701000100_init/migration.sql' -Encoding utf8
```

Expected: 创建 `prisma/migrations/20260701000100_init/migration.sql`，文件包含 10 张表、枚举、外键和 Prisma Schema 中定义的普通索引。

- [ ] **Step 3: 在生成的 migration.sql 末尾追加约束**

```sql
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_check"
  CHECK ("email" = lower(btrim("email")));

ALTER TABLE "code_reviews"
  ADD CONSTRAINT "code_reviews_score_check"
  CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100);

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_question_count_check"
  CHECK ("question_count" BETWEEN 5 AND 15),
  ADD CONSTRAINT "interviews_current_index_check"
  CHECK ("current_index" BETWEEN 0 AND "question_count");

ALTER TABLE "interview_questions"
  ADD CONSTRAINT "interview_questions_sequence_check"
  CHECK ("sequence" > 0);

ALTER TABLE "interview_reports"
  ADD CONSTRAINT "interview_reports_overall_score_check"
  CHECK ("overall_score" BETWEEN 0 AND 100);

ALTER TABLE "async_tasks"
  ADD CONSTRAINT "async_tasks_attempts_check"
  CHECK ("attempts" >= 0),
  ADD CONSTRAINT "async_tasks_progress_check"
  CHECK ("progress" BETWEEN 0 AND 100),
  ADD CONSTRAINT "async_tasks_business_relation_check"
  CHECK (
    ("type" = 'PROJECT_ANALYSIS' AND "project_id" IS NOT NULL AND "code_review_id" IS NULL AND "interview_id" IS NULL)
    OR ("type" = 'CODE_REVIEW' AND "project_id" IS NOT NULL AND "code_review_id" IS NOT NULL AND "interview_id" IS NULL)
    OR ("type" = 'INTERVIEW_QUESTION_GENERATION' AND "project_id" IS NOT NULL AND "code_review_id" IS NULL AND "interview_id" IS NOT NULL)
    OR ("type" = 'INTERVIEW_REPORT_GENERATION' AND "project_id" IS NOT NULL AND "code_review_id" IS NULL AND "interview_id" IS NOT NULL)
    OR ("type" = 'PROJECT_CLEANUP' AND "project_id" IS NOT NULL AND "code_review_id" IS NULL AND "interview_id" IS NULL)
  );

ALTER TABLE "ai_call_logs"
  ADD CONSTRAINT "ai_call_logs_retry_count_check"
  CHECK ("retry_count" >= 0);

CREATE UNIQUE INDEX "uniq_active_project_analysis_task"
ON "async_tasks" ("project_id")
WHERE "type" = 'PROJECT_ANALYSIS'
  AND "status" IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX "uniq_active_code_review_task"
ON "async_tasks" ("project_id")
WHERE "type" = 'CODE_REVIEW'
  AND "status" IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX "uniq_active_interview_question_task"
ON "async_tasks" ("project_id")
WHERE "type" = 'INTERVIEW_QUESTION_GENERATION'
  AND "status" IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX "uniq_active_interview_report_task"
ON "async_tasks" ("interview_id")
WHERE "type" = 'INTERVIEW_REPORT_GENERATION'
  AND "status" IN ('PENDING', 'QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX "uniq_active_project_cleanup_task"
ON "async_tasks" ("project_id")
WHERE "type" = 'PROJECT_CLEANUP'
  AND "status" IN ('PENDING', 'QUEUED', 'PROCESSING');
```

- [ ] **Step 4: 执行 migration**

Run: `pnpm prisma migrate dev`

Expected: migration 应用成功，`pnpm prisma migrate status` 输出 `Database schema is up to date!`。

- [ ] **Step 5: 从空数据库重放 migration**

Run: `pnpm db:reset`

Expected: 数据库清空后 migration 可完整重放且退出码为 0。

- [ ] **Step 6: 提交 migration**

```powershell
git add prisma/migrations
git commit -m "feat: add database integrity constraints"
```

### Task 4: 添加数据库约束集成测试

**Files:**
- Create: `prisma/tests/database-constraints.spec.ts`

- [ ] **Step 1: 编写失败场景测试**

测试必须覆盖以下实际数据库行为，不使用 mock：

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';

const prisma = new PrismaClient();

describe('database constraints', () => {
  const userId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email: `db-${userId}@example.com`,
        passwordHash: 'test-only-hash',
      },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        userId,
        name: 'Constraint fixture',
        originalFileName: 'fixture.zip',
        zipStoragePath: `/tmp/${projectId}.zip`,
        fileSize: 100n,
        fileHash: 'a'.repeat(64),
        status: ProjectStatus.UPLOADED,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('rejects non-normalized email', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: `UPPER-${randomUUID()}@EXAMPLE.COM`,
          passwordHash: 'test-only-hash',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a task without required business relation', async () => {
    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          type: TaskType.CODE_REVIEW,
          status: TaskStatus.PENDING,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate active project analysis tasks', async () => {
    await prisma.asyncTask.create({
      data: {
        userId,
        projectId,
        type: TaskType.PROJECT_ANALYSIS,
        status: TaskStatus.PENDING,
      },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.QUEUED,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows a new task after the previous task reaches a terminal state', async () => {
    await prisma.asyncTask.updateMany({
      where: { projectId, type: TaskType.PROJECT_ANALYSIS },
      data: { status: TaskStatus.SUCCEEDED },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.PENDING,
        },
      }),
    ).resolves.toMatchObject({ projectId, status: TaskStatus.PENDING });
  });

  it('rejects duplicate bull job ids', async () => {
    const bullJobId = randomUUID();
    await prisma.asyncTask.updateMany({
      where: { projectId, type: TaskType.PROJECT_ANALYSIS },
      data: { status: TaskStatus.SUCCEEDED },
    });
    await prisma.asyncTask.create({
      data: {
        userId,
        projectId,
        type: TaskType.PROJECT_ANALYSIS,
        status: TaskStatus.SUCCEEDED,
        bullJobId,
      },
    });

    await expect(
      prisma.asyncTask.create({
        data: {
          userId,
          projectId,
          type: TaskType.PROJECT_ANALYSIS,
          status: TaskStatus.SUCCEEDED,
          bullJobId,
        },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行约束测试**

Run: `pnpm db:test`

Expected: 5 tests pass；测试结束后 fixture 用户通过级联删除清理。

- [ ] **Step 3: 运行数据库阶段完整验证**

```powershell
pnpm db:validate
pnpm db:generate
pnpm prisma migrate status
pnpm db:test
```

Expected: 所有命令退出码为 0，无未应用 migration。

- [ ] **Step 4: 提交测试**

```powershell
git add prisma/tests/database-constraints.spec.ts package.json pnpm-lock.yaml
git commit -m "test: verify database constraints"
```

## 阶段验收标准

- `prisma/schema.prisma` 中 10 张表全部映射为小写复数，列映射为 snake_case。
- 所有时间字段生成 PostgreSQL `TIMESTAMPTZ(6)`。
- `bull_job_id` 唯一，五类活跃任务 partial unique index 可阻止重复任务。
- 任务业务关联 CHECK、分数范围、题目数量、进度和邮箱小写约束均能在真实 PostgreSQL 中拒绝非法写入。
- `prisma migrate reset --force` 可从空库完整重放。
- `.env`、数据库数据卷和生成物不进入版本控制。

## 后续独立计划顺序

数据库阶段验收后，按以下顺序分别生成并审批实施计划：

1. Auth：register、login、refresh、logout、me。
2. Projects + AsyncTasks：上传、查询、软删除、BullMQ 投递封装。
3. Worker + TaskRecoveryService：按 taskId 消费、幂等、补偿投递和删除竞态保护。
4. CodeReview 与 Interview 领域流程。
5. DeepSeek OpenAI-compatible AI 分析、审查、题目和报告生成。
