import { InterviewStatus, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewReportProcessor } from './interview-report.processor';

describe('InterviewReportProcessor', () => {
  it('creates the report and all terminal state changes atomically', async () => {
    const { processor, tx } = setup();
    await processor.process('task');
    expect(tx.interviewReport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ interviewId: 'interview', userId: 'user', overallScore: 80, model: 'deterministic-interview-report-v1' }) }));
    expect(tx.interview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.COMPLETED, completedAt: expect.any(Date) }) }));
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED, progress: 100 }) }));
  });

  it('returns idempotently for succeeded tasks and existing completed reports', async () => {
    const succeeded = setup(task(TaskStatus.SUCCEEDED));
    await succeeded.processor.process('task');
    expect(succeeded.generator.generate).not.toHaveBeenCalled();
    const existing = setup(task(TaskStatus.QUEUED, ProjectStatus.COMPLETED, InterviewStatus.COMPLETED, true));
    await existing.processor.process('task');
    expect(existing.generator.generate).not.toHaveBeenCalled();
    expect(existing.tx.asyncTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED }) }));
    expect(existing.tx.interviewReport.create).not.toHaveBeenCalled();
  });

  it('fails incomplete answers without writing a partial report', async () => {
    const value = task(); value.interview.questions[1].answer = null;
    const { processor, tx } = setup(value);
    await processor.process('task');
    expect(tx.interviewReport.create).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.FAILED, failureCode: 'INTERVIEW_REPORT_INPUT_INVALID' }) }));
  });

  it('fails invalid generated output without writing a partial report', async () => {
    const { processor, tx } = setup(task(), { overallScore: 101 });
    await processor.process('task');
    expect(tx.interviewReport.create).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureCode: 'INTERVIEW_REPORT_RESULT_INVALID' }) }));
  });

  it('cancels a deleting project without writing or completing the interview', async () => {
    const { processor, tx } = setup(task(TaskStatus.QUEUED, ProjectStatus.DELETING));
    await processor.process('task');
    expect(tx.interviewReport.create).not.toHaveBeenCalled();
    expect(tx.interview.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.COMPLETED }) }));
    expect(tx.asyncTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING' }) }));
  });
});

function setup(value = task(), generated: any = validReport()) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ taskStatus: value.status, interviewStatus: value.interview.status, projectStatus: value.project.status }]),
    asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}) },
    interview: { update: vi.fn().mockResolvedValue({}) },
    interviewReport: { findUnique: vi.fn().mockResolvedValue(value.interview.report), create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue(value) }, $transaction: vi.fn((callback) => callback(tx)) };
  const generator = { generate: vi.fn().mockReturnValue(generated) };
  return { processor: new InterviewReportProcessor(prisma as never, generator as never), generator, tx };
}
function task(status: TaskStatus = TaskStatus.QUEUED, projectStatus: ProjectStatus = ProjectStatus.COMPLETED, interviewStatus: InterviewStatus = InterviewStatus.REPORT_GENERATING, hasReport = false): any {
  return { id: 'task', type: TaskType.INTERVIEW_REPORT_GENERATION, status, userId: 'user', projectId: 'project', interviewId: 'interview', project: { status: projectStatus }, interview: { id: 'interview', userId: 'user', status: interviewStatus, questionCount: 2, report: hasReport ? { id: 'report' } : null, questions: [{ id: 'q1', sequence: 1, question: 'Q1', referencePoints: ['point'], answer: { questionId: 'q1', content: 'point answer' } }, { id: 'q2', sequence: 2, question: 'Q2', referencePoints: ['detail'], answer: { questionId: 'q2', content: 'detail answer' } }] } };
}
function validReport() { return { overallScore: 80, summary: 'summary', dimensions: { projectUnderstanding: 82, technicalAccuracy: 80, communication: 78, problemSolving: 81 }, questionReviews: [{ questionId: 'q1', sequence: 1, score: 80, comment: 'ok', matchedReferencePoints: 1, totalReferencePoints: 1 }, { questionId: 'q2', sequence: 2, score: 80, comment: 'ok', matchedReferencePoints: 1, totalReferencePoints: 1 }], strengths: ['strength'], improvements: ['improvement'], model: 'deterministic-interview-report-v1' }; }
