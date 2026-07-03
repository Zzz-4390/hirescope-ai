import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common'; import { AnswerContentDto } from './answer-content.dto';
@Injectable()
export class AnswerContentPipe implements PipeTransform {
  transform(value: unknown): AnswerContentDto {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => key !== 'content') || typeof (value as { content?: unknown }).content !== 'string') throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: '请求体校验失败' });
    const content = (value as { content: string }).content.trim(); if (!content) throw new UnprocessableEntityException({ code: 'ANSWER_CONTENT_EMPTY', message: '答案内容不能为空' }); if (content.length > 5000) throw new UnprocessableEntityException({ code: 'ANSWER_CONTENT_TOO_LONG', message: '答案内容不能超过 5000 个字符' }); return { content };
  }
}
