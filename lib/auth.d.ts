export interface AuthResult {
  authenticated: boolean;
  userId: string | null;
  claims: Record<string, unknown> | null;
  error: string | null;
}

export interface AuthConfig {
  mode?: 'trust' | 'verify' | 'none';
  signingKey?: string | null;
  claimsPath?: string;
  adminToken?: string | null;
  metricsToken?: string | null;
}

export interface Authenticator {
  authenticate(req: object): AuthResult;
}

export function createAuth(authConfig?: AuthConfig): Authenticator;

export interface AdminAuthResult {
  authenticated: boolean;
  error: string | null;
}

export function authenticateAdmin(req: object, adminKey: string | null): AdminAuthResult;

export function resolveSecret(
  value: string | null | undefined,
  env?: Record<string, string>
): string | null;
