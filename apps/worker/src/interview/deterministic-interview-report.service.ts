import type { InterviewReportResult } from '@hirescope/shared-types';

export interface ReportInterviewInput { id: string; questionCount: number }
export interface ReportQuestionInput { id: string; sequence: number; category?: string; question: string; referencePoints: string[] }
export interface ReportAnswerInput { questionId: string; content: string }
export interface ReportProjectContextInput { summary?: string; techStack?: unknown; coreModules?: unknown }
export interface SemanticJudgePoint { covered: boolean; evidence: string[] }
export type SemanticJudgeOverrides = Record<string, Record<string, SemanticJudgePoint>>;
export interface InterviewReportRubricPoint { point: string; weight: number; synonyms: string[]; criterion: string }

const MODEL = 'deterministic-interview-report-v1' as const;
const EMPTY_REFERENCE_POINT = '说明与题目相关的实现机制';
const DEFAULT_CRITERION = '答案需要说明该评分点如何解决题目中的问题、关键机制或工程边界；只罗列术语不算覆盖。';

interface RubricSemanticGroup { terms: string[]; criterion: string }
const RUBRIC_SEMANTIC_GROUPS: RubricSemanticGroup[] = [
  { terms: ['nestjs', 'nest.js', 'nest', 'guard', 'interceptor', 'dependency injection', '依赖注入', '守卫', '拦截器'], criterion: '说明 NestJS 组件如何参与请求处理、依赖组织或横切能力，而不是只写框架名称。' },
  { terms: ['prisma', 'prisma client', 'orm', '$transaction', 'prisma.$transaction'], criterion: '说明 Prisma 在查询、写入或事务边界中的具体作用。' },
  { terms: ['jwt', 'json web token', 'token', '令牌'], criterion: '说明令牌的签发或校验方式，并体现认证边界或失效处理。' },
  { terms: ['认证', '鉴权', '身份验证', 'authentication'], criterion: '说明如何验证调用方身份以及失败时如何拒绝请求。' },
  { terms: ['异常处理', '统一异常', '错误处理', 'exception handling', 'error handling'], criterion: '说明异常如何被捕获、映射或安全返回，包含失败路径更佳。' },
  { terms: ['事务', 'transaction', 'acid', '$transaction', '提交', '回滚', 'atomic', '原子性'], criterion: '说明哪些操作处于同一事务边界，以及提交、回滚或一致性保证。' },
  { terms: ['行级锁', '行锁', 'select for update', '悲观锁', '记录锁', 'row-level lock'], criterion: '说明锁定对象、并发竞争及锁如何保护临界写入。' },
  { terms: ['userid', 'user id', 'owner', 'ownership', 'resource ownership', '资源归属', '归属校验', '只能访问自己的', 'where userid', '租户隔离'], criterion: '说明服务端如何使用 userId 或所有者条件限制资源访问，不能只说“有权限”。' },
  { terms: ['redis', '缓存', '分布式缓存', 'key-value store'], criterion: '说明 Redis 在缓存、协调或队列基础设施中的具体职责和边界。' },
  { terms: ['bullmq', '消息队列', '任务队列', '后台任务', 'job queue', 'queue', 'worker'], criterion: '说明任务如何入队、消费、重试或恢复，以及 Redis/BullMQ 的职责关系。' },
  { terms: ['权限', '授权', '访问控制', 'rbac', 'acl', 'authorization'], criterion: '说明授权决策依据和资源访问边界。' },
  { terms: ['幂等', '幂等性', '重复请求', '去重', 'idempotent', 'idempotency', 'deduplicate'], criterion: '说明重复调用如何被识别，以及如何避免重复副作用。' },
  { terms: ['测试', '单元测试', '集成测试', '失败测试', '回归测试', 'failure test', 'integration test', 'unit test', 'vitest', 'jest', '断言', 'mock'], criterion: '说明测试目标、关键断言或失败场景；只列出测试框架不算覆盖。' },
  { terms: ['失败场景', '异常场景', '错误路径', 'failure path', 'error path', 'timeout', '超时', '429', '500'], criterion: '说明可预期的失败条件、系统行为及验证或恢复方式。' },
];

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
      const rubricDefinition = buildInterviewReportRubric(question.referencePoints);
      const quality = assessAnswerQuality(answer, rubricDefinition);
      const judgedPoints = semanticOverrides[question.id];
      const scoredRubric = rubricDefinition.map((definition) => {
        const judged = judgedPoints?.[definition.point];
        const evidence = quality.keywordStuffing
          ? []
          : judgedPoints
            ? judged?.covered
              ? canonicalEvidence(answer, judged.evidence)
              : []
            : deterministicEvidence(answer, definition);
        return { point: definition.point, weight: definition.weight, score: evidence.length > 0 ? definition.weight : 0, matched: evidence.length > 0, evidence };
      });
      const rubric = capRubricScore(scoredRubric, quality.scoreCap);
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
    const overallScore = average(questionReviews.map((review) => review.score));
    const dimensions = calculateDimensions(ordered, questionReviews, answerByQuestion, overallScore);
    const strongest = questionReviews.reduce((best, review) => review.score > best.score ? review : best, questionReviews[0]!);
    const weakest = questionReviews.reduce((worst, review) => review.score < worst.score ? review : worst, questionReviews[0]!);
    const strengths = [overallScore >= 70 ? `第 ${strongest.sequence} 题的关键评分点覆盖较完整。` : '已完成全部面试作答，可继续用具体实现证据提高评分。'];
    const improvements = [weakest.missedPoints.length ? `第 ${weakest.sequence} 题建议补充：${weakest.missedPoints.join('、')}。` : '可进一步补充异常场景、安全边界和工程权衡。'];
    const summary = overallScore >= 80 ? '候选人能够以答案证据覆盖主要技术评分点，整体理解较完整。' : overallScore >= 60 ? '候选人覆盖了部分关键实现，但仍可补充技术细节和边界。' : '候选人需要围绕每题评分点补充可验证的实现细节。';
    return { overallScore, summary, dimensions, questionReviews, strengths, improvements, model: MODEL };
  }
}

export function buildInterviewReportRubric(referencePoints: string[]): InterviewReportRubricPoint[] {
  const points = uniqueByNormalized(referencePoints.flatMap(splitReferencePoint).filter(Boolean));
  if (points.length === 0) points.push(EMPTY_REFERENCE_POINT);
  const base = Math.floor(100 / points.length);
  return points.map((point, index) => {
    const groups = semanticGroupsFor(point);
    return {
      point,
      weight: base + (index < 100 % points.length ? 1 : 0),
      synonyms: unique(groups.flatMap((group) => group.terms).filter((term) => normalize(term) !== normalize(point))),
      criterion: groups.length > 0 ? unique(groups.map((group) => group.criterion)).join(' ') : DEFAULT_CRITERION,
    };
  });
}

function splitReferencePoint(point: string): string[] {
  return point.split(/(?:、|；|;|\n|\s+and\s+)/iu).map((value) => value.trim()).filter((value) => value.length > 0);
}

function deterministicEvidence(answer: string, rubric: InterviewReportRubricPoint): string[] {
  if (!answer.trim()) return [];
  const sentences = answerSentences(answer);
  const matchesAliases = (aliases: string[]) => sentences.filter((sentence) => {
    const normalizedSentence = normalize(sentence);
    return sentence.replace(/\s+/g, '').length >= 8
      && aliases.map(normalize).filter(Boolean).some((alias) => normalizedSentence.includes(alias) && !isNegated(normalizedSentence, alias));
  });
  const groups = semanticGroupsFor(rubric.point);
  if (groups.length > 1) {
    const evidenceByGroup = groups.map((group) => matchesAliases(group.terms));
    if (evidenceByGroup.some((evidence) => evidence.length === 0)) return [];
    return unique(evidenceByGroup.flat()).slice(0, 2);
  }
  return matchesAliases([rubric.point, ...rubric.synonyms]).slice(0, 2);
}

function canonicalEvidence(answer: string, evidence: string[]): string[] {
  const source = answerSentences(answer);
  return unique(evidence.flatMap((candidate) => {
    const normalizedCandidate = normalize(candidate);
    const actual = source.find((sentence) => normalize(sentence) === normalizedCandidate);
    return actual ? [actual] : [];
  }));
}

function assessAnswerQuality(answer: string, rubric: InterviewReportRubricPoint[]): { scoreCap: number; keywordStuffing: boolean } {
  const compactAnswer = answer.replace(/\s+/g, ' ').trim();
  if (!compactAnswer) return { scoreCap: 0, keywordStuffing: false };
  const keywordStuffing = looksLikeKeywordStuffing(compactAnswer, rubric);
  if (keywordStuffing) return { scoreCap: 20, keywordStuffing: true };
  const visibleLength = compactAnswer.replace(/\s/g, '').length;
  const latinTokens = compactAnswer.match(/[a-z0-9_$.-]+/giu)?.length ?? 0;
  const cjkCharacters = compactAnswer.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  if (visibleLength < 8) return { scoreCap: 10, keywordStuffing: false };
  if (latinTokens <= 2 && cjkCharacters < 10) return { scoreCap: 25, keywordStuffing: false };
  return { scoreCap: 100, keywordStuffing: false };
}

function looksLikeKeywordStuffing(answer: string, rubric: InterviewReportRubricPoint[]): boolean {
  const normalizedAnswer = normalize(answer);
  const matchedPoints = rubric.filter((point) => [point.point, ...point.synonyms].some((alias) => normalizedAnswer.includes(normalize(alias)))).length;
  if (matchedPoints < 3) return false;
  const hasSemanticRelation = /(?:通过|使用|利用|负责|保证|校验|验证|实现|处理|防止|避免|提交|回滚|发布|消费|存储|读取|限制|断言|模拟|重试|恢复|依赖|调用)/u.test(answer)
    || /\b(?:when|if|because|by|for|to|uses?|using|ensures?|validates?|prevents?|handles?|processes?|writes?|reads?|queues?|caches?|rolls?\s+back|publishes?|consumes?)\b/iu.test(answer);
  return !hasSemanticRelation && answerSentences(answer).length <= 2;
}

function capRubricScore<T extends { point: string; weight: number; score: number; matched: boolean; evidence: string[] }>(rubric: T[], cap: number): T[] {
  const total = rubric.reduce((sum, point) => sum + point.score, 0);
  if (total <= cap) return rubric;
  const scores = rubric.map((point) => Math.floor(point.score * cap / total));
  let remainder = cap - scores.reduce((sum, score) => sum + score, 0);
  for (let index = 0; remainder > 0 && index < rubric.length; index += 1) {
    if (scores[index]! < rubric[index]!.score) { scores[index]! += 1; remainder -= 1; }
  }
  return rubric.map((point, index) => {
    const score = scores[index]!;
    return { ...point, score, matched: score > 0, evidence: score > 0 ? point.evidence : [] };
  });
}

function calculateDimensions(
  questions: ReportQuestionInput[],
  reviews: InterviewReportResult['questionReviews'],
  answers: Map<string, string>,
  overallScore: number,
) {
  const scoresFor = (pattern: RegExp) => reviews.flatMap((review, index) => pattern.test(questions[index]?.category ?? '') ? [review.score] : []);
  const communicationScores = reviews.map((review) => {
    const answer = answers.get(review.questionId) ?? '';
    if (!answer.trim()) return 0;
    const clarityBonus = answerSentences(answer).length >= 2 || /(?:因为|因此|但是|同时|首先|其次|because|therefore|however|first|then)/iu.test(answer) ? 10 : 0;
    return clamp(Math.min(review.score, 90) + clarityBonus);
  });
  return {
    projectUnderstanding: average(scoresFor(/architecture|project|general|模块|架构|项目/iu), overallScore),
    technicalAccuracy: average(reviews.map((review) => review.score), overallScore),
    communication: average(communicationScores, overallScore),
    problemSolving: average(scoresFor(/database|reliability|testing|algorithm|problem|故障|测试|数据库|可靠/iu), overallScore),
  };
}

function answerSentences(answer: string): string[] {
  return answer.split(/(?<=[。！？!?；;.\n])/u).map((sentence) => sentence.trim()).filter(Boolean);
}
function semanticGroupsFor(point: string): RubricSemanticGroup[] {
  const normalizedPoint = normalize(point);
  return RUBRIC_SEMANTIC_GROUPS.filter((group) => group.terms.some((term) => normalizedPoint.includes(normalize(term))));
}
function isNegated(sentence: string, alias: string): boolean {
  const index = sentence.indexOf(alias);
  return index >= 0 && /(?:没有|并未|尚未|未|不使用|缺少|欠缺|without|not|never)[^，。；,.]{0,16}$/iu.test(sentence.slice(Math.max(0, index - 18), index));
}
function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function uniqueByNormalized(values: string[]): string[] { const seen = new Set<string>(); return values.filter((value) => { const key = normalize(value); if (seen.has(key)) return false; seen.add(key); return true; }); }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function average(values: number[], fallback = 0): number { return values.length > 0 ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length) : clamp(fallback); }
function compact(value: string, maxLength: number): string { const text = value.replace(/\s+/g, ' ').trim(); return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`; }
function projectContextLabel(context: ReportProjectContextInput): string {
  const stack = Array.isArray(context.techStack) ? context.techStack.map(namedValue).filter(Boolean).slice(0, 3) : [];
  const modules = Array.isArray(context.coreModules) ? context.coreModules.map(namedValue).filter(Boolean).slice(0, 2) : [];
  return [...stack, ...modules].join('、') || compact(context.summary ?? '', 40) || '当前项目实现';
}
function namedValue(value: unknown): string { return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' ? value.name : ''; }
