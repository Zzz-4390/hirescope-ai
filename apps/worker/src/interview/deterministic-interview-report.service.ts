import type { InterviewReportResult } from '@hirescope/shared-types';

export interface ReportInterviewInput { id: string; questionCount: number }
export interface ReportQuestionInput { id: string; sequence: number; category?: string; question: string; referencePoints: string[] }
export interface ReportAnswerInput { questionId: string; content: string }
export interface ReportProjectContextInput { summary?: string; techStack?: unknown; coreModules?: unknown }

const MODEL = 'deterministic-interview-report-v1' as const;

export class DeterministicInterviewReportService {
  generate(interview: ReportInterviewInput, questions: ReportQuestionInput[], answers: ReportAnswerInput[], projectContext: ReportProjectContextInput = {}): InterviewReportResult {
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
    const ordered = [...questions].sort((left, right) => left.sequence - right.sequence).slice(0, interview.questionCount);
    const questionReviews = ordered.map((question) => {
      const answer = answerByQuestion.get(question.id) ?? '';
      const normalizedAnswer = normalize(answer);
      const coveredPoints = question.referencePoints.filter((point) => isPointCovered(normalizedAnswer, point));
      const missedPoints = question.referencePoints.filter((point) => !isPointCovered(normalizedAnswer, point));
      const matchedReferencePoints = coveredPoints.length;
      const totalReferencePoints = question.referencePoints.length;
      const keywords = questionKeywords(question.question);
      const matchedKeywords = keywords.filter((keyword) => normalizedAnswer.includes(keyword)).length;
      const referenceScore = totalReferencePoints === 0 ? 20 : Math.round(40 * matchedReferencePoints / totalReferencePoints);
      const keywordScore = keywords.length === 0 ? 5 : Math.round(10 * matchedKeywords / keywords.length);
      const score = clamp(Math.round(20 + Math.min(30, answer.trim().length / 4) + referenceScore + keywordScore));
      const context = projectContextLabel(projectContext);
      const answerExcerpt = compact(answer, 80) || '未提供有效回答';
      const coveredText = coveredPoints.length ? `已说明“${coveredPoints.join('、')}”` : `回答主要提到“${answerExcerpt}”`;
      const missedText = missedPoints.length ? `但未说明“${missedPoints.join('、')}”` : '且已覆盖本题参考要点';
      const summary = `针对“${compact(question.question, 60)}”，${coveredText}，${missedText}。`;
      const strengths = coveredPoints.length
        ? [`回答明确命中本题的“${coveredPoints.join('、')}”，与实际作答一致。`]
        : [`回答围绕“${compact(question.question, 36)}”展开，未偏离当前题目。`];
      const improvements = missedPoints.length
        ? missedPoints.map((point) => `结合${context}，补充“${point}”的具体实现、异常边界和设计取舍。`)
        : [`结合${context}，为“${coveredPoints[0] ?? compact(question.question, 24)}”补充失败场景与工程权衡。`];
      const improvedAnswerExample = `${answerExcerpt}。${missedPoints.length ? `在${context}中，还应说明${missedPoints.join('、')}的实现方式、异常处理和选型依据。` : `进一步结合${context}说明异常边界、安全性与设计取舍。`}`;
      return { questionId: question.id, sequence: question.sequence, score, comment: summary, summary, coveredPoints: [...coveredPoints], missedPoints: [...missedPoints], strengths: [...strengths], improvements: [...improvements], improvedAnswerExample, matchedReferencePoints, totalReferencePoints };
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
function isPointCovered(normalizedAnswer: string, point: string): boolean {
  const normalizedPoint = normalize(point);
  const index = normalizedAnswer.indexOf(normalizedPoint);
  if (index < 0) return false;
  const prefix = normalizedAnswer.slice(Math.max(0, index - 12), index);
  return !/(?:没有|并未|未|尚未|不使用|缺少|欠缺)[^,.，。；;]{0,8}$/.test(prefix);
}
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function questionKeywords(question: string): string[] {
  const tokens = normalize(question).match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  return [...new Set(tokens)].slice(0, 8);
}
function compact(value: string, maxLength: number): string { const text = value.replace(/\s+/g, ' ').trim(); return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`; }
function projectContextLabel(context: ReportProjectContextInput): string {
  const stack = Array.isArray(context.techStack) ? context.techStack.map(namedValue).filter(Boolean).slice(0, 3) : [];
  const modules = Array.isArray(context.coreModules) ? context.coreModules.map(namedValue).filter(Boolean).slice(0, 2) : [];
  const details = [...stack, ...modules];
  if (details.length) return `项目的 ${details.join('、')}`;
  return compact(context.summary ?? '', 40) || '当前项目实现';
}
function namedValue(value: unknown): string { return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' ? value.name : ''; }
