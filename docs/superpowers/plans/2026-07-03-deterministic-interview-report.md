# Deterministic Interview Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the deterministic interview report backend lifecycle from submitted interview through API task creation, worker persistence, recovery, and safe report query.

**Architecture:** Add a focused API service, a strict shared result contract, a pure deterministic generator, and a task-id-only worker processor. Reuse existing PostgreSQL row-lock, BullMQ publication, recovery, and terminal-transaction patterns without changing the database schema.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ, Zod, TypeScript, Vitest, Supertest

---

### Task 1: Shared report result contract

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/index.spec.ts`

- [ ] Add failing tests for strict report fields, score bounds, non-empty lists, and fixed model.
- [ ] Run `pnpm --filter @hirescope/shared-types test` and confirm failure because the schema is absent.
- [ ] Implement `InterviewReportResultSchema` and inferred types.
- [ ] Rerun the shared-types tests and confirm success.

### Task 2: Deterministic report generator

**Files:**
- Create: `apps/worker/src/interview/deterministic-interview-report.service.ts`
- Create: `apps/worker/src/interview/deterministic-interview-report.service.spec.ts`

- [ ] Add failing tests for repeatable scoring, one review per question, clamping, strengths, and improvements.
- [ ] Run the focused Vitest file and confirm failure because the service is absent.
- [ ] Implement normalized matching, deterministic scoring, dimensions, comments, and summary.
- [ ] Rerun the focused tests and confirm success.

### Task 3: Report API service and routes

**Files:**
- Create: `apps/api/src/interviews/interview-reports.service.ts`
- Create: `apps/api/src/interviews/interview-reports.service.spec.ts`
- Modify: `apps/api/src/interviews/interviews.controller.ts`
- Modify: `apps/api/src/interviews/interviews.module.ts`
- Modify: `apps/api/test/interviews.e2e.spec.ts`

- [ ] Add failing unit tests for transactional creation, ownership, state conflicts, idempotency, post-commit queue behavior, and safe GET projections.
- [ ] Run focused API tests and confirm expected failures.
- [ ] Implement `InterviewReportsService`, route injection, `POST` status 202, and `GET` behavior.
- [ ] Add E2E coverage for creation, queue failure persistence, ownership, missing report, and absence of `referencePoints`.
- [ ] Run API unit and E2E tests and confirm success.

### Task 4: Report processor

**Files:**
- Create: `apps/worker/src/processors/interview-report.processor.ts`
- Create: `apps/worker/src/processors/interview-report.processor.spec.ts`
- Modify: `apps/worker/src/runtime.ts`
- Modify: `apps/worker/src/runtime.spec.ts`

- [ ] Add failing tests for task-id lookup, successful atomic completion, duplicate consumption, existing report, invalid input, invalid Zod output, and deleting project cancellation.
- [ ] Run focused worker tests and confirm expected failures.
- [ ] Implement claim, generation, validation, terminal transaction, sanitized failure, and idempotency logic.
- [ ] Route `INTERVIEW_REPORT_GENERATION` through the runtime using only parsed `taskId`.
- [ ] Rerun worker unit tests and confirm success.

### Task 5: Recovery and integration flow

**Files:**
- Modify: `apps/worker/src/recovery/task-recovery.service.ts`
- Modify: `apps/worker/src/recovery/task-recovery.service.spec.ts`
- Modify: `apps/worker/test/worker.integration.spec.ts`
- Modify: `apps/api/test/interviews.e2e.spec.ts`

- [ ] Add failing recovery tests proving report tasks are selected only when `PENDING` with null `bullJobId`, and payload is exactly `{ taskId }`.
- [ ] Extend the recovery type filter and rerun focused tests.
- [ ] Add an integration flow from submitted interview through report processing and safe GET response.
- [ ] Run API E2E and worker integration suites and confirm success.

### Task 6: Full verification and final commit

**Files:**
- Verify only: `prisma/schema.prisma`
- Verify only: `prisma/migrations/`

- [ ] Run shared-types, API unit/E2E, Worker unit/integration, and database constraint tests.
- [ ] Run API/Worker typecheck and build commands plus `pnpm db:validate`.
- [ ] Confirm `git diff -- prisma/schema.prisma prisma/migrations` is empty and no secrets/artifacts are staged.
- [ ] Commit all intended files with `feat: add deterministic interview report workflow` and push `feat/deterministic-interview-report`.
