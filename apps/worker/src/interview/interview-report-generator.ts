import type { InterviewReportResult } from '@hirescope/shared-types';
import { DeterministicInterviewReportService, type ReportAnswerInput, type ReportInterviewInput, type ReportProjectContextInput, type ReportQuestionInput } from './deterministic-interview-report.service';

export interface InterviewReportGenerationContext { userId: string; projectId: string; taskId: string }
export interface InterviewReportGenerator {
  generate(
    interview: ReportInterviewInput,
    questions: ReportQuestionInput[],
    answers: ReportAnswerInput[],
    projectContext: ReportProjectContextInput,
    context: InterviewReportGenerationContext,
  ): InterviewReportResult | Promise<InterviewReportResult>;
}

export class DeterministicInterviewReportGenerator implements InterviewReportGenerator {
  constructor(private readonly deterministic = new DeterministicInterviewReportService()) {}

  generate(interview: ReportInterviewInput, questions: ReportQuestionInput[], answers: ReportAnswerInput[], projectContext: ReportProjectContextInput): InterviewReportResult {
    return this.deterministic.generate(interview, questions, answers, projectContext);
  }
}
