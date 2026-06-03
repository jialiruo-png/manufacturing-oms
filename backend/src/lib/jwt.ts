import jwt from 'jsonwebtoken';

const MIN_JWT_SECRET_LENGTH = 32;
const FORBIDDEN_JWT_SECRETS = new Set([
  'dev-only-jwt-secret-change-before-production',
  'change-me-to-a-long-random-secret',
  'replace-with-a-long-random-secret',
  'replace-with-at-least-32-random-characters',
]);

export type JwtUser = {
  userId: number;
  role: string;
  isAdmin: boolean;
  name: string;
  tokenVersion: number;
  mustChangePassword?: boolean;
};

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (FORBIDDEN_JWT_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET must be changed from the template value');
  }
  return secret;
}

export function signToken(user: JwtUser) {
  return jwt.sign(user, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, getJwtSecret());
  if (!payload || typeof payload !== 'object') return null;
  const userId = Number((payload as Partial<JwtUser>).userId);
  const role = String((payload as Partial<JwtUser>).role || '');
  const name = String((payload as Partial<JwtUser>).name || '');
  const isAdmin = Boolean((payload as Partial<JwtUser>).isAdmin);
  const tokenVersion = Number((payload as Partial<JwtUser>).tokenVersion ?? 0);
  if (!Number.isInteger(userId) || !role || !name) return null;
  if (!Number.isInteger(tokenVersion)) return null;
  return { userId, role, isAdmin, name, tokenVersion };
}
