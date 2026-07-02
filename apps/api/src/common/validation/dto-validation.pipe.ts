import { ArgumentMetadata, Injectable, PipeTransform, Type, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class DtoValidationPipe<T extends object> implements PipeTransform {
  constructor(private readonly dtoType: Type<T>) {}

  async transform(value: unknown, _metadata: ArgumentMetadata): Promise<T> {
    const instance = plainToInstance(this.dtoType, value);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: '请求参数校验失败' });
    }
    return instance;
  }
}
