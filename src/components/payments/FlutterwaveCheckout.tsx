"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: Record<string, unknown>) => void;
  }
}

interface FlutterwaveCheckoutProps {
  amount: number;
  currency?: string;
  email: string;
  name: string;
  phone?: string;
  metadata?: Record<string, unknown>;
  onSuccess?: (response: { transaction_id: string; status: string }) => void;
  onClose?: () => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  label?: string;
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ?? "";

export function FlutterwaveCheckoutButton({
  amount,
  currency = "NGN",
  email,
  name,
  phone,
  metadata,
  onSuccess,
  onClose,
  children,
  className,
  disabled,
  label = "Pay with Flutterwave",
}: FlutterwaveCheckoutProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handlePayment = useCallback(() => {
    if (!PUBLIC_KEY) {
      toast("Flutterwave is not configured", "error");
      return;
    }

    setLoading(true);

    const config: Record<string, unknown> = {
      public_key: PUBLIC_KEY,
      tx_ref: `flutterwave-${Date.now()}`,
      amount,
      currency,
      payment_options: "card, ussd, banktransfer, account, mpesa, mobilemoneyng",
      customer: { email, name, phone_number: phone },
      customizations: {
        title: "Shopinbos",
        description: "Payment for order",
        logo: "https://shopinbos.com/logo.png",
      },
      meta: metadata,
      callback: (response: { transaction_id: string; status: string }) => {
        setLoading(false);
        if (response.status === "completed" || response.status === "successful") {
          toast("Payment successful!", "success");
          onSuccess?.(response);
        } else {
          toast("The payment didn't go through. Nothing was taken. Try again.", "error");
        }
      },
      onclose: () => {
        setLoading(false);
        toast("Payment cancelled", "info");
        onClose?.();
      },
    };

    if (typeof window.FlutterwaveCheckout === "function") {
      window.FlutterwaveCheckout(config);
    } else {
      const script = document.createElement("script");
      script.src = "https://checkout.flutterwave.com/v3.js";
      script.onload = () => {
        if (window.FlutterwaveCheckout) {
          window.FlutterwaveCheckout(config);
        }
      };
      document.body.appendChild(script);
    }
  }, [amount, currency, email, name, phone, metadata, onSuccess, onClose, toast]);

  return (
    <button
      onClick={handlePayment}
      className={className ?? "btn btn-mint"}
      disabled={disabled || loading}
    >
      {loading ? "Processing..." : (children ?? label)}
    </button>
  );
}
