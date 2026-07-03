# Deterministic Code Review Design

## Scope

Add the backend-only asynchronous CodeReview workflow without changing the Prisma schema or calling an AI provider. The reviewer consumes only the existing `project_analyses` record.

## API

- `POST /api/v1/projects/:projectId/code-reviews` creates a `code_reviews` row and a `CODE_REVIEW` `async_tasks` row in one transaction and returns HTTP 202.
- `GET /api/v1/projects/:projectId/code-reviews?page=1&pageSize=20` returns owned reviews newest first.
- `GET /api/v1/code-reviews/:codeReviewId` returns owned review detail and its task state.
- Missing, foreign, deleting, or deleted projects return 404. A non-`COMPLETED` project returns `409 PROJECT_NOT_READY`.
- `PENDING`, `QUEUED`, and `PROCESSING` CODE_REVIEW tasks are active. Creation serializes on the project row; an active task returns `409 TASK_ALREADY_ACTIVE` and the transaction creates no orphan review.
- Queue publishing occurs after commit. Success moves both records to `QUEUED`; failure leaves both `PENDING` for recovery and returns `503 TASK_QUEUE_UNAVAILABLE`.

## Worker

`CodeReviewProcessor` accepts only a task ID, verifies the task type and relations, and atomically claims `QUEUED` work. Deleting projects cancel with `RESOURCE_DELETING`; other non-completed projects fail with `PROJECT_NOT_READY`. Terminal success is idempotent.

`DeterministicCodeReviewService` reads `techStack`, `coreModules`, and `statistics` from `project_analyses`. It returns stable `overview`, `strengths`, `risks`, `suggestions`, `maintainability`, `security`, and `performance` fields, a score from 0 to 100, a stable summary, and model `deterministic-code-review-v1`. `CodeReviewResultSchema` validates the JSON before persistence; invalid output fails with `CODE_REVIEW_RESULT_INVALID` without writing `result`.

## Recovery and testing

`TaskRecoveryService` includes `CODE_REVIEW` and, after republishing, updates both task and review to `QUEUED`. Tests cover contracts, ownership, status gates, duplicate creation, safe response mapping, processor success/cancellation/invalid output/idempotency/type mismatch, recovery, E2E, integration, and a real HTTP/BullMQ/Worker/PostgreSQL smoke flow.
