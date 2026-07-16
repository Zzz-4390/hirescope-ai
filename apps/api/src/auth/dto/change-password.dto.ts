import { IsString, Length, Validate, type ValidationArguments, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'newPasswordsMatch', async: false })
class NewPasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: unknown, arguments_: ValidationArguments): boolean {
    return typeof confirmPassword === 'string'
      && confirmPassword === (arguments_.object as ChangePasswordDto).newPassword;
  }

  defaultMessage(): string {
    return '两次输入的新密码不一致';
  }
}

export class ChangePasswordDto {
  @IsString()
  @Length(6, 128)
  currentPassword!: string;

  @IsString()
  @Length(6, 128)
  newPassword!: string;

  @IsString()
  @Length(6, 128)
  @Validate(NewPasswordsMatchConstraint)
  confirmPassword!: string;
}
