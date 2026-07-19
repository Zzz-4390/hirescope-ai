import { describe, expect, it } from 'vitest';
import { AnswerContentPipe } from './answer-content.pipe';

describe('AnswerContentPipe', () => {
  const pipe = new AnswerContentPipe();

  it('accepts only the content field and trims it', () => {
    expect(pipe.transform({ content: '  answer  ' })).toEqual({ content: 'answer' });
  });

  it.each([
    { answer: 'answer' },
    { answerContent: 'answer' },
    { content: 'answer', answer: 'answer' },
  ])('rejects an invalid answer DTO: %o', (value) => {
    expectValidationCode(() => pipe.transform(value), 'VALIDATION_FAILED');
  });

  it('rejects empty content with a stable code', () => {
    expectValidationCode(() => pipe.transform({ content: '   ' }), 'ANSWER_CONTENT_EMPTY');
  });

  it('rejects content over 5000 characters', () => {
    expectValidationCode(() => pipe.transform({ content: 'a'.repeat(5001) }), 'ANSWER_CONTENT_TOO_LONG');
  });
});

function expectValidationCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('expected validation error');
  } catch (error: any) {
    expect(error.getResponse().code).toBe(code);
  }
}
