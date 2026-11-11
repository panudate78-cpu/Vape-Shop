// Failed-attempt counter kept in memory. It is per server instance: on a
// multi-instance host each instance counts separately, so treat the limit as a
// brake on guessing, not a hard ceiling. A shared store (e.g. Postgres or Redis) is the next step.
const fails = new Map<string, number[]>();
const MAX_KEYS = 20_000;

function prune(key: string, windowMs: number, now: number) {
  const list = (fails.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length) fails.set(key, list); else fails.delete(key);
  return list;
}

export function isLimited(key: string, max: number, windowMs: number): boolean {
  return prune(key, windowMs, Date.now()).length >= max;
}

export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  const list = prune(key, windowMs, now);
  list.push(now);
  fails.set(key, list);
  if (fails.size > MAX_KEYS) fails.delete(fails.keys().next().value as string);
}

export function clearFailures(key: string) { fails.delete(key); }

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || 'unknown').trim();
}
