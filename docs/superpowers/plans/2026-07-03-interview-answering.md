# Interview Answering Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add authenticated interview start, answer upsert, submission, and progress-rich detail APIs without changing the database schema.

**Architecture:** Extend the existing `InterviewsModule`. Each state-changing operation locks the owned interview row in a Prisma transaction; answer saving additionally validates the question-to-interview relation before upsert and progress update.

**Tech Stack:** NestJS, Prisma, PostgreSQL, class-transformer, Vitest, Supertest.

---

### Task 1: Start state machine
- [ ] Add failing service tests for READY, IN_PROGRESS idempotency, invalid states, ownership, and question count.
- [ ] Implement `POST /interviews/:interviewId/start` with row locking and stable errors.

### Task 2: Answer persistence
- [ ] Add failing validation and service tests for trim, bounds, ownership, question relation, upsert, and monotonic `currentIndex`.
- [ ] Implement `PUT /interviews/:interviewId/answers/:questionId` transactionally.

### Task 3: Submit state machine
- [ ] Add failing tests for complete/incomplete, idempotency, invalid states, ownership, timestamps, and final index.
- [ ] Implement `POST /interviews/:interviewId/submit` without creating report tasks.

### Task 4: Detail and E2E
- [ ] Return answered count, progress, questions, and saved answer content without `referencePoints`.
- [ ] Add the full start-answer-submit E2E flow and security/error cases.

### Task 5: Verification and delivery
- [ ] Run shared-types, API unit/E2E, Worker, DB constraints, build, typecheck, and Prisma validation.
- [ ] Confirm no schema/migration or forbidden artifacts changed.
- [ ] Commit `feat: add interview answering workflow`.
