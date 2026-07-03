# Project Analysis Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume project analysis and cleanup tasks safely and idempotently, recover unqueued tasks, and persist deterministic project analysis without AI.

**Architecture:** `packages/shared-types` owns the queue contract, Zod result schemas, and environment-overridable extraction defaults. `apps/worker` loads every task from PostgreSQL by `taskId`, performs disk work outside terminal transactions, and commits success, failure, or cancellation only after rechecking project state. Recovery locks eligible PostgreSQL rows with `FOR UPDATE SKIP LOCKED` and publishes deterministic BullMQ jobs inside the transaction.

**Tech Stack:** TypeScript, BullMQ, Prisma, PostgreSQL, Redis, Zod, yauzl, Vitest.

---

### Task 1: Shared queue and analysis contracts

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/index.spec.ts`

- [ ] Write failing tests for payload strictness, analysis result schemas, defaults, and environment overrides.
- [ ] Run the package tests and verify failure because the package implementation is absent.
- [ ] Implement `TASK_QUEUE_NAME`, strict `{ taskId }`, Zod schemas, and conservative extraction limits.
- [ ] Run focused tests and type checking.

### Task 2: Worker foundation and safe storage paths

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/config.ts`
- Create: `apps/worker/src/storage/storage-path.service.ts`
- Test: `apps/worker/src/storage/storage-path.service.spec.ts`

- [ ] Write failing tests rejecting traversal, absolute untrusted paths, and deletion of `STORAGE_ROOT` itself.
- [ ] Implement environment validation and containment checks.
- [ ] Verify focused tests pass.

### Task 3: Safe ZIP extraction

**Files:**
- Create: `apps/worker/src/analysis/zip-extractor.service.ts`
- Test: `apps/worker/src/analysis/zip-extractor.service.spec.ts`

- [ ] Write failing tests for temporary extraction, atomic promotion, traversal, symlinks, ignored directories, count, size, depth, and failure cleanup.
- [ ] Implement streaming extraction with yauzl and byte counters.
- [ ] Verify focused tests pass and no failed extraction directory remains.

### Task 4: Deterministic static analysis

**Files:**
- Create: `apps/worker/src/analysis/project-analyzer.service.ts`
- Test: `apps/worker/src/analysis/project-analyzer.service.spec.ts`

- [ ] Write failing fixture-based tests for directory tree, language/framework detection, entry files, core modules, and statistics.
- [ ] Implement bounded text reads and manifest detectors without AI.
- [ ] Validate the result through `ProjectAnalysisResultSchema.safeParse`.
- [ ] Verify focused tests pass.

### Task 5: PROJECT_ANALYSIS processor

**Files:**
- Create: `apps/worker/src/processors/project-analysis.processor.ts`
- Test: `apps/worker/src/processors/project-analysis.processor.spec.ts`

- [ ] Write failing tests for authoritative DB loading, conditional claim, idempotent terminal tasks, success transaction, invalid Zod result, sanitized failure, and deletion cancellation races.
- [ ] Implement processing and terminal transactions that recheck Project state.
- [ ] Verify focused tests pass.

### Task 6: PROJECT_CLEANUP processor

**Files:**
- Create: `apps/worker/src/processors/project-cleanup.processor.ts`
- Test: `apps/worker/src/processors/project-cleanup.processor.spec.ts`

- [ ] Write failing tests for contained deletion, missing files, already deleted projects, repeated jobs, and terminal transaction behavior.
- [ ] Implement idempotent cleanup and path validation.
- [ ] Verify focused tests pass.

### Task 7: Recovery and Worker runtime

**Files:**
- Create: `apps/worker/src/recovery/task-recovery.service.ts`
- Create: `apps/worker/src/runtime.ts`
- Create: `apps/worker/src/main.ts`
- Test: `apps/worker/src/recovery/task-recovery.service.spec.ts`
- Test: `apps/worker/src/runtime.spec.ts`

- [ ] Write failing tests proving `FOR UPDATE SKIP LOCKED`, exact PENDING/null selection, job name from task type, payload-only taskId, and deterministic jobId.
- [ ] Implement transactional recovery and BullMQ dispatch by authoritative task type.
- [ ] Implement runtime routing only for PROJECT_ANALYSIS and PROJECT_CLEANUP.
- [ ] Verify focused tests pass.

### Task 8: Integration and E2E

**Files:**
- Create: `apps/worker/test/worker.integration.spec.ts`
- Create: `apps/worker/test/run-integration-tests.ts`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] Test upload through analysis completion, safe result persistence, deletion races, cleanup idempotency, recovery, and duplicate delivery against PostgreSQL and Redis.
- [ ] Confirm malicious ZIPs fail without escaping or leaving temporary directories.
- [ ] Confirm no AI, CodeReview, Interview, frontend, or Prisma Schema changes.

### Task 9: Full verification

- [ ] Run API and worker type checks.
- [ ] Run all unit tests.
- [ ] Run database constraints tests.
- [ ] Run API E2E and worker integration/E2E tests.
- [ ] Run all builds and `git diff --check`.
- [ ] Verify `prisma/schema.prisma` has no diff.
