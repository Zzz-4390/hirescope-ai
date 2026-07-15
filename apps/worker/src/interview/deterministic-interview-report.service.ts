import type { InterviewReportResult } from '@hirescope/shared-types';

export interface ReportInterviewInput { id: string; questionCount: number }
export interface ReportQuestionInput { id: string; sequence: number; category?: string; question: string; referencePoints: string[] }
export interface ReportAnswerInput { questionId: string; content: string }
export interface ReportProjectContextInput { summary?: string; techStack?: unknown; coreModules?: unknown }
export interface SemanticJudgePoint { score: number; evidence: string[] }
export type SemanticJudgeOverrides = Record<string, Record<string, SemanticJudgePoint>>;

const MODEL = 'deterministic-interview-report-v1' as const;
const GENERIC_RUBRIC_POINT = '说明实现机制或工程边界';

export class DeterministicInterviewReportService {
  generate(
    interview: ReportInterviewInput,
    questions: ReportQuestionInput[],
    answers: ReportAnswerInput[],
    projectContext: ReportProjectContextInput = {},
    semanticOverrides: SemanticJudgeOverrides = {},
  ): InterviewReportResult {
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
    const ordered = [...questions].sort((left, right) => left.sequence - right.sequence).slice(0, interview.questionCount);
    const questionReviews = ordered.map((question) => {
      const answer = answerByQuestion.get(question.id) ?? '';
      const rubric = buildRubric(question.referencePoints).map(({ point, weight }) => {
        const deterministicEvidence = evidenceForPoint(answer, point);
        const judged = semanticOverrides[question.id]?.[point];
        const judgeEvidence = judged?.evidence.filter((evidence) => answerContainsSentence(answer, evidence)) ?? [];
        const deterministicScore = deterministicEvidence.length > 0 ? weight : 0;
        const judgeScore = judged && judgeEvidence.length > 0 && Number.isInteger(judged.score) && judged.score >= 0 && judged.score <= weight
          ? judged.score
          : 0;
        const score = Math.max(deterministicScore, judgeScore);
        const evidence = score > 0 ? unique(deterministicEvidence.length > 0 ? deterministicEvidence : judgeEvidence) : [];
        return { point, weight, score, matched: score > 0, evidence };
      });
      const score = rubric.reduce((total, point) => total + point.score, 0);
      const coveredPoints = rubric.filter((point) => point.matched).map((point) => point.point);
      const missedPoints = rubric.filter((point) => !point.matched).map((point) => point.point);
      const answerEvidence = unique(rubric.flatMap((point) => point.evidence));
      const matchedReferencePoints = coveredPoints.length;
      const totalReferencePoints = rubric.length;
      const context = projectContextLabel(projectContext);
      const summary = coveredPoints.length
        ? `本题得分 ${score} 分，命中：${coveredPoints.join('、')}；${missedPoints.length ? `仍需补充：${missedPoints.join('、')}。` : '评分点已完整覆盖。'}`
        : `本题得分 0 分，答案未提供可验证的评分点证据；建议围绕 ${missedPoints.join('、')} 说明具体实现。`;
      const strengths = coveredPoints.length
        ? [`答案以可核验的原句说明了 ${coveredPoints.join('、')}。`]
        : ['答案已提交，但缺少与本题评分点直接对应的可核验证据。'];
      const improvements = missedPoints.length
        ? missedPoints.map((point) => `结合${context}补充“${point}”的实现、失败场景和取舍。`)
        : [`结合${context}进一步说明异常边界、监控和验证方式。`];
      const excerpt = compact(answer, 100) || '请补充具体实现说明';
      const improvedAnswerExample = missedPoints.length
        ? `${excerpt}。还应补充 ${missedPoints.join('、')} 的实现方式、异常处理和验证依据。`
        : `${excerpt}。可进一步补充失败场景、监控指标和工程取舍。`;
      return { questionId: question.id, sequence: question.sequence, score, comment: summary, summary, coveredPoints, missedPoints, strengths, improvements, improvedAnswerExample, matchedReferencePoints, totalReferencePoints, rubric, answerEvidence };
    });
    const overallScore = clamp(Math.round(questionReviews.reduce((sum, review) => sum + review.score, 0) / Math.max(1, questionReviews.length)));
    const dimensions = { projectUnderstanding: clamp(overallScore + 2), technicalAccuracy: overallScore, communication: clamp(overallScore - 2), problemSolving: clamp(overallScore + 1) };
    const strongest = questionReviews.reduce((best, review) => review.score > best.score ? review : best, questionReviews[0]!);
    const weakest = questionReviews.reduce((worst, review) => review.score < worst.score ? review : worst, questionReviews[0]!);
    const strengths = [overallScore >= 70 ? `第 ${strongest.sequence} 题的关键评分点覆盖较完整。` : '已完成全部面试作答，可继续用具体实现证据提高评分。'];
    const improvements = [weakest.missedPoints.length ? `第 ${weakest.sequence} 题建议补充：${weakest.missedPoints.join('、')}。` : '可进一步补充异常场景、安全边界和工程权衡。'];
    const summary = overallScore >= 80 ? '候选人能够以答案证据覆盖主要技术评分点，整体理解较完整。' : overallScore >= 60 ? '候选人覆盖了部分关键实现，但仍可补充技术细节和边界。' : '候选人需要围绕每题评分点补充可验证的实现细节。';
    return { overallScore, summary, dimensions, questionReviews, strengths, improvements, model: MODEL };
  }
}

function buildRubric(referencePoints: string[]): Array<{ point: string; weight: number }> {
  const points = unique(referencePoints.flatMap(splitReferencePoint).filter(Boolean));
  if (points.length < 2) points.push(GENERIC_RUBRIC_POINT);
  const base = Math.floor(100 / points.length);
  return points.map((point, index) => ({ point, weight: base + (index < 100 % points.length ? 1 : 0) }));
}

function splitReferencePoint(point: string): string[] {
  return point.split(/(?:、|，|,|；|;|\s+and\s+|和|与|及|并且)/iu).map((value) => value.trim()).filter((value) => value.length > 0);
}

function evidenceForPoint(answer: string, point: string): string[] {
  if (!answer.trim()) return [];
  const candidates = point === GENERIC_RUBRIC_POINT ? sentences(answer).filter((sentence) => sentence.length >= 12) : sentences(answer).filter((sentence) => coversPoint(sentence, point));
  return candidates.slice(0, 2);
}

function coversPoint(sentence: string, point: string): boolean {
  const normalizedSentence = normalize(sentence);
  const aliases = aliasesFor(point);
  return aliases.some((alias) => normalizedSentence.includes(alias) && !isNegated(normalizedSentence, alias));
}

function aliasesFor(point: string): string[] {
  const normalizedPoint = normalize(point);
  const groups: Array<string[]> = [
    ['jwt', 'json web token', 'token', '令牌'],
    ['认证', '鉴权', '身份验证', 'authentication'],
    ['异常处理', '统一异常', '错误处理', 'exception handling', 'error handling'],
    ['事务', 'transaction', 'acid', '提交', '回滚'],
    ['行级锁', '行锁', 'select for update', '悲观锁', '记录锁', 'row-level lock'],
    ['redis', '缓存', '分布式缓存'],
    ['bullmq', '消息队列', '任务队列', '后台任务', 'queue'],
    ['权限', '授权', '访问控制', 'rbac', 'acl', 'authorization'],
    ['幂等', '幂等性', '重复请求', '去重', 'idempotent', 'idempotency'],
  ];
  const group = groups.find((values) => values.some((value) => normalizedPoint.includes(normalize(value))));
  return unique([normalizedPoint, ...(group ?? []).map(normalize)]).filter((value) => value.length > 0);
}

function answerContainsSentence(answer: string, evidence: string): boolean {
  const normalizedEvidence = normalize(evidence);
  return normalizedEvidence.length > 0 && sentences(answer).some((sentence) => normalize(sentence) === normalizedEvidence);
}

function sentences(answer: string): string[] {
  return answer.split(/(?<=[。！？!?；;\n])/u).map((sentence) => sentence.trim()).filter(Boolean);
}
function isNegated(sentence: string, alias: string): boolean {
  const index = sentence.indexOf(alias);
  return index >= 0 && /(?:没有|并未|尚未|未|不使用|缺少|欠缺)[^，。；,.]{0,12}$/u.test(sentence.slice(Math.max(0, index - 14), index));
}
function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function compact(value: string, maxLength: number): string { const text = value.replace(/\s+/g, ' ').trim(); return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`; }
function projectContextLabel(context: ReportProjectContextInput): string {
  const stack = Array.isArray(context.techStack) ? context.techStack.map(namedValue).filter(Boolean).slice(0, 3) : [];
  const modules = Array.isArray(context.coreModules) ? context.coreModules.map(namedValue).filter(Boolean).slice(0, 2) : [];
  return [...stack, ...modules].join('、') || compact(context.summary ?? '', 40) || '当前项目实现';
}
function namedValue(value: unknown): string { return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' ? value.name : ''; }
