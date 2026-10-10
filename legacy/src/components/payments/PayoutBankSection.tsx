"use client";

import { useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { BankLinkingModal } from "./BankLinkingModal";

interface PayoutBank {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface PayoutBankSectionProps {
  role: "seller" | "supplier" | "logistics_partner";
  payoutBank: PayoutBank | null;
  displayName: string;
}

export function PayoutBankSection({ role, payoutBank, displayName }: PayoutBankSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  // Determine role-specific styling
  const cardGradient = 
    role === "seller" 
      ? "linear-gradient(135deg, #f15928 0%, #d24414 100%)" // Orange for Seller
      : role === "supplier"
      ? "linear-gradient(135deg, #195754 0%, #0a3835 60%, #062622 100%)" // Dark Teal/Green for Supplier
      : "linear-gradient(135deg, #5b6ad0, #3a4ba6 60%, #1f2872)"; // Indigo for Logistics

  const bankNameDisplay = payoutBank?.bankName || "NO BANK CONNECTED";
  const accountNumberDisplay = 
    payoutBank?.accountNumber 
      ? `•••• •••• ${payoutBank.accountNumber.slice(-4)}` 
      : "0000 0000 00";
  const accountNameDisplay = payoutBank?.accountName || displayName;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Payout bank account</div>

      {payoutBank ? (
        <div style={{
          padding: 16,
          background: cardGradient,
          borderRadius: 14,
          color: "white",
          marginBottom: 14,
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div style={{ width: 36, height: 24, background: "rgba(255,255,255,0.25)", borderRadius: 4 }} />
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 700, textTransform: "uppercase" }}>
              {bankNameDisplay}
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, letterSpacing: "0.15em", marginBottom: 14 }}>
            {accountNumberDisplay}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 9.5, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                Account name
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {accountNameDisplay.toUpperCase()}
              </div>
            </div>
            <Badge variant="success" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
              <Icon name="check" size={9} /> Connected
            </Badge>
          </div>
        </div>
      ) : (
        <div style={{
          padding: "32px 18px",
          border: "2px dashed var(--ink-200)",
          borderRadius: 14,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          background: "var(--ink-50)",
        }}>
          <span style={{ fontSize: 24 }}>🏦</span>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-800)" }}>No bank account linked</div>
          <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 max(10px, 5%)", lineHeight: 1.4 }}>
            Link your bank account to automatically receive payout settlements via Paystack.
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button 
          onClick={() => setModalOpen(true)} 
          className="dbtn dBtn-ghost" 
          style={{ flex: 1, justifyContent: "center" }}
        >
          <Icon name={payoutBank ? "edit" : "plus"} size={12} /> 
          {payoutBank ? "Change account" : "Link bank account"}
        </button>
      </div>

      <BankLinkingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        role={role}
        initialBankName={payoutBank?.bankName ?? ""}
        initialAccountNumber={payoutBank?.accountNumber ?? ""}
        initialAccountName={payoutBank?.accountName ?? ""}
      />
    </div>
  );
}
