import type { OrderStatus } from './types';

type Actor = 'guest' | 'ops' | 'fnb_manager' | 'manager' | 'admin' | 'cron';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  submitted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['delivered', 'cancelled'],
  delivered: ['closed', 'cancelled'],
  closed:    [],
  cancelled: [],
};

/** Actors who may cancel an order that has already been delivered. */
const ADMIN_ACTORS: Actor[] = ['fnb_manager', 'manager', 'admin'];

/**
 * Returns true if the transition from → to is permitted for the given actor.
 *
 * Special rule (spec §10.4 + §13.1):
 *   cancelling after `delivered` requires manager-level access.
 */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  ctx: { actor?: Actor } = {},
): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (from === 'delivered' && to === 'cancelled') {
    return !!ctx.actor && ADMIN_ACTORS.includes(ctx.actor);
  }
  return true;
}

/** Returns every status reachable from `from` in a single hop. */
export function nextValidStates(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from];
}

/**
 * Guest-side cancellability check (spec §4.6).
 *
 * An order may be self-cancelled by the guest only if:
 *   1. Its current status is still `submitted`.
 *   2. Less than `grace_seconds` have elapsed since submission.
 */
export function isCancellable(opts: {
  status: OrderStatus;
  submitted_at: string;
  grace_seconds: number;
}): boolean {
  if (opts.status !== 'submitted') return false;
  const ageMs = Date.now() - new Date(opts.submitted_at).getTime();
  return ageMs <= opts.grace_seconds * 1000;
}
