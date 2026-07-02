-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('UPLOADED', 'QUEUED', 'ANALYZING', 'COMPLETED', 'FAILED', 'DELETING', 'DELETED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('PROJECT_ANALYSIS', 'CODE_REVIEW', 'INTERVIEW_QUESTION_GENERATION', 'INTERVIEW_REPORT_GENERATION', 'PROJECT_CLEANUP');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('GENERATING', 'READY', 'IN_PROGRESS', 'SUBMITTED', 'REPORT_GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "InterviewDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "original_file_name" VARCHAR(255) NOT NULL,
    "zip_storage_path" TEXT,
    "extract_storage_path" TEXT,
    "file_size" BIGINT NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "tech_stack" JSONB NOT NULL,
    "directory_tree" JSONB NOT NULL,
    "core_modules" JSONB NOT NULL,
    "entry_files" JSONB NOT NULL,
    "statistics" JSONB NOT NULL,
    "analyzer_version" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_reviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "summary" TEXT,
    "score" INTEGER,
    "result" JSONB,
    "model" VARCHAR(100),
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "code_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "status" "InterviewStatus" NOT NULL,
    "difficulty" "InterviewDifficulty" NOT NULL,
    "question_count" INTEGER NOT NULL,
    "current_index" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(500),
    "started_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "difficulty" "InterviewDifficulty" NOT NULL,
    "question" TEXT NOT NULL,
    "reference_points" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_reports" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "question_reviews" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interview_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "async_tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "code_review_id" UUID,
    "interview_id" UUID,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "bull_job_id" VARCHAR(100),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(500),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "async_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "task_id" UUID,
    "scene" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "prompt_version" VARCHAR(50),
    "schema_version" VARCHAR(50),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "duration_ms" INTEGER,
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_user_id_created_at_idx" ON "projects"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "projects_user_id_status_idx" ON "projects"("user_id", "status");

-- CreateIndex
CREATE INDEX "projects_user_id_file_hash_idx" ON "projects"("user_id", "file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "project_analyses_project_id_key" ON "project_analyses"("project_id");

-- CreateIndex
CREATE INDEX "code_reviews_user_id_created_at_idx" ON "code_reviews"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "code_reviews_project_id_status_idx" ON "code_reviews"("project_id", "status");

-- CreateIndex
CREATE INDEX "interviews_user_id_created_at_idx" ON "interviews"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "interviews_project_id_status_idx" ON "interviews"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interview_questions_interview_id_sequence_key" ON "interview_questions"("interview_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_question_id_key" ON "interview_answers"("question_id");

-- CreateIndex
CREATE INDEX "interview_answers_interview_id_idx" ON "interview_answers"("interview_id");

-- CreateIndex
CREATE INDEX "interview_answers_user_id_interview_id_idx" ON "interview_answers"("user_id", "interview_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_reports_interview_id_key" ON "interview_reports"("interview_id");

-- CreateIndex
CREATE INDEX "interview_reports_user_id_created_at_idx" ON "interview_reports"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "async_tasks_bull_job_id_key" ON "async_tasks"("bull_job_id");

-- CreateIndex
CREATE INDEX "async_tasks_user_id_status_idx" ON "async_tasks"("user_id", "status");

-- CreateIndex
CREATE INDEX "async_tasks_project_id_type_idx" ON "async_tasks"("project_id", "type");

-- CreateIndex
CREATE INDEX "async_tasks_type_status_idx" ON "async_tasks"("type", "status");

-- CreateIndex
CREATE INDEX "async_tasks_code_review_id_idx" ON "async_tasks"("code_review_id");

-- CreateIndex
CREATE INDEX "async_tasks_interview_id_idx" ON "async_tasks"("interview_id");

-- CreateIndex
CREATE INDEX "ai_call_logs_user_id_created_at_idx" ON "ai_call_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_logs_project_id_created_at_idx" ON "ai_call_logs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_logs_task_id_idx" ON "ai_call_logs"("task_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_analyses" ADD CONSTRAINT "project_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_tasks" ADD CONSTRAINT "async_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_tasks" ADD CONSTRAINT "async_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_tasks" ADD CONSTRAINT "async_tasks_code_review_id_fkey" FOREIGN KEY ("code_review_id") REFERENCES "code_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "async_tasks" ADD CONSTRAINT "async_tasks_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "async_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database constraints that Prisma Schema cannot express.
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
