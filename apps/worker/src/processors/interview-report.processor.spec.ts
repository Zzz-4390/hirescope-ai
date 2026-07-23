import { InterviewStatus, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewReportProcessor } from './interview-report.processor';

describe('InterviewReportProcessor', () => {
  it('creates the report and all terminal state changes atomically', async () => {
    const { processor, generator, tx } = setup();
    await processor.process('task');
    expect(generator.generate).toHaveBeenCalledWith(
      { id: 'interview', questionCount: 2 },
      expect.arrayContaining([expect.objectContaining({ id: 'q1', category: 'auth', referencePoints: ['point'] })]),
      expect.arrayContaining([expect.objectContaining({ questionId: 'q1', content: 'point answer' })]),
      expect.objectContaining({ summary: 'summary', techStack: [{ name: 'TypeScript' }] }),
      { userId: 'user', projectId: 'project', taskId: 'task' },
    );
    expect(tx.interviewReport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ interviewId: 'interview', userId: 'user', overallScore: 80, model: 'deterministic-interview-report-v1' }) }));
    expect(tx.interview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.COMPLETED, completedAt: expect.any(Date) }) }));
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED, progress: 100 }) }));
  });

  it('uses only scoring points from evidence metadata and does not pass paths to the report generator', async () => {
    const value = task();
    value.interview.questions[0].referencePoints = { points: ['point'], evidencePaths: ['src/auth.ts'] };
    const { processor, generator } = setup(value);
    await processor.process('task');
    const questions = generator.generate.mock.calls[0]![1];
    expect(questions[0].referencePoints).toEqual(['point']);
    expect(JSON.stringify(questions)).not.toContain('src/auth.ts');
  });

  it('returns idempotently for succeeded tasks and preserves the single report produced by a concurrent retry', async () => {
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

  it('moves unexpected generator failures to terminal database state', async () => {
    const { processor, generator, tx } = setup();
    generator.generate.mockRejectedValue(new Error('unexpected generator failure'));
    await processor.process('task');
    expect(tx.interviewReport.create).not.toHaveBeenCalled();
    expect(tx.interview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.FAILED, failureCode: 'INTERVIEW_REPORT_GENERATION_FAILED' }) }));
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.FAILED, failureCode: 'INTERVIEW_REPORT_GENERATION_FAILED' }) }));
  });

  it('cancels a deleting project without writing or completing the interview', async () => {
    const { processor, tx } = setup(task(TaskStatus.QUEUED, ProjectStatus.DELETING));
    await processor.process('task');
    expect(tx.interviewReport.create).not.toHaveBeenCalled();
    expect(tx.interview.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.COMPLETED }) }));
    expect(tx.asyncTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING' }) }));
    expect(tx.interview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.FAILED, failureCode: 'RESOURCE_DELETING' }) }));
  });

  it('cancels instead of writing a failure when deletion starts during generation', async () => {
    const { processor, tx } = setup(task(), { overallScore: 101 });
    tx.$queryRaw
      .mockResolvedValueOnce([{ taskStatus: TaskStatus.QUEUED, interviewStatus: InterviewStatus.REPORT_GENERATING, projectStatus: ProjectStatus.COMPLETED }])
      .mockResolvedValueOnce([{ taskStatus: TaskStatus.PROCESSING, interviewStatus: InterviewStatus.REPORT_GENERATING, projectStatus: ProjectStatus.DELETING }]);
    await processor.process('task');
    expect(tx.interviewReport.create).not.toHaveBeenCalled();
    expect(tx.interview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.FAILED, failureCode: 'RESOURCE_DELETING' }) }));
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING' }) }));
  });
});

function setup(value = task(), generated: any = validReport()) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ taskStatus: value.status, interviewStatus: value.interview.status, projectStatus: value.project.status }]),
    asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}) },
    interview: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    interviewReport: { findUnique: vi.fn().mockResolvedValue(value.interview.report), create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue(value) }, $transaction: vi.fn((callback) => callback(tx)) };
  const generator = { generate: vi.fn().mockReturnValue(generated) };
  return { processor: new InterviewReportProcessor(prisma as never, generator as never), generator, tx };
}
function task(status: TaskStatus = TaskStatus.QUEUED, projectStatus: ProjectStatus = ProjectStatus.COMPLETED, interviewStatus: InterviewStatus = InterviewStatus.REPORT_GENERATING, hasReport = false): any {
  return { id: 'task', type: TaskType.INTERVIEW_REPORT_GENERATION, status, userId: 'user', projectId: 'project', interviewId: 'interview', project: { status: projectStatus, analysis: { summary: 'summary', techStack: [{ name: 'TypeScript' }], coreModules: [] } }, interview: { id: 'interview', userId: 'user', status: interviewStatus, questionCount: 2, report: hasReport ? { id: 'report' } : null, questions: [{ id: 'q1', sequence: 1, category: 'auth', question: 'Q1', referencePoints: ['point'], answer: { questionId: 'q1', content: 'point answer' } }, { id: 'q2', sequence: 2, category: 'database', question: 'Q2', referencePoints: ['detail'], answer: { questionId: 'q2', content: 'detail answer' } }] } };
}
function validReport() { const review = (questionId: string, sequence: number) => ({ questionId, sequence, score: 80, comment: 'ok', summary: 'specific summary', coveredPoints: ['point'], missedPoints: [], strengths: ['strength'], improvements: ['improvement'], improvedAnswerExample: 'better answer', matchedReferencePoints: 1, totalReferencePoints: 1, rubric: [{ point: 'point', weight: 80, score: 80, matched: true, evidence: ['point answer'] }, { point: 'boundary', weight: 20, score: 0, matched: false, evidence: [] }], answerEvidence: ['point answer'] }); return { overallScore: 80, summary: 'summary', dimensions: { projectUnderstanding: 82, technicalAccuracy: 80, communication: 78, problemSolving: 81 }, questionReviews: [review('q1', 1), review('q2', 2)], strengths: ['strength'], improvements: ['improvement'], model: 'deterministic-interview-report-v1' }; }
