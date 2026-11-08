import bcrypt from 'bcryptjs';

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function ageFromDob(dob: string) {
  // dob expected as YYYY-MM-DD
  const d = new Date(dob);
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
export function isOfAge(dob: string, threshold = Number(process.env.NEXT_PUBLIC_AGE_THRESHOLD || 18)) {
  return ageFromDob(dob) >= threshold;
}

// Re-export session helpers so older imports (from @/lib/auth) keep working.
export { getSession, requireUser, requireAdmin } from './session';
export type { SessionUser, SessionData, CartLine } from './session';
