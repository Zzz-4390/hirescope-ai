import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @Length(1, 320)
  identifier!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
