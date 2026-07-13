import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'passwordsMatch', async: false })
class PasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: unknown, arguments_: ValidationArguments): boolean {
    return typeof confirmPassword === 'string'
      && confirmPassword === (arguments_.object as RegisterDto).password;
  }

  defaultMessage(): string {
    return '两次输入的密码不一致';
  }
}

export class RegisterDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-z0-9_]+$/)
  username!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(6, 128)
  password!: string;

  @IsString()
  @Length(6, 128)
  @Validate(PasswordsMatchConstraint)
  confirmPassword!: string;
}
