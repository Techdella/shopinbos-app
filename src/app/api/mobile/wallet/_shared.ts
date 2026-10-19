import { withAuth } from "@/lib/auth/middleware";

// The phone app's Shopinbos Wallet (the same wallet as the web's /home, /supplier and /logistics wallet pages):
// sellers, suppliers and delivery partners. Money never moves here: these set up where Paystack settles each
// business's share, and show what it settled.
export const withWalletOwner = (handler: Parameters<typeof withAuth>[0]) => withAuth(handler, ["seller", "supplier", "logistics_partner"]);
