import type React from "react";
import { PAYMENT_BADGE_LABELS, type PaymentBadgeKey } from "@shared/payment-badges";

// Small payment logos for the storefront footer, the checkout's "We accept" row and the seller's preview on the
// Payments page: brand marks in their usual colours on white rounded "card" chips about 38×24, drawn inline (no
// image hosting). Bank transfer and pay on delivery are an icon and words. Every chip is white with a faint edge,
// so the row reads the same on light and dark themes.

const H = 24;
const EDGE = "rgba(15,23,42,0.14)";

/** Chip widths: most marks fit 38; the long wordmarks get a little more room. */
const WIDTHS: Partial<Record<PaymentBadgeKey, number>> = { paystack: 48, flutterwave: 56 };

function Chip({ width, label, children }: { width: number; label: string; children: React.ReactNode }) {
  return (
    <svg role="img" aria-label={label} width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block shrink-0" focusable="false">
      <title>{label}</title>
      <rect x="0.5" y="0.5" width={width - 1} height={H - 1} rx="4.5" fill="#FFFFFF" stroke={EDGE} />
      {children}
    </svg>
  );
}

const SANS = "Arial, Helvetica, sans-serif";

function Mark({ badge }: { badge: PaymentBadgeKey }) {
  switch (badge) {
    case "visa":
      return (
        <text x="19" y="16.2" textAnchor="middle" fontFamily={SANS} fontSize="10.5" fontWeight="900" fontStyle="italic" fill="#1A1F71" letterSpacing="-0.2">
          VISA
        </text>
      );
    case "mastercard":
      return (
        <>
          <circle cx="15.5" cy="12" r="6.5" fill="#EB001B" />
          <circle cx="22.5" cy="12" r="6.5" fill="#F79E1B" />
          <path d="M19 6.52A6.5 6.5 0 0 1 19 17.48A6.5 6.5 0 0 1 19 6.52Z" fill="#FF5F00" />
        </>
      );
    case "verve":
      return (
        <>
          <circle cx="9.5" cy="12" r="5" fill="#E4002B" />
          <path d="M7.3 9.7 9.5 14.4 11.7 9.7" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="15.1" y="14.7" fontFamily={SANS} fontSize="7.3" fontWeight="700" fill="#00425F">
            verve
          </text>
        </>
      );
    case "amex":
      return (
        <>
          <rect x="3" y="4" width="32" height="16" rx="2" fill="#016FD0" />
          <text x="19" y="14.9" textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight="900" fill="#FFFFFF" letterSpacing="0.3">
            AMEX
          </text>
        </>
      );
    case "paypal":
      return (
        <text x="19" y="15.4" textAnchor="middle" fontFamily={SANS} fontSize="8.6" fontWeight="800" fontStyle="italic">
          <tspan fill="#003087">Pay</tspan>
          <tspan fill="#009CDE">Pal</tspan>
        </text>
      );
    case "applepay":
      return (
        <>
          <path
            transform="translate(5.6 6.4) scale(0.46)"
            fill="#000000"
            d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
          />
          <text x="17.6" y="15.6" fontFamily={SANS} fontSize="9" fontWeight="600" fill="#000000">
            Pay
          </text>
        </>
      );
    case "googlepay":
      return (
        <>
          <g fill="none" strokeWidth="1.9">
            <path d="M5.05 10.56A4.2 4.2 0 0 1 12.22 9.3" stroke="#EA4335" />
            <path d="M5.36 14.1A4.2 4.2 0 0 1 5.05 10.56" stroke="#FBBC04" />
            <path d="M11.97 14.97A4.2 4.2 0 0 1 5.36 14.1" stroke="#34A853" />
            <path d="M13.2 12A4.2 4.2 0 0 1 11.97 14.97M9.3 12H13.2" stroke="#4285F4" />
          </g>
          <text x="15.6" y="15.3" fontFamily={SANS} fontSize="8.6" fontWeight="600" fill="#5F6368">
            Pay
          </text>
        </>
      );
    case "paystack":
      return (
        <>
          <rect x="5" y="6.6" width="7" height="1.9" rx="0.6" fill="#00C3F7" />
          <rect x="5" y="9.5" width="7" height="1.9" rx="0.6" fill="#00C3F7" />
          <rect x="5" y="12.4" width="7" height="1.9" rx="0.6" fill="#011B33" />
          <rect x="5" y="15.3" width="5" height="1.9" rx="0.6" fill="#011B33" />
          <text x="14" y="14.8" fontFamily={SANS} fontSize="7" fontWeight="700" fill="#011B33">
            paystack
          </text>
        </>
      );
    case "flutterwave":
      return (
        <>
          <g fill="none" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 16.5c1.2-4.6 3.2-8 6-9.5" stroke="#F5A623" />
            <path d="M6.2 11.4c1.8-.4 3.6.1 5 1.3" stroke="#FF5805" />
            <path d="M7.4 16.6c1.4-.9 2.7-1 4-.4" stroke="#009A9A" />
          </g>
          <text x="14" y="14.8" fontFamily={SANS} fontSize="6.7" fontWeight="700" fill="#2A3362">
            flutterwave
          </text>
        </>
      );
    case "opay":
      return (
        <>
          <rect x="3" y="4" width="32" height="16" rx="2" fill="#1DCF9F" />
          <text x="19" y="15.2" textAnchor="middle" fontFamily={SANS} fontSize="8.8" fontWeight="900" fill="#FFFFFF">
            OPay
          </text>
        </>
      );
    default:
      return null;
  }
}

function BankIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="M8 1.6 1.8 4.8v1.4h12.4V4.8L8 1.6Z" fill="currentColor" />
      <path d="M3.2 7.4v4.6M6.4 7.4v4.6M9.6 7.4v4.6M12.8 7.4v4.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.8 13.2h12.4v1.4H1.8z" fill="currentColor" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 18 14" aria-hidden="true" focusable="false" className="shrink-0">
      <rect x="1" y="2" width="16" height="10" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.6 4.6h.01M14.4 9.4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** One payment logo. `label` overrides the shopper-facing words on the two text badges (e.g. translated). */
export function PaymentBadge({ badge, label }: { badge: PaymentBadgeKey; label?: string }) {
  if (badge === "transfer" || badge === "cod") {
    const words = label ?? PAYMENT_BADGE_LABELS[badge];
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4.5px] border bg-white px-2 text-[10.5px] font-semibold leading-none"
        style={{ height: H, borderColor: EDGE, color: "#1F2937" }}
      >
        {badge === "transfer" ? <BankIcon /> : <CashIcon />}
        {words}
      </span>
    );
  }
  return (
    <Chip width={WIDTHS[badge] ?? 38} label={PAYMENT_BADGE_LABELS[badge]}>
      <Mark badge={badge} />
    </Chip>
  );
}

/** A row of logos as a list ("We accept" for screen readers). Renders nothing when the store shows none. */
export function PaymentBadgeRow({
  badges,
  label = "We accept",
  labels,
  className = "",
}: {
  badges: readonly PaymentBadgeKey[];
  label?: string;
  /** Words for the two text badges. */
  labels?: Partial<Record<PaymentBadgeKey, string>>;
  className?: string;
}) {
  if (!badges.length) return null;
  return (
    <ul aria-label={label} className={`m-0 flex list-none flex-wrap items-center gap-1.5 p-0 ${className}`}>
      {badges.map((badge) => (
        <li key={badge} className="flex">
          <PaymentBadge badge={badge} label={labels?.[badge]} />
        </li>
      ))}
    </ul>
  );
}
