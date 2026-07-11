import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(6, 128)
  password!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}
