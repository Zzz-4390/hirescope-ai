import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('auth DTOs', () => {
  it('normalizes register username and email', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: '  Candidate_01 ',
      email: '  USER@Example.COM ',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.username).toBe('candidate_01');
    expect(dto.email).toBe('user@example.com');
  });

  it('does not trim passwords and enforces a six-character minimum', async () => {
    const short = plainToInstance(RegisterDto, {
      username: 'candidate', email: 'user@example.com', password: '12345', confirmPassword: '12345',
    });
    const minimum = plainToInstance(RegisterDto, {
      username: 'candidate', email: 'user@example.com', password: '123456', confirmPassword: '123456',
    });
    expect(short.password).toBe('12345');
    expect(await validate(short)).not.toHaveLength(0);
    expect(await validate(minimum)).toHaveLength(0);
  });

  it('requires matching password confirmation', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'candidate', email: 'user@example.com', password: '123456', confirmPassword: '654321',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it.each(['ab', 'candidate-name', 'candidate name', 'candidate@example'])('rejects invalid username %s', async (username) => {
    const dto = plainToInstance(RegisterDto, {
      username, email: 'user@example.com', password: '123456', confirmPassword: '123456',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it.each([' USER@Example.COM ', ' Candidate_01 '])('normalizes login identifier %s', async (identifier) => {
    const dto = plainToInstance(LoginDto, { identifier, password: 'password' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.identifier).toBe(identifier.trim().toLowerCase());
  });
});
