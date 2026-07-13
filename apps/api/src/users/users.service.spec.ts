import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('looks up an email identifier through the unique email index', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new UsersService({ user: { findUnique } } as never);

    await service.findByIdentifier('candidate@example.com');

    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'candidate@example.com' } });
  });

  it('looks up a username identifier through the unique username index', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new UsersService({ user: { findUnique } } as never);

    await service.findByIdentifier('candidate_01');

    expect(findUnique).toHaveBeenCalledWith({ where: { username: 'candidate_01' } });
  });
});
