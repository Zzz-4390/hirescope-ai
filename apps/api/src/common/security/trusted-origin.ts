export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

export function resolveRequestOrigin(origin: string | undefined, referer: string | undefined): string | undefined {
  if (origin) return origin;
  if (!referer) return undefined;

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
