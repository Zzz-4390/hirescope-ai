import { argon2id, hash, verify } from 'argon2';

export interface PasswordOptions {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  dummyHash: string;
}

export class PasswordService {
  constructor(private readonly options: PasswordOptions) {}

  hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: this.options.memoryCost,
      timeCost: this.options.timeCost,
      parallelism: this.options.parallelism,
    });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  verifyDummy(password: string): Promise<boolean> {
    return verify(this.options.dummyHash, password);
  }

  getDummyHash(): string {
    return this.options.dummyHash;
  }
}
