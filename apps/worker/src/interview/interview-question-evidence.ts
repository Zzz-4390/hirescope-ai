import type { InterviewQuestionsResult } from '@hirescope/shared-types';
import type { InterviewQuestionEvidenceContext } from './interview-question-generator';

const SOURCE_CODE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.go', '.graphql', '.groovy', '.h', '.hpp', '.java', '.js', '.jsx', '.kt', '.kts',
  '.php', '.prisma', '.py', '.rb', '.rs', '.sql', '.svelte', '.swift', '.ts', '.tsx', '.vue',
]);

const TECHNOLOGIES = [
  ['Angular', /\bangular\b/i], ['BullMQ', /\bbullmq\b/i], ['Django', /\bdjango\b/i],
  ['Express', /\bexpress(?:\.js)?\b/i], ['FastAPI', /\bfastapi\b/i], ['Kafka', /\bkafka\b/i],
  ['MongoDB', /\bmongo(?:db)?\b/i], ['MySQL', /\bmysql\b/i], ['NestJS', /\bnest(?:\.js|js)?\b/i],
  ['Next.js', /\bnext(?:\.js|js)\b/i], ['PostgreSQL', /\bpostgres(?:ql)?\b/i], ['Prisma', /\bprisma\b/i],
  ['RabbitMQ', /\brabbitmq\b/i], ['React', /\breact\b/i], ['Redis', /\bredis\b/i],
  ['Spring Boot', /\bspring\s+boot\b/i], ['TypeScript', /\btypescript\b/i], ['Vue', /\bvue(?:\.js|js)?\b/i],
] as const;

export class InterviewQuestionEvidenceError extends Error {
  constructor() {
    super('AI_RESPONSE_EVIDENCE_INVALID');
    this.name = 'InterviewQuestionEvidenceError';
  }
}

export function validateInterviewQuestionEvidence(
  result: InterviewQuestionsResult,
  evidence?: InterviewQuestionEvidenceContext,
): InterviewQuestionsResult {
  const allowedPaths = new Set(interviewQuestionEvidencePaths(evidence).map(normalizePath));
  if (allowedPaths.size === 0) throw new InterviewQuestionEvidenceError();

  const evidenceText = JSON.stringify({
    techStack: evidence?.techStack ?? [],
    configFiles: evidence?.configFiles ?? [],
    snippets: evidence?.snippets ?? [],
  });
  const allowedTechnologies = technologyNames(evidenceText);

  for (const question of result.questions) {
    if (question.evidencePaths.length === 0) throw new InterviewQuestionEvidenceError();
    for (const path of question.evidencePaths) {
      if (!allowedPaths.has(normalizePath(path))) throw new InterviewQuestionEvidenceError();
    }
    const claims = [question.category, question.question, ...question.referencePoints].join('\n');
    for (const technology of technologyNames(claims)) {
      if (!allowedTechnologies.has(technology)) throw new InterviewQuestionEvidenceError();
    }
  }
  return result;
}

export function restrictInterviewQuestionEvidence(evidence: InterviewQuestionEvidenceContext): InterviewQuestionEvidenceContext {
  const allowedPaths = new Set(interviewQuestionEvidencePaths(evidence));
  return {
    ...evidence,
    directoryTree: evidence.directoryTree.filter((entry) => entry.type === 'file' && allowedPaths.has(entry.path)),
    testFiles: evidence.testFiles.filter((path) => allowedPaths.has(path)),
    entryFiles: evidence.entryFiles.filter((path) => allowedPaths.has(path)),
    configFiles: [],
    snippets: evidence.snippets.filter((snippet) => allowedPaths.has(snippet.path)),
    evidencePaths: [...allowedPaths],
  };
}

export function interviewQuestionEvidencePaths(evidence?: InterviewQuestionEvidenceContext): string[] {
  if (!evidence) return [];
  const declaredPaths = new Set(evidence.evidencePaths.map(normalizePath));
  const paths = new Set<string>();
  for (const snippet of evidence.snippets) {
    const path = normalizePath(snippet.path);
    if (declaredPaths.has(path) && isSourceCodePath(path)) paths.add(path);
  }
  return [...paths].sort();
}

function technologyNames(value: string): Set<string> {
  return new Set(TECHNOLOGIES.filter(([, pattern]) => pattern.test(value)).map(([name]) => name));
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isSourceCodePath(path: string): boolean {
  const lastSlash = path.lastIndexOf('/');
  const lastDot = path.lastIndexOf('.');
  return lastDot > lastSlash && SOURCE_CODE_EXTENSIONS.has(path.slice(lastDot).toLowerCase());
}
