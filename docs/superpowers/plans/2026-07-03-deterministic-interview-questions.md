# Deterministic Interview Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated interview creation, deterministic asynchronous question generation, and safe interview queries without changing the database schema.

**Architecture:** A dedicated Nest `InterviewsModule` creates `Interview` and `AsyncTask` records transactionally, then publishes task-ID-only BullMQ jobs. A Worker processor locks the related rows, validates deterministic output with a shared Zod schema, and atomically inserts questions and terminal statuses.

**Tech Stack:** NestJS, Prisma, PostgreSQL, BullMQ, Zod, Vitest, Supertest.

---

### Task 1: Shared question contract

- [ ] Add failing strict-schema tests in `packages/shared-types/src/index.spec.ts`.
- [ ] Run shared-types tests and confirm RED.
- [ ] Add `InterviewQuestionsResultSchema` and inferred types in `packages/shared-types/src/index.ts`.
- [ ] Run shared-types tests and confirm GREEN.

### Task 2: Interviews API

- [ ] Add failing DTO and service tests for validation, ownership, status gates, transaction creation, active-task conflicts, queue failure, pagination, and safe detail mapping.
- [ ] Implement `apps/api/src/interviews/` DTO, mapper, service, controller, and module.
- [ ] Register `InterviewsModule` and run API unit tests.

### Task 3: Deterministic generator and Worker processor

- [ ] Add failing generator and processor tests for exact counts, success, invalid output, deletion cancellation, non-ready failure, type mismatch, and READY idempotency.
- [ ] Implement `DeterministicInterviewQuestionService` and `InterviewQuestionProcessor`.
- [ ] Route `INTERVIEW_QUESTION_GENERATION` in the Worker runtime and run Worker tests.

### Task 4: Recovery and end-to-end coverage

- [ ] Add `INTERVIEW_QUESTION_GENERATION` to recoverable task types without changing interview status.
- [ ] Add API E2E tests for validation, ownership, concurrency, queue failure, pagination order, GENERATING visibility, and READY question redaction.
- [ ] Add Worker integration coverage for BullMQ to PostgreSQL and duplicate delivery.

### Task 5: Smoke, verification, and delivery

- [ ] Extend `docs/smoke-test.md` with interview creation and query examples.
- [ ] Run a real API to BullMQ to Worker to PostgreSQL smoke test.
- [ ] Run all requested validation, unit, E2E, integration, and build commands.
- [ ] Confirm no Prisma schema or migration changes, then commit `feat: add deterministic interview question workflow`.
