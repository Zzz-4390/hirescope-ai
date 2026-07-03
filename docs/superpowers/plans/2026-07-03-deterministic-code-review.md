# Deterministic Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a backend-only deterministic asynchronous CodeReview workflow.

**Architecture:** A dedicated Nest module owns creation and queries; shared Zod contracts validate results; a dedicated Worker processor generates and persists deterministic results. Existing BullMQ publishing and recovery patterns remain authoritative.

**Tech Stack:** NestJS, Prisma, PostgreSQL, BullMQ, Zod, Vitest, Supertest.

---

### Task 1: Shared result contract

**Files:** `packages/shared-types/src/index.ts`, `packages/shared-types/src/index.spec.ts`

- [ ] Add failing schema tests for the required result keys and strict validation.
- [ ] Run shared-types tests and confirm RED.
- [ ] Add `CodeReviewResultSchema` and inferred type.
- [ ] Run shared-types tests and confirm GREEN.

### Task 2: CodeReview API module

**Files:** `apps/api/src/code-reviews/*`, `apps/api/src/app.module.ts`, API unit tests

- [ ] Add failing service/controller tests for ownership, `COMPLETED`, active-task conflict, transaction creation, pagination, detail mapping, and queue failure recovery state.
- [ ] Run API tests and confirm RED.
- [ ] Implement DTO, mapper, service, controller, and module with project row locking and post-commit enqueue.
- [ ] Run API tests and confirm GREEN.

### Task 3: Deterministic Worker

**Files:** `apps/worker/src/code-review/*`, `apps/worker/src/processors/code-review.processor.ts`, corresponding specs, `apps/worker/src/runtime.ts`

- [ ] Add failing reviewer and processor tests for deterministic output, success, cancellation, invalid schema, idempotency, and type mismatch.
- [ ] Run Worker tests and confirm RED.
- [ ] Implement reviewer, processor, and runtime routing.
- [ ] Run Worker tests and confirm GREEN.

### Task 4: Recovery, E2E, and integration

**Files:** `apps/worker/src/recovery/*`, `apps/api/test/*`, `apps/worker/test/*`

- [ ] Add failing recovery, API E2E, and Worker integration coverage.
- [ ] Run targeted suites and confirm RED.
- [ ] Extend recovery to CODE_REVIEW and synchronize review status.
- [ ] Run targeted suites and confirm GREEN.

### Task 5: Documentation, smoke, verification, commit

**Files:** `docs/smoke-test.md`

- [ ] Add manual CodeReview commands.
- [ ] Run the real HTTP queue/worker/database flow.
- [ ] Run all required validation, unit, database, E2E, integration, and build commands.
- [ ] Review `git diff`, confirm no schema changes, and commit with `feat: add deterministic code review workflow`.
