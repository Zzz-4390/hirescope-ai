import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createGlobalValidationPipe } from '../../common/validation/global-validation.pipe';
import { ANSWER_CONTENT_MAX_LENGTH, AnswerContentDto } from './answer-content.dto';
import { InterviewAnswerParamsDto } from './interview-answer-params.dto';

const INTERVIEW_ID = '6d9368a0-193f-4b3b-8878-0f565bc8d85d';
const QUESTION_ID = 'f11411af-9e31-46f8-a6f4-8f31d64d3359';

describe('interview answer validation', () => {
  const pipe = createGlobalValidationPipe();
  const bodyMetadata: ArgumentMetadata = { type: 'body', metatype: AnswerContentDto };
  const paramsMetadata: ArgumentMetadata = { type: 'param', metatype: InterviewAnswerParamsDto };

  it.each([
    ['short answer', ' x ', 'x'],
    ['normal answer', '  使用事务和行级锁保证覆盖保存的一致性。  ', '使用事务和行级锁保证覆盖保存的一致性。'],
  ])('accepts and trims %s', async (_name, content, expected) => {
    await expect(pipe.transform({ content }, bodyMetadata)).resolves.toMatchObject({ content: expected });
  });

  it.each([
    ['blank content', { content: '   ' }, 'content'],
    ['overlong content', { content: 'a'.repeat(ANSWER_CONTENT_MAX_LENGTH + 1) }, 'content'],
    ['extra field', { content: 'valid', questionId: QUESTION_ID }, 'questionId'],
  ])('rejects %s with the failed field', async (_name, value, property) => {
    await expect(validationFailure(pipe.transform(value, bodyMetadata))).resolves.toMatchObject({
      code: 'VALIDATION_FAILED',
      validationErrors: expect.arrayContaining([expect.objectContaining({ property })]),
    });
  });

  it('accepts real UUID params and rejects sequence or array indexes as questionId', async () => {
    await expect(pipe.transform({ interviewId: INTERVIEW_ID, questionId: QUESTION_ID }, paramsMetadata)).resolves.toMatchObject({ interviewId: INTERVIEW_ID, questionId: QUESTION_ID });
    for (const questionId of ['1', '0']) {
      await expect(validationFailure(pipe.transform({ interviewId: INTERVIEW_ID, questionId }, paramsMetadata))).resolves.toMatchObject({
        code: 'VALIDATION_FAILED',
        validationErrors: [expect.objectContaining({ property: 'questionId' })],
      });
    }
  });
});

async function validationFailure(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('expected validation to fail');
  } catch (error) {
    if (error instanceof Error && 'getResponse' in error && typeof error.getResponse === 'function') {
      return error.getResponse() as Record<string, unknown>;
    }
    throw error;
  }
}
