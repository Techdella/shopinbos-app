import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

// The Shopinbos Wallet (web /home/wallet, /supplier/wallet, /logistics/wallet) for sellers, suppliers and delivery
// partners: verify an ID (BVN or NIN), add the bank Paystack settles to, then see what Paystack paid in. Shopinbos
// never holds the money. Also the two card payments that go straight to another business's bank: a delivery
// partner paying a seller their cash on delivery, and a seller paying a delivery fee.

export type WalletRole = "seller" | "supplier" | "logistics_partner";

export interface WalletView {
  kyc: { status: string; idType: string | null; idLast4: string | null; name: string | null; verifiedAt: string | null; checksReady: boolean };
  bank: { bankName: string; accountName: string; accountEnding: string } | null;
  settlement: { status: string; error: string | null; frozen: boolean; frozenReason: string | null; korapay: boolean };
  totals: { paidKobo: number; last30Kobo: number };
  entries: { id: string; description: string; amountKobo: number; status: string; orderId: string | null; createdAt: string }[];
  settlements: { id: string; date: string | null; status: string; amountKobo: number }[];
  sellerSettles: { orderId: string; orderNumber: string; amountKobo: number }[];
  toReturn: { orderId: string; orderNumber: string; otherParty: string; amountKobo: number }[];
}

export interface CashToReceive {
  partnerId: string;
  partnerName: string;
  amount: number;
  jobs: number;
}

export interface WalletData {
  role: WalletRole;
  ownerName: string;
  view: WalletView;
  cashToReceive: CashToReceive[];
  banks: string[];
}

export const fetchWallet = () => api<WalletData>("/api/mobile/wallet");

export const verifyWalletId = (input: { idType: "bvn" | "nin"; idNumber: string; firstName: string; lastName: string; dateOfBirth: string; consent: boolean }) =>
  api<{ ok: true; message?: string }>("/api/mobile/wallet/kyc", { method: "POST", json: input });

export const linkWalletBank = (input: { bankName: string; accountNumber: string }) =>
  api<{ ok: true; message?: string }>("/api/mobile/wallet/bank", { method: "POST", json: input });

export const confirmCashReceived = (partnerId: string) => api<{ settled: number }>("/api/mobile/wallet/cash-received", { method: "POST", json: { partnerId } });

export interface SellerCash {
  sellerId: string;
  sellerName: string;
  amount: number;
  jobs: number;
  payable: boolean;
  oldestAt: string;
}

export const fetchSellersCash = () => api<{ sellers: SellerCash[] }>("/api/mobile/logistics/sellers-cash");

interface Started {
  reference: string;
  authorizationUrl: string | null;
}

/**
 * Opens Paystack's payment page for a payment the server started, then asks the server whether it went through
 * (the server asks Paystack; the webhook confirms it too if the page is closed before it returns).
 */
async function payInBrowser(start: () => Promise<Started>, confirmPath: string): Promise<{ paid: boolean; message?: string }> {
  const started = await start();
  if (!started.authorizationUrl) return { paid: false };
  await WebBrowser.openBrowserAsync(started.authorizationUrl);
  return api<{ paid: boolean; message?: string }>(confirmPath, { method: "POST", json: { reference: started.reference } });
}

/** A delivery partner pays one seller the cash their riders collected, straight to the seller's bank. */
export const paySellerCash = (sellerId: string) =>
  payInBrowser(() => api<Started>("/api/mobile/logistics/sellers-cash/pay", { method: "POST", json: { sellerId } }), "/api/mobile/logistics/sellers-cash/confirm");

/** A seller pays a booking's delivery fee by card, straight to the delivery partner's bank. */
export const payDeliveryFee = (bookingId: string) =>
  payInBrowser(() => api<Started>(`/api/mobile/deliveries/${encodeURIComponent(bookingId)}/pay-fee`, { method: "POST" }), "/api/mobile/deliveries/fee-confirm");

export const nairaFromKobo = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
