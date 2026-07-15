import { AiProviderError, OpenAiCompatibleProvider, type AiCompletion } from '../ai/openai-compatible.provider';
import { DeterministicInterviewReportService, type ReportAnswerInput, type ReportInterviewInput, type ReportProjectContextInput, type ReportQuestionInput, type SemanticJudgeOverrides } from './deterministic-interview-report.service';
import type { InterviewReportGenerationContext, InterviewReportGenerator } from './interview-report-generator';

type FailureCode = 'AI_REQUEST_TIMEOUT' | 'AI_RATE_LIMITED' | 'AI_UPSTREAM_ERROR' | 'AI_PROVIDER_RESPONSE_INVALID' | 'AI_RESPONSE_JSON_INVALID' | 'AI_RESPONSE_SCHEMA_INVALID' | 'AI_RESPONSE_EVIDENCE_INVALID' | 'AI_RESPONSE_SCORE_INVALID';
export class InterviewReportJudgeError extends Error { constructor(readonly code: FailureCode, readonly httpStatus?: number) { super(code); } }

interface AiCallLogEntry {
  userId: string; projectId: string; taskId: string; scene: string; provider: string; model: string; promptVersion: string; schemaVersion: string; retryCount: number; status: 'SUCCEEDED' | 'FAILED'; promptTokens?: number; completionTokens?: number; totalTokens?: number; durationMs?: number; errorCode?: string;
}
export interface InterviewReportAiCallLogRecorder { record(entry: AiCallLogEntry): Promise<void> }

const PROMPT_VERSION = 'interview-report-semantic-rubric-v1-zh-cn';
const SCHEMA_VERSION = 'interview-report-judge-v1';
const MAX_RESPONSE_ATTEMPTS = 2;
const retryable = new Set<FailureCode>(['AI_PROVIDER_RESPONSE_INVALID', 'AI_RESPONSE_JSON_INVALID', 'AI_RESPONSE_SCHEMA_INVALID', 'AI_RESPONSE_EVIDENCE_INVALID', 'AI_RESPONSE_SCORE_INVALID']);
interface JudgePoint { point: string; score: number; evidence: string[] }
interface JudgeQuestion { questionId: string; score: number; points: JudgePoint[] }
interface JudgeResponse { questions: JudgeQuestion[] }

export class AiInterviewReportService implements InterviewReportGenerator {
  constructor(private readonly provider: OpenAiCompatibleProvider, private readonly logs: InterviewReportAiCallLogRecorder, private readonly deterministic = new DeterministicInterviewReportService()) {}

  async generate(interview: ReportInterviewInput, questions: ReportQuestionInput[], answers: ReportAnswerInput[], projectContext: ReportProjectContextInput, context: InterviewReportGenerationContext) {
    const draft = this.deterministic.generate(interview, questions, answers, projectContext);
    for (let attempt = 0; attempt < MAX_RESPONSE_ATTEMPTS; attempt += 1) {
      let completion: AiCompletion | undefined;
      try {
        completion = await this.provider.completeJson({ systemPrompt: systemPrompt(), userPrompt: userPrompt(draft, answers, attempt) });
        const overrides = validateJudgeResponse(completion.content, draft, answers);
        await this.logs.record(logEntry(context, this.provider, 'SUCCEEDED', attempt, completion));
        return this.deterministic.generate(interview, questions, answers, projectContext, overrides);
      } catch (error) {
        const normalized = normalizeError(error);
        await this.logs.record(logEntry(context, this.provider, 'FAILED', attempt, completion, normalized.code));
        if (attempt + 1 < MAX_RESPONSE_ATTEMPTS && retryable.has(normalized.code)) continue;
        break;
      }
    }
    return draft;
  }
}

function systemPrompt(): string {
  return [
    '你是严格的面试答案语义评分 Judge。只根据候选人答案和给定 Rubric 评分。',
    '每个 Rubric 评分点独立判断，可识别同义表达与语义等价；不得因为没有逐字复述参考词而扣分。',
    '证据必须是用户答案中逐字存在的一整句，不得改写、拼接、推断或引用题干。没有证据时该评分点必须为 0 分且 evidence 为空。',
    '不得增加、删除、改名或重排问题和评分点；每题 score 必须等于 points.score 之和，单点评分在对应 weight 范围内。',
    '只输出严格 JSON，不输出 Markdown 或说明。',
  ].join('\n');
}

function userPrompt(draft: ReturnType<DeterministicInterviewReportService['generate']>, answers: ReportAnswerInput[], attempt: number): string {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
  return JSON.stringify({
    task: attempt === 0 ? '执行语义评分' : '上次输出无效。严格按原 Rubric 和答案重新输出完整 JSON。',
    questions: draft.questionReviews.map((review) => ({ questionId: review.questionId, answer: answerByQuestion.get(review.questionId) ?? '', rubric: (review.rubric ?? []).map((point) => ({ point: point.point, weight: point.weight })) })),
    output: { questions: [{ questionId: '原 questionId', score: 100, points: [{ point: '原 Rubric point', score: 50, evidence: ['用户答案中的原句'] }] }] },
  });
}

function validateJudgeResponse(content: string, draft: ReturnType<DeterministicInterviewReportService['generate']>, answers: ReportAnswerInput[]): SemanticJudgeOverrides {
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw new InterviewReportJudgeError('AI_RESPONSE_JSON_INVALID'); }
  const parsed = parseJudgeResponse(raw);
  const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
  if (parsed.questions.length !== draft.questionReviews.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
  const overrides: SemanticJudgeOverrides = {};
  for (const review of draft.questionReviews) {
    const judged = parsed.questions.find((item) => item.questionId === review.questionId);
    const rubric = review.rubric;
    if (!rubric || !judged || judged.points.length !== rubric.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
    const answer = answersByQuestion.get(review.questionId) ?? '';
    const points: Record<string, { score: number; evidence: string[] }> = {};
    for (const rubricPoint of rubric) {
      const item = judged.points.find((point) => point.point === rubricPoint.point);
      if (!item || !Number.isInteger(item.score) || item.score < 0 || item.score > rubricPoint.weight) throw new InterviewReportJudgeError('AI_RESPONSE_SCORE_INVALID');
      if (item.score > 0 && (item.evidence.length === 0 || !item.evidence.every((evidence) => answerHasExactSentence(answer, evidence)))) throw new InterviewReportJudgeError('AI_RESPONSE_EVIDENCE_INVALID');
      if (item.score === 0 && item.evidence.length > 0) throw new InterviewReportJudgeError('AI_RESPONSE_EVIDENCE_INVALID');
      points[rubricPoint.point] = { score: item.score, evidence: item.evidence };
    }
    if (new Set(judged.points.map((point) => point.point)).size !== rubric.length || judged.score !== judged.points.reduce((total, point) => total + point.score, 0)) throw new InterviewReportJudgeError('AI_RESPONSE_SCORE_INVALID');
    overrides[review.questionId] = points;
  }
  if (new Set(parsed.questions.map((question) => question.questionId)).size !== draft.questionReviews.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
  return overrides;
}

function parseJudgeResponse(value: unknown): JudgeResponse {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.questions) || value.questions.length === 0) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
  const questions = value.questions.map((question): JudgeQuestion => {
    if (!isRecord(question) || !sameKeys(question, ['questionId', 'score', 'points']) || typeof question.questionId !== 'string' || question.questionId.length === 0 || !Number.isInteger(question.score) || !Array.isArray(question.points) || question.points.length === 0) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
    const points = question.points.map((point): JudgePoint => {
      if (!isRecord(point) || !sameKeys(point, ['point', 'score', 'evidence']) || typeof point.point !== 'string' || point.point.length === 0 || !Number.isInteger(point.score) || !Array.isArray(point.evidence) || !point.evidence.every((evidence): evidence is string => typeof evidence === 'string' && evidence.length > 0)) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
      return { point: point.point, score: Number(point.score), evidence: point.evidence };
    });
    return { questionId: question.questionId, score: Number(question.score), points };
  });
  return { questions };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function sameKeys(value: Record<string, unknown>, keys: string[]): boolean { const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]); }

function answerHasExactSentence(answer: string, evidence: string): boolean {
  const expected = normalize(evidence);
  return expected.length > 0 && answer.split(/(?<=[。！？!?；;\n])/u).some((sentence) => normalize(sentence) === expected);
}
function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
function normalizeError(error: unknown): InterviewReportJudgeError {
  if (error instanceof InterviewReportJudgeError) return error;
  if (error instanceof AiProviderError) return new InterviewReportJudgeError(error.code, error.httpStatus);
  return new InterviewReportJudgeError('AI_UPSTREAM_ERROR');
}
function logEntry(context: InterviewReportGenerationContext, provider: OpenAiCompatibleProvider, status: 'SUCCEEDED' | 'FAILED', retryCount: number, completion?: AiCompletion, errorCode?: string): AiCallLogEntry {
  return { ...context, scene: 'INTERVIEW_REPORT_GENERATION', provider: provider.providerName, model: completion?.model ?? provider.model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, retryCount, status, promptTokens: completion?.usage.promptTokens, completionTokens: completion?.usage.completionTokens, totalTokens: completion?.usage.totalTokens, durationMs: completion?.durationMs, errorCode };
}
