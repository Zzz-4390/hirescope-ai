# Deterministic Interview Report Design

## Scope

Implement the backend-only deterministic interview report workflow. The change adds report creation and query APIs, deterministic report generation, worker processing, and pending-task recovery. It does not modify Prisma schema or migrations, call an AI provider, or add frontend behavior.

## API design

`InterviewReportsService` owns report lifecycle behavior and is injected into the existing `InterviewsController`.

- `POST /interviews/:interviewId/report` locks the user-owned interview in a database transaction. Only `SUBMITTED` creates an `INTERVIEW_REPORT_GENERATION` task and transitions the interview to `REPORT_GENERATING` in that same transaction.
- `REPORT_GENERATING` returns the existing active task idempotently. `COMPLETED` returns the existing report idempotently. Other states return `409 INTERVIEW_REPORT_NOT_ALLOWED`.
- Queue publication happens only after transaction commit. Success updates the task to `QUEUED` with `bullJobId = task.id`. Failure leaves the task `PENDING` and the interview `REPORT_GENERATING`, and returns a sanitized `503 QUEUE_UNAVAILABLE` response.
- `GET /interviews/:interviewId/report` returns `{ status: REPORT_GENERATING, report: null }` while processing and a public report projection after completion. `SUBMITTED` without a report returns `404 INTERVIEW_REPORT_NOT_FOUND`; invalid lifecycle states return `409`.
- All lookups include `userId`, so missing and foreign interviews both return `404 INTERVIEW_NOT_FOUND`. Public projections never include question `referencePoints` or internal raw fields.

## Report contract and scoring

The shared package exports a strict `InterviewReportResultSchema`. It validates integer scores from 0 through 100, fixed dimensions, complete per-question reviews, non-empty strengths and improvements, and model `deterministic-interview-report-v1`.

`DeterministicInterviewReportService` is a pure service. It normalizes text and derives each score from answer length, case-insensitive reference-point phrase matches, and question keyword matches. It clamps scores, averages them for `overallScore`, derives four stable dimension scores, and emits deterministic Chinese summaries/comments. No randomness or network access is used.

## Worker and atomicity

`InterviewReportProcessor` receives only `taskId`, reloads all business data from PostgreSQL, validates task type/status and ownership, then claims the task with row locks. It reads questions, answers, and internal `referencePoints` only inside the worker.

The processor validates answer count and generated output before persistence. The terminal transaction re-locks task/interview/project, creates the unique interview report, transitions the interview to `COMPLETED`, and transitions the task to `SUCCEEDED`. Existing reports and succeeded tasks return idempotently without another insert. A deleting project cancels the task without completing the interview. Invalid input or output atomically marks the task and interview failed without a partial report, using sanitized failure messages.

## Recovery and verification

`TaskRecoveryService` includes `INTERVIEW_REPORT_GENERATION` in its locked `PENDING`/null-`bullJobId` selection and publishes only `{ taskId }`. A failed publish leaves the row unchanged.

Verification covers shared schema tests, API unit/E2E tests, deterministic generator tests, processor unit/integration tests, recovery tests, database constraints, typechecks, builds, and `prisma validate`.
