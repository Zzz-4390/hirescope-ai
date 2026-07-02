import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('auth DTOs', () => {
  it('normalizes register email and display name', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: '  USER@Example.COM ', password: 'StrongPassword123!', displayName: '  张三  ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
    expect(dto.displayName).toBe('张三');
  });

  it('does not trim passwords and rejects short registration passwords', async () => {
    const dto = plainToInstance(RegisterDto, { email: 'user@example.com', password: ' short ' });
    expect(dto.password).toBe(' short ');
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('normalizes login email', async () => {
    const dto = plainToInstance(LoginDto, { email: ' USER@Example.COM ', password: 'password' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
  });
});
