import * as argon2 from 'argon2';

/**
 * One hashing scheme for both passwords and PINs (Doc 2, §6: "passwords
 * hashed with Argon2id; PINs hashed"). A 4-digit PIN has only 10,000
 * possible values, so its real protection is the lockout in
 * auth/service.ts, not the hash — but it's still hashed, never stored or
 * compared in the clear, so a database leak alone doesn't hand out PINs.
 */
export function hashSecret(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifySecret(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
