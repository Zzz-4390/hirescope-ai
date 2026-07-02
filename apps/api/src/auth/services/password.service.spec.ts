import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$EEPZnPvCwY5nfeXzD1KhIw$FhWXIFWMOeq3j3hNz5lERJAaD+u4VotBV8upTgifPcE';

describe('PasswordService', () => {
  const service = new PasswordService({ memoryCost: 19456, timeCost: 2, parallelism: 1, dummyHash });

  it('hashes and verifies passwords with Argon2id', async () => {
    const hash = await service.hash('StrongPassword123!');
    await expect(service.verify(hash, 'StrongPassword123!')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
    expect(hash).toContain('$argon2id$');
  });

  it('uses the pre-generated dummy hash without generating a hash per request', async () => {
    await expect(service.verifyDummy('any-password')).resolves.toBe(false);
    expect(service.getDummyHash()).toBe(dummyHash);
  });
});
