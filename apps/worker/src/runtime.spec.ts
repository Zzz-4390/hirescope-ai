import { TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiInterviewQuestionService } from './interview/ai-interview-question.service';
import { DeterministicInterviewQuestionService } from './interview/deterministic-interview-question.service';
import { createInterviewQuestionGenerator, createTaskHandler } from './runtime';

describe('worker runtime routing', () => {
  it('routes by the PostgreSQL task type instead of the BullMQ job name', async () => {
    const analysis = { process: vi.fn() };
    const cleanup = { process: vi.fn() };
    const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue({ type: TaskType.PROJECT_CLEANUP }) } };
    const handler = createTaskHandler(prisma as never, analysis as never, cleanup as never);
    await handler({ name: TaskType.PROJECT_ANALYSIS, data: { taskId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4' } } as never);
    expect(cleanup.process).toHaveBeenCalledWith('8d73fbe6-0f0b-43fc-af01-81b0d7af76c4');
    expect(analysis.process).not.toHaveBeenCalled();
  });

  it('routes INTERVIEW_REPORT_GENERATION using only the validated taskId', async () => {
    const reports = { process: vi.fn() };
    const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue({ type: TaskType.INTERVIEW_REPORT_GENERATION, status: 'QUEUED' }) } };
    const handler = createTaskHandler(prisma as never, { process: vi.fn() } as never, { process: vi.fn() } as never, undefined, undefined, reports as never);
    const taskId = '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4';
    await handler({ name: 'untrusted-name', data: { taskId } } as never);
    expect(reports.process).toHaveBeenCalledWith(taskId);
  });

  it('uses deterministic questions without AI config and the AI service with complete config', () => {
    const prisma = { aiCallLog: { create: vi.fn() } };
    expect(createInterviewQuestionGenerator(prisma as never)).toBeInstanceOf(DeterministicInterviewQuestionService);
    expect(createInterviewQuestionGenerator(prisma as never, {
      baseUrl: 'https://provider.example/v1',
      apiKey: 'server-only-key',
      model: 'test-model',
    })).toBeInstanceOf(AiInterviewQuestionService);
  });
});
