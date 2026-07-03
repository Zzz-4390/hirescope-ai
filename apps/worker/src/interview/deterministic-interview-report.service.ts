import type { InterviewReportResult } from '@hirescope/shared-types';

export interface ReportInterviewInput { id: string; questionCount: number }
export interface ReportQuestionInput { id: string; sequence: number; question: string; referencePoints: string[] }
export interface ReportAnswerInput { questionId: string; content: string }

const MODEL = 'deterministic-interview-report-v1' as const;

export class DeterministicInterviewReportService {
  generate(interview: ReportInterviewInput, questions: ReportQuestionInput[], answers: ReportAnswerInput[]): InterviewReportResult {
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
    const ordered = [...questions].sort((left, right) => left.sequence - right.sequence).slice(0, interview.questionCount);
    const questionReviews = ordered.map((question) => {
      const answer = answerByQuestion.get(question.id) ?? '';
      const normalizedAnswer = normalize(answer);
      const matchedReferencePoints = question.referencePoints.filter((point) => normalizedAnswer.includes(normalize(point))).length;
      const totalReferencePoints = question.referencePoints.length;
      const keywords = questionKeywords(question.question);
      const matchedKeywords = keywords.filter((keyword) => normalizedAnswer.includes(keyword)).length;
      const referenceScore = totalReferencePoints === 0 ? 20 : Math.round(40 * matchedReferencePoints / totalReferencePoints);
      const keywordScore = keywords.length === 0 ? 5 : Math.round(10 * matchedKeywords / keywords.length);
      const score = clamp(Math.round(20 + Math.min(30, answer.trim().length / 4) + referenceScore + keywordScore));
      const comment = matchedReferencePoints === totalReferencePoints && totalReferencePoints > 0
        ? '回答覆盖了本题全部参考要点，表达较为完整。'
        : matchedReferencePoints > 0
          ? `回答覆盖了 ${matchedReferencePoints}/${totalReferencePoints} 个参考要点，仍可补充关键细节。`
          : '回答尚未覆盖主要参考要点，建议结合项目实现补充说明。';
      return { questionId: question.id, sequence: question.sequence, score, comment, matchedReferencePoints, totalReferencePoints };
    });
    const overallScore = clamp(Math.round(questionReviews.reduce((sum, review) => sum + review.score, 0) / Math.max(1, questionReviews.length)));
    const dimensions = {
      projectUnderstanding: clamp(overallScore + 2),
      technicalAccuracy: clamp(overallScore),
      communication: clamp(overallScore - 2),
      problemSolving: clamp(overallScore + 1),
    };
    const strongest = questionReviews.reduce((best, review) => review.score > best.score ? review : best, questionReviews[0]!);
    const weakest = questionReviews.reduce((worst, review) => review.score < worst.score ? review : worst, questionReviews[0]!);
    const strengths = [overallScore >= 70 ? `第 ${strongest.sequence} 题体现了较好的项目理解和技术表达。` : '能够完成全部面试题并给出与项目相关的回答。'];
    const improvements = [weakest.matchedReferencePoints < weakest.totalReferencePoints ? `第 ${weakest.sequence} 题可继续补充未覆盖的关键技术要点。` : '可以进一步补充异常场景、安全边界和工程权衡。'];
    const summary = overallScore >= 80
      ? '候选人对项目核心设计和实现具有较清晰的理解，回答整体完整且技术要点覆盖较好。'
      : overallScore >= 60
        ? '候选人能够说明项目主要实现，但部分技术细节、异常处理或工程权衡仍可进一步展开。'
        : '候选人已完成面试回答，但对项目关键技术点的覆盖不足，需要补充实现细节和设计依据。';
    return { overallScore, summary, dimensions, questionReviews, strengths, improvements, model: MODEL };
  }
}

function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function questionKeywords(question: string): string[] {
  const tokens = normalize(question).match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  return [...new Set(tokens)].slice(0, 8);
}
