import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `pbkdf2:${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, iterations, salt, hash] = passwordHash.split(':');
  if (algorithm !== 'pbkdf2' || !iterations || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = pbkdf2Sync(password, salt, Number(iterations), expected.length, DIGEST);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
