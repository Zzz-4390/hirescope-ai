# Projects and AsyncTasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement authenticated ZIP project ingestion, project queries/deletion, analysis readiness, and task status queries without adding a worker or changing the database schema.

**Architecture:** The API writes uploads to a disk-backed temporary directory, validates and hashes them, then atomically moves each accepted ZIP to its project directory. PostgreSQL owns project/task state, while a focused BullMQ producer publishes task IDs after database transactions; explicit compensation removes files on database failure and preserves `UPLOADED/PENDING` on queue failure.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16, BullMQ, Redis 7, Multer, Vitest, Supertest.

---

### Task 1: Configuration and queue producer

**Files:**
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Modify: `apps/api/src/config/env.validation.ts`
- Create: `apps/api/src/tasks/task-queue.service.ts`
- Create: `apps/api/src/tasks/tasks.module.ts`
- Test: `apps/api/src/tasks/task-queue.service.spec.ts`

- [ ] Write failing tests proving the producer publishes only `{ taskId }` with `jobId=taskId`.
- [ ] Run `pnpm --filter @hirescope/api test -- task-queue.service.spec.ts` and confirm failure because the producer does not exist.
- [ ] Add BullMQ and validated storage/queue configuration, then implement the minimal producer.
- [ ] Rerun the focused tests and confirm they pass.

### Task 2: Disk-backed ZIP intake

**Files:**
- Create: `apps/api/src/projects/project-upload.service.ts`
- Create: `apps/api/src/projects/project-upload.service.spec.ts`
- Create: `apps/api/src/projects/project-upload.interceptor.ts`

- [ ] Write failing tests for extension, allowed MIME, `PK\\x03\\x04` signature, SHA-256, final move, and cleanup.
- [ ] Run the focused tests and confirm failure because upload handling does not exist.
- [ ] Implement disk-backed Multer temporary storage with a 50 MiB parser limit and a service that validates, hashes, moves, and removes files.
- [ ] Rerun focused tests and confirm they pass.

### Task 3: Project and task services

**Files:**
- Create: `apps/api/src/projects/dto/project.dto.ts`
- Create: `apps/api/src/projects/projects.service.ts`
- Create: `apps/api/src/projects/projects.service.spec.ts`
- Create: `apps/api/src/tasks/tasks.service.ts`
- Create: `apps/api/src/tasks/tasks.service.spec.ts`

- [ ] Write failing service tests for transaction boundaries, user ownership, fixed response fields, pagination, analysis readiness, duplicate deletion, enqueue success, and enqueue failure.
- [ ] Run focused tests and confirm failure because services do not exist.
- [ ] Implement explicit Prisma `select` projections and queue transition logic without returning storage paths or hashes.
- [ ] Rerun focused tests and confirm they pass.

### Task 4: Authenticated controllers and modules

**Files:**
- Create: `apps/api/src/projects/projects.controller.ts`
- Create: `apps/api/src/projects/projects.module.ts`
- Create: `apps/api/src/tasks/tasks.controller.ts`
- Modify: `apps/api/src/tasks/tasks.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] Add authenticated controllers for all approved endpoints and `202`, `409`, `413`, `503` semantics.
- [ ] Register Projects and Tasks modules without adding Worker, AI, review, interview, or frontend code.
- [ ] Run type checking and focused unit tests.

### Task 5: End-to-end behavior without a worker

**Files:**
- Create: `apps/api/test/projects.e2e.spec.ts`
- Modify: `apps/api/test/run-e2e-tests.ts`

- [ ] Write E2E tests for valid/invalid ZIPs, 50 MiB enforcement, ownership 404s, pagination DTOs, queued upload, analysis-not-ready, deleting project, queued cleanup task, and queue-failure persistence.
- [ ] Run E2E tests and confirm new tests fail before completing endpoint wiring.
- [ ] Make only the wiring changes needed for the E2E suite to pass.
- [ ] Confirm no test expects `ANALYZING`, `COMPLETED`, or physical cleanup because no Worker exists.

### Task 6: Full verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-projects-async-tasks.md`

- [ ] Run `pnpm api:typecheck`.
- [ ] Run `pnpm api:test`.
- [ ] Run `pnpm db:test`.
- [ ] Run `pnpm api:test:e2e`.
- [ ] Run `pnpm api:build`.
- [ ] Run `git diff --check` and verify `prisma/schema.prisma` is unchanged.
