import type { InterviewQuestionsResult } from '@hirescope/shared-types';
import type { InterviewDifficulty } from '@prisma/client';
import { posix } from 'node:path';
import type { InterviewAnalysisInput, InterviewQuestionEvidenceContext } from './interview-question-generator';

type EvidenceKind = 'config' | 'entry' | 'test' | 'module';

export class DeterministicInterviewQuestionService {
  generate(
    analysis: InterviewAnalysisInput,
    _latestReview: unknown,
    questionCount: number,
    difficulty: InterviewDifficulty,
    _context?: unknown,
    evidence?: InterviewQuestionEvidenceContext,
  ): InterviewQuestionsResult {
    const candidates = evidenceCandidates(evidence);
    if (candidates.length === 0) throw new Error('INTERVIEW_QUESTION_EVIDENCE_MISSING');
    const stack = technologyNames(analysis.techStack);

    return {
      questions: Array.from({ length: questionCount }, (_, index) => {
        const candidate = candidates[index % candidates.length]!;
        const snippet = evidence?.snippets.find((value) => value.path === candidate.path)?.content ?? '';
        const subject = codeSubject(snippet) ?? posix.basename(candidate.path);
        const generated = groundedQuestion(candidate.kind, subject, difficulty, stack[index % Math.max(1, stack.length)]);
        return {
          sequence: index + 1,
          category: generated.category,
          difficulty,
          question: generated.question,
          referencePoints: generated.referencePoints,
          evidencePaths: [candidate.path],
        };
      }),
    };
  }
}

function evidenceCandidates(evidence?: InterviewQuestionEvidenceContext): Array<{ path: string; kind: EvidenceKind }> {
  if (!evidence) return [];
  const ordered = [
    ...evidence.testFiles.map((path) => ({ path, kind: 'test' as const })),
    ...evidence.entryFiles.map((path) => ({ path, kind: 'entry' as const })),
    ...evidence.configFiles.map((path) => ({ path, kind: 'config' as const })),
    ...evidence.snippets.map(({ path }) => ({ path, kind: 'module' as const })),
    ...evidence.evidencePaths.map((path) => ({ path, kind: 'module' as const })),
  ];
  const seen = new Set<string>();
  return ordered.filter(({ path }) => {
    if (!evidence.evidencePaths.includes(path) || seen.has(path)) return false;
    seen.add(path);
    return true;
  });
}

function groundedQuestion(kind: EvidenceKind, subject: string, difficulty: InterviewDifficulty, technology?: string) {
  const stack = technology ? `，并结合项目已识别的 ${technology}` : '';
  if (kind === 'test') return {
    category: '测试策略',
    question: difficulty === 'EASY'
      ? `请说明 ${subject} 覆盖的测试目标和主要断言。`
      : difficulty === 'HARD'
        ? `围绕 ${subject} 的现有测试${stack}，如何补齐并发、失败恢复和边界输入验证，同时避免脆弱断言？`
        : `围绕 ${subject} 的现有测试${stack}，请说明它验证的关键路径、边界场景和仍需补充的风险。`,
    referencePoints: ['说明测试目标与关键断言', '说明边界和失败场景', '说明回归验证策略'],
  };
  if (kind === 'entry') return {
    category: '启动流程',
    question: difficulty === 'EASY'
      ? `请说明 ${subject} 作为入口文件的主要职责和启动顺序。`
      : difficulty === 'HARD'
        ? `围绕 ${subject} 的启动流程${stack}，如何处理依赖初始化失败、优雅关闭和重复启动，并说明取舍？`
        : `围绕 ${subject} 的启动流程${stack}，请说明依赖初始化、错误传播和资源释放的边界。`,
    referencePoints: ['说明启动顺序与依赖初始化', '说明错误传播和资源释放', '说明重复执行或关闭边界'],
  };
  if (kind === 'config') return {
    category: '工程配置',
    question: difficulty === 'EASY'
      ? `请说明 ${subject} 在当前项目中的配置职责。`
      : difficulty === 'HARD'
        ? `基于 ${subject} 的真实配置${stack}，请分析版本约束、环境差异和发布失败风险应如何控制。`
        : `基于 ${subject} 的真实配置${stack}，请说明关键配置如何影响构建、运行和测试。`,
    referencePoints: ['说明关键配置及其作用', '说明环境或版本边界', '说明验证和回滚方式'],
  };
  return {
    category: '核心实现',
    question: difficulty === 'EASY'
      ? `请说明 ${subject} 在当前项目中的职责、输入和输出。`
      : difficulty === 'HARD'
        ? `围绕 ${subject} 的真实实现${stack}，请分析并发、异常恢复和数据一致性风险，并给出可验证的改进方案。`
        : `围绕 ${subject} 的真实实现${stack}，请说明核心流程、依赖边界、异常处理和测试方式。`,
    referencePoints: ['说明模块职责和核心流程', '说明依赖与异常边界', '说明可验证的测试或改进方案'],
  };
}

function technologyNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === 'object' && item !== null && 'name' in item && typeof item.name === 'string' ? [item.name] : []);
}

function codeSubject(content: string): string | undefined {
  return /\b(?:class|function|interface|type|const)\s+([A-Za-z_$][\w$]*)/.exec(content)?.[1];
}
