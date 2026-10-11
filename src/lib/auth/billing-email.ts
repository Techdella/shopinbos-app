// Paystack needs an email on every transaction. Accounts created with a phone number have none,
// so they pay under a stable per-user address that payment verification can match against.
export function billingEmail(user: { id: string; email: string | null }) {
  return (user.email ?? `u-${user.id}@billing.shopinbos.com`).toLowerCase();
}
