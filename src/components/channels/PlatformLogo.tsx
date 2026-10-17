import type { ReactNode } from "react";

// Platform marks for Sell everywhere (/channels): our own simple drawings in each platform's colours, recognisable
// at a glance, not copies of the official artwork. 48×48 rounded tiles; decorative (the card says the name).

export type LogoPlatform = "whatsapp" | "meta" | "tiktok" | "google" | "pinterest" | "snapchat" | "amazon" | "jumia" | "konga" | "jiji" | "ebay" | "etsy" | "shopify";

const SANS = "Arial, Helvetica, sans-serif";

function Tile({ fill, children, stroke }: { fill: string; children: ReactNode; stroke?: boolean }) {
  return (
    <>
      <rect x="0.5" y="0.5" width="47" height="47" rx="13" fill={fill} stroke={stroke ? "#E7E4DC" : "none"} />
      {children}
    </>
  );
}

const MARKS: Record<LogoPlatform, ReactNode> = {
  whatsapp: (
    <Tile fill="#25D366">
      <path d="M24 11.5c-7 0-12.6 5.5-12.6 12.4 0 2.3.6 4.4 1.7 6.3l-1.8 6.5 6.7-1.7c1.8 1 3.9 1.5 6 1.5 7 0 12.6-5.6 12.6-12.5S31 11.5 24 11.5Z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M19.6 18.6c.4-.4 1-.4 1.3 0l1.4 2.2c.3.4.2.9-.1 1.2l-.8.8c.7 1.6 2 2.9 3.6 3.7l.8-.8c.3-.3.8-.4 1.2-.1l2.2 1.4c.4.3.5.9.1 1.3l-.9 1c-.8.8-2.1 1-3.1.5-3.1-1.5-5.5-3.9-7-7-.5-1-.3-2.3.5-3.1l.8-1.1Z" fill="#fff" />
    </Tile>
  ),
  meta: (
    <>
      <defs>
        <linearGradient id="sib-ig" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FDC34B" />
          <stop offset="0.45" stopColor="#E8405E" />
          <stop offset="1" stopColor="#8A3AB9" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="47" height="47" rx="13" fill="#1877F2" />
      <path d="M0.5 47.5 47.5 0.5V34.5a13 13 0 0 1-13 13Z" fill="url(#sib-ig)" />
      <path d="M17.5 30V21.3h-2.6v-3.2h2.6v-2.4c0-2.7 1.6-4.2 4-4.2 1.1 0 2.1.1 2.4.1v2.8h-1.6c-1.3 0-1.6.6-1.6 1.5v2.2h3.1l-.4 3.2h-2.7V30Z" fill="#fff" />
      <rect x="27" y="25" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.9" />
      <circle cx="33.5" cy="31.5" r="3" fill="none" stroke="#fff" strokeWidth="1.9" />
      <circle cx="37.3" cy="27.7" r="0.9" fill="#fff" />
    </>
  ),
  tiktok: (
    <Tile fill="#111111">
      <g transform="translate(-1.2 -1)">
        <path d="M26.5 12v16.3a4.8 4.8 0 1 1-4.8-4.8" fill="none" stroke="#25F4EE" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M26.5 12c.6 3.3 2.7 5.4 6.2 5.8" fill="none" stroke="#25F4EE" strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <g transform="translate(1.2 1)">
        <path d="M26.5 12v16.3a4.8 4.8 0 1 1-4.8-4.8" fill="none" stroke="#FE2C55" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M26.5 12c.6 3.3 2.7 5.4 6.2 5.8" fill="none" stroke="#FE2C55" strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <path d="M26.5 12v16.3a4.8 4.8 0 1 1-4.8-4.8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M26.5 12c.6 3.3 2.7 5.4 6.2 5.8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </Tile>
  ),
  google: (
    <Tile fill="#fff" stroke>
      <path d="M35.5 24.3c0-.9-.1-1.7-.2-2.4H24v4.6h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" fill="#4285F4" />
      <path d="M24 36c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5h-4v3.1A12 12 0 0 0 24 36Z" fill="#34A853" />
      <path d="M17.3 26.3a7.2 7.2 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" fill="#FBBC05" />
      <path d="M24 16.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 13.3 18.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" fill="#EA4335" />
    </Tile>
  ),
  pinterest: (
    <Tile fill="#E60023">
      <path d="M24.6 12c-6.9 0-10.4 4.9-10.4 9 0 2.5.9 4.7 3 5.5.3.1.7 0 .8-.4l.3-1.2c.1-.4 0-.5-.2-.8-.6-.7-1-1.6-1-2.9 0-3.7 2.8-7.1 7.3-7.1 4 0 6.2 2.4 6.2 5.7 0 4.3-1.9 7.9-4.7 7.9-1.6 0-2.7-1.3-2.4-2.9.5-1.9 1.3-3.9 1.3-5.3 0-1.2-.7-2.2-2-2.2-1.6 0-2.9 1.7-2.9 3.9 0 1.4.5 2.4.5 2.4l-1.9 8.1c-.4 1.7-.3 3.7-.2 5.4h1.5c.9-1.4 1.8-3.2 2.2-4.6l1-3.8c.5 1 2 1.8 3.6 1.8 4.7 0 7.9-4.3 7.9-10 0-4.3-3.7-8.4-9.3-8.4Z" fill="#fff" />
    </Tile>
  ),
  snapchat: (
    <Tile fill="#FFFC00">
      <path d="M24 12.5c-4.4 0-7 3.2-7 7.2v3.1l-1.9-.6c-.8-.2-1.3.8-.6 1.2l2.3 1.4c-.9 2.3-2.6 3.9-4.4 4.5-.5.2-.5.9 0 1.1l2.3.8.6 1.8 2.6-.2c1.3.1 2.6 1.9 6.1 1.9s4.8-1.8 6.1-1.9l2.6.2.6-1.8 2.3-.8c.5-.2.5-.9 0-1.1-1.8-.6-3.5-2.2-4.4-4.5l2.3-1.4c.7-.4.2-1.4-.6-1.2l-1.9.6v-3.1c0-4-2.6-7.2-7-7.2Z" fill="#fff" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
    </Tile>
  ),
  amazon: (
    <Tile fill="#131921">
      <text x="24" y="27" textAnchor="middle" fontFamily={SANS} fontWeight="700" fontSize="19" fill="#fff">a</text>
      <path d="M14 30.5c5.8 3.6 13.6 3.9 19.6.4" fill="none" stroke="#FF9900" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M30.6 29.4l3.5 1.1-1.3 3.3" fill="none" stroke="#FF9900" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Tile>
  ),
  jumia: (
    <Tile fill="#F68B1E">
      <text x="21" y="31" textAnchor="middle" fontFamily={SANS} fontWeight="800" fontSize="20" fill="#fff">J</text>
      <path d="m32 14 1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4Z" fill="#fff" />
    </Tile>
  ),
  konga: (
    <Tile fill="#ED017F">
      <text x="24" y="31.5" textAnchor="middle" fontFamily={SANS} fontWeight="800" fontSize="21" fill="#fff">K</text>
    </Tile>
  ),
  jiji: (
    <Tile fill="#3DB83A">
      <text x="24" y="29.5" textAnchor="middle" fontFamily={SANS} fontWeight="800" fontSize="15" fill="#fff">jiji</text>
    </Tile>
  ),
  ebay: (
    <Tile fill="#fff" stroke>
      <text x="24" y="29.5" textAnchor="middle" fontFamily={SANS} fontWeight="700" fontSize="15" letterSpacing="-0.8">
        <tspan fill="#E53238">e</tspan>
        <tspan fill="#0064D2">b</tspan>
        <tspan fill="#F5AF02">a</tspan>
        <tspan fill="#86B817">y</tspan>
      </text>
    </Tile>
  ),
  etsy: (
    <Tile fill="#F1641E">
      <text x="24" y="31.5" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="22" fill="#fff">E</text>
    </Tile>
  ),
  shopify: (
    <Tile fill="#95BF47">
      <path d="M15.5 19h17l-1.6 16H17.1Z" fill="#fff" />
      <path d="M20 19v-1.5a4 4 0 0 1 8 0V19" fill="none" stroke="#fff" strokeWidth="2.2" />
      <text x="24" y="31.5" textAnchor="middle" fontFamily={SANS} fontWeight="800" fontSize="11" fill="#5E8E3E">S</text>
    </Tile>
  ),
};

export function PlatformLogo({ platform, size = 48, className }: { platform: LogoPlatform; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      {MARKS[platform]}
    </svg>
  );
}
