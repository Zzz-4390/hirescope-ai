type Environment = Record<string, unknown>;

function requiredString(env: Environment, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function integer(env: Environment, name: string, minimum = 1): number {
  const value = Number(requiredString(env, name));
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} is invalid`);
  return value;
}

export function validateEnvironment(env: Environment): Record<string, unknown> {
  const jwtSecret = requiredString(env, 'JWT_ACCESS_SECRET');
  const refreshSecret = requiredString(env, 'AUTH_REFRESH_HASH_SECRET');
  if (jwtSecret.length < 32 || refreshSecret.length < 32 || jwtSecret === refreshSecret) {
    throw new Error('Auth secrets must be distinct and at least 32 characters');
  }

  const nodeEnv = typeof env.NODE_ENV === 'string' ? env.NODE_ENV : 'production';
  const origins = requiredString(env, 'CORS_ALLOWED_ORIGINS').split(',').map((value) => value.trim());
  const invalidOrigin = origins.some((origin) => {
    if (origin === '*') return true;
    const parsed = new URL(origin);
    const isExactOrigin = parsed.origin === origin;
    if (!isExactOrigin) return true;
    if (parsed.protocol === 'https:') return false;
    return !(nodeEnv === 'development' && origin === 'http://localhost:3000');
  });
  if (invalidOrigin) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins, except http://localhost:3000 in development');
  }

  const cookieName = requiredString(env, 'AUTH_COOKIE_NAME');
  if (nodeEnv === 'development' && origins.includes('http://localhost:3000') && cookieName.startsWith('__Secure-')) {
    throw new Error('AUTH_COOKIE_NAME must not use the __Secure- prefix for localhost HTTP development');
  }

  const dummyHash = requiredString(env, 'AUTH_DUMMY_PASSWORD_HASH');
  if (!dummyHash.startsWith('$argon2id$')) throw new Error('AUTH_DUMMY_PASSWORD_HASH must be Argon2id');
  const accessTtl = integer(env, 'JWT_ACCESS_TTL_SECONDS');
  if (accessTtl !== 900) throw new Error('JWT_ACCESS_TTL_SECONDS must be 900');

  return {
    ...env,
    API_PORT: integer(env, 'API_PORT'),
    TRUST_PROXY_HOPS: integer({ value: env.TRUST_PROXY_HOPS ?? '0' }, 'value', 0),
    JWT_ACCESS_TTL_SECONDS: accessTtl,
    AUTH_REFRESH_TTL_SECONDS: integer(env, 'AUTH_REFRESH_TTL_SECONDS'),
    AUTH_ARGON2_MEMORY_KIB: integer(env, 'AUTH_ARGON2_MEMORY_KIB', 19456),
    AUTH_ARGON2_TIME_COST: integer(env, 'AUTH_ARGON2_TIME_COST', 2),
    AUTH_ARGON2_PARALLELISM: integer(env, 'AUTH_ARGON2_PARALLELISM'),
    AUTH_REGISTER_WINDOW_SECONDS: integer(env, 'AUTH_REGISTER_WINDOW_SECONDS'),
    AUTH_REGISTER_MAX_REQUESTS: integer(env, 'AUTH_REGISTER_MAX_REQUESTS'),
    AUTH_LOGIN_WINDOW_SECONDS: integer(env, 'AUTH_LOGIN_WINDOW_SECONDS'),
    AUTH_LOGIN_MAX_REQUESTS: integer(env, 'AUTH_LOGIN_MAX_REQUESTS'),
    AUTH_REFRESH_WINDOW_SECONDS: integer(env, 'AUTH_REFRESH_WINDOW_SECONDS'),
    AUTH_REFRESH_MAX_REQUESTS: integer(env, 'AUTH_REFRESH_MAX_REQUESTS'),
    CORS_ALLOWED_ORIGINS: origins,
  };
}
