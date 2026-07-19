import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => new UnprocessableEntityException({
      code: 'VALIDATION_FAILED',
      message: '请求参数校验失败',
      validationErrors: serializeValidationErrors(errors),
    }),
  });
}

function serializeValidationErrors(errors: ValidationError[]): unknown[] {
  return errors.map((error) => ({
    property: error.property,
    constraints: error.constraints,
    ...(error.children?.length ? { children: serializeValidationErrors(error.children) } : {}),
  }));
}
