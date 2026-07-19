import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../common/errors/http-exception.filter';
import { createGlobalValidationPipe } from '../common/validation/global-validation.pipe';
import { InterviewReportsService } from './interview-reports.service';
import { AnswerContentDto } from './dto/answer-content.dto';
import { InterviewAnswerParamsDto } from './dto/interview-answer-params.dto';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

const INTERVIEW_ID = '6d9368a0-193f-4b3b-8878-0f565bc8d85d';
const QUESTION_ID = 'f11411af-9e31-46f8-a6f4-8f31d64d3359';

describe('InterviewsController answer validation', () => {
  let app: INestApplication;
  const saveAnswer = vi.fn(async (_userId: string, _interviewId: string, questionId: string, content: string) => ({ questionId, content }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InterviewsController],
      providers: [
        { provide: InterviewsService, useValue: { saveAnswer } },
        { provide: InterviewReportsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestAuthGuard())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('saves short and normal answers with the real question UUID and overwrites through the same ID', async () => {
    await request(app.getHttpServer()).put(answerUrl()).send({ content: ' x ' }).expect(200, { questionId: QUESTION_ID, content: 'x' });
    await request(app.getHttpServer()).put(answerUrl()).send({ content: '  正常回答  ' }).expect(200, { questionId: QUESTION_ID, content: '正常回答' });

    expect(saveAnswer).toHaveBeenNthCalledWith(1, 'user-1', INTERVIEW_ID, QUESTION_ID, 'x');
    expect(saveAnswer).toHaveBeenNthCalledWith(2, 'user-1', INTERVIEW_ID, QUESTION_ID, '正常回答');
  });

  it.each([
    ['sequence as questionId', `/api/v1/interviews/${INTERVIEW_ID}/answers/1`, { content: 'answer' }],
    ['array index as questionId', `/api/v1/interviews/${INTERVIEW_ID}/answers/0`, { content: 'answer' }],
    ['blank content', answerUrl(), { content: '   ' }],
    ['extra body field', answerUrl(), { content: 'answer', questionId: QUESTION_ID }],
  ])('returns sanitized 422 for %s', async (_name, url, body) => {
    const response = await request(app.getHttpServer()).put(url).send(body).expect(422);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: '请求参数校验失败', requestId: expect.any(String) });
    expect(response.body.error.validationErrors).toBeUndefined();
  });
});

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = { userId: 'user-1' };
    return true;
  }
}

function answerUrl(): string {
  return `/api/v1/interviews/${INTERVIEW_ID}/answers/${QUESTION_ID}`;
}
