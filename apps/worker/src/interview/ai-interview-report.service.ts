import { AiProviderError, OpenAiCompatibleProvider, type AiCompletion } from '../ai/openai-compatible.provider';
import { buildInterviewReportRubric, DeterministicInterviewReportService, type ReportAnswerInput, type ReportInterviewInput, type ReportProjectContextInput, type ReportQuestionInput, type SemanticJudgeOverrides } from './deterministic-interview-report.service';
import type { InterviewReportGenerationContext, InterviewReportGenerator } from './interview-report-generator';

type FailureCode = 'AI_REQUEST_TIMEOUT' | 'AI_RATE_LIMITED' | 'AI_UPSTREAM_ERROR' | 'AI_PROVIDER_RESPONSE_INVALID' | 'AI_RESPONSE_JSON_INVALID' | 'AI_RESPONSE_SCHEMA_INVALID' | 'AI_RESPONSE_EVIDENCE_INVALID';
export class InterviewReportJudgeError extends Error { constructor(readonly code: FailureCode, readonly httpStatus?: number) { super(code); } }

interface AiCallLogEntry {
  userId: string; projectId: string; taskId: string; scene: string; provider: string; model: string; promptVersion: string; schemaVersion: string; retryCount: number; status: 'SUCCEEDED' | 'FAILED'; promptTokens?: number; completionTokens?: number; totalTokens?: number; durationMs?: number; errorCode?: string;
}
export interface InterviewReportAiCallLogRecorder { record(entry: AiCallLogEntry): Promise<void> }

const PROMPT_VERSION = 'interview-report-semantic-rubric-v1-zh-cn';
const SCHEMA_VERSION = 'interview-report-judge-v1';
const MAX_RESPONSE_ATTEMPTS = 2;
const retryable = new Set<FailureCode>(['AI_PROVIDER_RESPONSE_INVALID', 'AI_RESPONSE_JSON_INVALID', 'AI_RESPONSE_SCHEMA_INVALID', 'AI_RESPONSE_EVIDENCE_INVALID']);
interface JudgePoint { point: string; covered: boolean; evidence: string[] }
interface JudgeQuestion { questionId: string; points: JudgePoint[] }
interface JudgeResponse { questions: JudgeQuestion[] }

export class AiInterviewReportService implements InterviewReportGenerator {
  constructor(private readonly provider: OpenAiCompatibleProvider, private readonly logs: InterviewReportAiCallLogRecorder, private readonly deterministic = new DeterministicInterviewReportService()) {}

  async generate(interview: ReportInterviewInput, questions: ReportQuestionInput[], answers: ReportAnswerInput[], projectContext: ReportProjectContextInput, context: InterviewReportGenerationContext) {
    const draft = this.deterministic.generate(interview, questions, answers, projectContext);
    for (let attempt = 0; attempt < MAX_RESPONSE_ATTEMPTS; attempt += 1) {
      let completion: AiCompletion | undefined;
      try {
        completion = await this.provider.completeJson({ systemPrompt: systemPrompt(), userPrompt: userPrompt(questions, answers, attempt), temperature: 0 });
        const overrides = validateJudgeResponse(completion.content, questions, answers);
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
    '证据必须是用户答案中逐字存在的一整句，不得改写、拼接、推断或引用题干。没有证据时 covered 必须为 false 且 evidence 为空。',
    '关键词或技术名词的堆砌不等于语义覆盖；答案必须表达机制、关系、动作、约束或结果。空答案、跑题和过短答案应判定为未覆盖。',
    '不得增加、删除、改名或重排问题和评分点。你只判断 covered 并提取证据，不计算或输出任何分数。',
    '只输出严格 JSON，不输出 Markdown 或说明。',
  ].join('\n');
}

function userPrompt(questions: ReportQuestionInput[], answers: ReportAnswerInput[], attempt: number): string {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
  return JSON.stringify({
    task: attempt === 0 ? '执行语义评分' : '上次输出无效。严格按原 Rubric 和答案重新输出完整 JSON。',
    questions: questions.map((question) => ({
      questionId: question.id,
      question: question.question,
      rubric: buildInterviewReportRubric(question.referencePoints).map((point) => ({ point: point.point, weight: point.weight, synonyms: point.synonyms, criterion: point.criterion })),
      answer: answerByQuestion.get(question.id) ?? '',
    })),
    output: { questions: [{ questionId: '原 questionId', points: [{ point: '原 Rubric point', covered: true, evidence: ['用户答案中的完整原句'] }] }] },
  });
}

function validateJudgeResponse(content: string, questions: ReportQuestionInput[], answers: ReportAnswerInput[]): SemanticJudgeOverrides {
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw new InterviewReportJudgeError('AI_RESPONSE_JSON_INVALID'); }
  const parsed = parseJudgeResponse(raw);
  const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.content]));
  if (parsed.questions.length !== questions.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
  const overrides: SemanticJudgeOverrides = {};
  for (const question of questions) {
    const judged = parsed.questions.find((item) => item.questionId === question.id);
    const rubric = buildInterviewReportRubric(question.referencePoints);
    if (!judged || judged.points.length !== rubric.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
    const answer = answersByQuestion.get(question.id) ?? '';
    const points: Record<string, { covered: boolean; evidence: string[] }> = {};
    for (const rubricPoint of rubric) {
      const item = judged.points.find((point) => point.point === rubricPoint.point);
      if (!item) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
      if (item.covered && item.evidence.length === 0) throw new InterviewReportJudgeError('AI_RESPONSE_EVIDENCE_INVALID');
      if (!item.covered && item.evidence.length > 0) throw new InterviewReportJudgeError('AI_RESPONSE_EVIDENCE_INVALID');
      const evidence = item.evidence.map((value) => exactAnswerSentence(answer, value));
      if (evidence.some((value) => value === null)) throw new InterviewReportJudgeError('AI_RESPONSE_EVIDENCE_INVALID');
      points[rubricPoint.point] = { covered: item.covered, evidence: evidence.filter((value): value is string => value !== null) };
    }
    if (new Set(judged.points.map((point) => point.point)).size !== rubric.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
    overrides[question.id] = points;
  }
  if (new Set(parsed.questions.map((question) => question.questionId)).size !== questions.length) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
  return overrides;
}

function parseJudgeResponse(value: unknown): JudgeResponse {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.questions) || value.questions.length === 0) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
  const questions = value.questions.map((question): JudgeQuestion => {
    if (!isRecord(question) || !sameKeys(question, ['questionId', 'points']) || typeof question.questionId !== 'string' || question.questionId.length === 0 || !Array.isArray(question.points) || question.points.length === 0) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
    const points = question.points.map((point): JudgePoint => {
      if (!isRecord(point) || !sameKeys(point, ['point', 'covered', 'evidence']) || typeof point.point !== 'string' || point.point.length === 0 || typeof point.covered !== 'boolean' || !Array.isArray(point.evidence) || !point.evidence.every((evidence): evidence is string => typeof evidence === 'string' && evidence.length > 0)) throw new InterviewReportJudgeError('AI_RESPONSE_SCHEMA_INVALID');
      return { point: point.point, covered: point.covered, evidence: point.evidence };
    });
    return { questionId: question.questionId, points };
  });
  return { questions };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function sameKeys(value: Record<string, unknown>, keys: string[]): boolean { const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]); }

function exactAnswerSentence(answer: string, evidence: string): string | null {
  const expected = normalize(evidence);
  if (!expected) return null;
  return answer.split(/(?<=[。！？!?；;.\n])/u).map((sentence) => sentence.trim()).find((sentence) => normalize(sentence) === expected) ?? null;
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
