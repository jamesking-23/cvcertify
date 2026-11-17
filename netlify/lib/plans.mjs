import { PLANS, FEATURE_PLAN } from '../../public/js/shared/constants.js';
import { HttpError } from './util.mjs';
import { db } from './db.mjs';

export const planOf = (user) => PLANS[user.plan] || PLANS.starter;

const monthKey = () => new Date().toISOString().slice(0, 7);

export function usageOf(user) {
  const u = user.usage || {};
  return { month: monthKey(), rewrites: u.month === monthKey() ? u.rewrites || 0 : 0 };
}

export function requireFeature(user, feature) {
  if (!planOf(user).limits[feature]) {
    const need = PLANS[FEATURE_PLAN[feature]]?.name || 'a paid plan';
    throw new HttpError(402, `This feature is available on ${need}.`, 'upgrade_required');
  }
}

// Counts one AI rewrite against the monthly quota (Starter only). Call before running the AI task.
export async function spendRewrite(user) {
  const limit = planOf(user).limits.rewrites;
  if (limit === Infinity) return;
  const usage = usageOf(user);
  if (usage.rewrites >= limit) {
    throw new HttpError(402, `You've used all ${limit} AI rewrites for this month. Upgrade for unlimited AI tailoring.`, 'quota_exceeded');
  }
  user.usage = { month: usage.month, rewrites: usage.rewrites + 1 };
  await db.put('users', user.id, user);
}

// Give the quota back if the AI call itself failed.
export async function refundRewrite(user) {
  const usage = usageOf(user);
  if (usage.rewrites > 0 && planOf(user).limits.rewrites !== Infinity) {
    user.usage = { month: usage.month, rewrites: usage.rewrites - 1 };
    await db.put('users', user.id, user);
  }
}

export function publicPlan(user) {
  const p = planOf(user);
  const l = p.limits;
  const num = (n) => (n === Infinity ? null : n);
  return {
    id: p.id,
    name: p.name,
    // resumes/rewrites: a number, or null meaning unlimited. Everything else is a plain on/off flag.
    limits: { ...l, resumes: num(l.resumes), rewrites: num(l.rewrites), letters: !!l.letters },
    usage: usageOf(user),
  };
}
