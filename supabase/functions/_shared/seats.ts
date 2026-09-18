// Pure seat/quota math shared by update-subscription. Kept dependency-free
// (no Supabase/Stripe imports) so it can be unit tested directly.

/** A team always has at least 1 billable seat, even with 0 active members counted. */
export function computeSeatCount(activeMemberCount: number | null | undefined): number {
  return Math.max(1, activeMemberCount ?? 1)
}

/** True when this call is activating a specific member's seat and it grows the paid quantity -
 *  that's the only case that should trigger an immediate prorated charge. */
export function isAddingSeat(oldQuantity: number, newSeatCount: number, memberId: string | null | undefined): boolean {
  return memberId != null && newSeatCount > oldQuantity
}
