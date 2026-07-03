import { InterviewStatus } from '@prisma/client';

type InterviewRow = { id: string; title: string; status: InterviewStatus; difficulty: string; questionCount: number; currentIndex: number; failureCode: string | null; failureMessage: string | null; createdAt: Date; updatedAt: Date };
export function mapInterview(interview: InterviewRow) { const { failureCode, failureMessage, ...fields } = interview; return { ...fields, failure: failureCode ? { code: failureCode, message: failureMessage } : null }; }
export function mapInterviewDetail<T extends InterviewRow & { questions: Array<{ id: string; sequence: number; category: string; difficulty: string; question: string }> }>(interview: T) {
  const { questions, ...base } = interview; return interview.status === InterviewStatus.READY ? { ...mapInterview(base), questions: questions.map(({ id, sequence, category, difficulty, question }) => ({ id, sequence, category, difficulty, question })) } : mapInterview(base);
}
