export interface RedeemableCode {
  status: string;
  startsAt?: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  minOrder: number | null;
}

/** Returns why a discount or coupon cannot be used, or null when it can be redeemed. */
export function redemptionError(code: RedeemableCode, subtotal: number, now = new Date()): string | null {
  if (code.status !== "active") return "This code is not active";
  if (code.startsAt && now < code.startsAt) return "This code is not active yet";
  if (code.expiresAt && now > code.expiresAt) return "This code has expired";
  if (code.maxUses && code.maxUses > 0 && code.usedCount >= code.maxUses) return "This code has reached its usage limit";
  if (code.minOrder && subtotal < code.minOrder) return `Minimum order of ${code.minOrder} required`;
  return null;
}
