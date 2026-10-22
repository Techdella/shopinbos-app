// Contracts between businesses on Shopinbos: the Dropship agreement (a shop and a supplier) and the Delivery service
// agreement (a shop or supplier and a delivery partner). Both sides read the same document, sign it by typing their
// name, and each keeps a copy under Contracts in their dashboard. Shopinbos is not a party: it keeps a sealed copy
// its team can only open while one of the two sides has a dispute open (src/lib/contracts/contracts.server.ts).
//
// Pure (no imports), so the web app, the phone app and tests/contracts.test.mjs share it. The document is written
// in English, the language that binds; the app's translations only cover the screens around it.

export const CONTRACT_KINDS = ["dropship", "delivery"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

/** Bump when the wording changes: contracts already signed keep the text and version they were signed with. */
export const CONTRACT_VERSION: Record<ContractKind, string> = { dropship: "2026-11", delivery: "2026-11" };

export const CONTRACT_TITLE: Record<ContractKind, string> = {
  dropship: "Dropship agreement",
  delivery: "Delivery service agreement",
};

/**
 * awaiting: the first side signed, waiting for the other · signed: both signed, in force · declined: the other side
 * said no · ended: one side stopped working with the other (the signed copy stays).
 */
export type ContractStatus = "awaiting" | "signed" | "declined" | "ended";

/** none · open (one side raised a dispute: the Shopinbos team may open the contract) · closed (settled, sealed again). */
export type DisputeStatus = "none" | "open" | "closed";

export interface ContractParty {
  /** What the document calls them: "the Shop", "the Supplier", "the Business", "the Delivery Partner". */
  label: string;
  /** Business name at signing. */
  name: string;
  /** City, address and CAC number when we have them. */
  details: string[];
}

export interface ContractSection {
  heading: string;
  paragraphs: string[];
}

/** The frozen document both sides sign. Stored as JSON on the contract and hashed. */
export interface ContractDocument {
  kind: ContractKind;
  version: string;
  title: string;
  /** ISO date the first side signed (the document's date). */
  date: string;
  partyA: ContractParty;
  partyB: ContractParty;
  sections: ContractSection[];
}

export const SIGNED_NAME_MIN = 3;
export const SIGNED_NAME_MAX = 80;
export const DISPUTE_REASON_MIN = 10;
/** How long an admin's opening of a disputed contract lasts before they must give a reason again. */
export const ADMIN_UNLOCK_MINUTES = 60;

/** A typed signature: a full name (two words or more, letters), trimmed and with single spaces. */
export function cleanSignedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < SIGNED_NAME_MIN || name.length > SIGNED_NAME_MAX) return null;
  if (!/\p{L}/u.test(name) || /[<>{}]/.test(name)) return null;
  if (name.split(" ").filter((part) => /\p{L}/u.test(part)).length < 2) return null;
  return name;
}

/** The reference both sides and the team use for a contract: SIB-DS-XXXXXXXX or SIB-DL-XXXXXXXX. */
export function contractReference(kind: string, id: string): string {
  return `SIB-${kind === "delivery" ? "DL" : "DS"}-${id.slice(-8).toUpperCase()}`;
}

/** Stable JSON for hashing: keys sorted, so the same document always gives the same hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Who can see a contract, in plain words (shown on the contract and the Contracts pages). */
export const PRIVACY_NOTE =
  "Only the two businesses that signed can read this contract. Shopinbos keeps a sealed copy: our team can only open it if one of you raises a dispute, every opening is recorded, and you are both told.";

const party = (name: string, details: Array<string | null | undefined>): Omit<ContractParty, "label"> => ({ name: name.trim() || "Not given", details: details.map((item) => item?.trim() ?? "").filter(Boolean) });

// ─── Shared clauses ───────────────────────────────────────────────────────────

function closingSections(a: string, b: string): ContractSection[] {
  return [
    {
      heading: "Disputes",
      paragraphs: [
        `If something goes wrong, ${a} and ${b} first try to settle it between themselves, by chat or call.`,
        "If that does not work, either of them can raise a dispute on this contract in the Shopinbos app, saying what went wrong. Shopinbos then looks at what the app recorded (orders, messages, payments, delivery updates and this contract) and what both sides send, and decides how much, if anything, one side owes the other. Money owed is recorded in the Shopinbos Wallet and paid the way the app sets out.",
        "Shopinbos's decision does not stop either side from going to a court or another lawful process in Nigeria.",
      ],
    },
    {
      heading: "Privacy of this contract",
      paragraphs: [
        PRIVACY_NOTE,
        "When a dispute is settled it is closed and the contract is sealed again. Shopinbos keeps the contract and its record for as long as the law needs it for legal claims, even if one side later closes their account, and then deletes it.",
      ],
    },
    {
      heading: "Customer data",
      paragraphs: [
        "Customers' names, phone numbers and addresses are shared only to fill and deliver their orders. Each side uses them only for that, keeps them safe, does not sell or share them, and deletes them when no longer needed, as the Nigeria Data Protection Act 2023 requires.",
        "Neither side contacts the other's customers to market or sell to them.",
      ],
    },
    {
      heading: "Ending this contract",
      paragraphs: [
        "Either side can stop working with the other at any time in the app. Orders and deliveries already started are finished as this contract says, and money already owed is still paid.",
        "The parts on disputes, money owed, returns and customer data keep applying after the contract ends.",
      ],
    },
    {
      heading: "Changes",
      paragraphs: [
        "This contract changes only when both sides sign a new version in the app. Anything else agreed (for example on a call) only binds if it is written in a signed version or in the notes on it.",
      ],
    },
    {
      heading: "Signing electronically",
      paragraphs: [
        "Each side signs by typing the full name of the person signing and confirming in the Shopinbos app, signed in to their own account. The person signing confirms they are allowed to sign for their business. This electronic signature binds the same as a signature on paper, under the Evidence Act 2011.",
        "To prove the signing, the app records each signer's name, account, the date and time, and the device and network address used. A fingerprint (SHA-256) of the document is shown on each copy, so either side can show the text was not changed after signing.",
      ],
    },
    {
      heading: "Law",
      paragraphs: ["This contract is governed by the laws of the Federal Republic of Nigeria. Shopinbos runs the app the two sides use but is not a party to this contract."],
    },
  ];
}

// ─── Dropship agreement ───────────────────────────────────────────────────────

export interface DropshipTerms {
  shop: { name: string; city?: string | null; address?: string | null };
  supplier: { name: string; city?: string | null; address?: string | null; cacNumber?: string | null };
  /** How the shop checked the stock before signing: visit | video. */
  stockCheck: string;
  /** Anything the shop wrote about what they agreed on the call. */
  sellerNote?: string | null;
  /** The supplier's return policy text, when they wrote one. */
  returnPolicy?: string | null;
  date: Date;
}

export function dropshipDocument(input: DropshipTerms): ContractDocument {
  const shop = "the Shop";
  const supplier = "the Supplier";
  const checked = input.stockCheck === "visit" ? "visited the Supplier's shop or warehouse" : "saw the stock on a video call";
  const sections: ContractSection[] = [
    {
      heading: "What this contract is",
      paragraphs: [
        `${shop} sells ${supplier}'s products in its online store without buying stock first. When a customer orders, ${supplier} sends the product straight to that customer. This is dropshipping: the products stay ${supplier}'s own products, with their own brand and packaging.`,
        `It is not private label. ${shop} does not get any right to ${supplier}'s brand names, logos or trademarks, and does not claim to make the products. ${shop} may use ${supplier}'s product photos and descriptions only to sell those products.`,
        `Before signing, ${shop} called ${supplier} and ${checked}.`,
      ],
    },
    {
      heading: "What the Supplier does",
      paragraphs: [
        `Keeps its stock and prices on Shopinbos up to date, and marks an item sold out as soon as it runs out.`,
        `Accepts or declines each order in the app on time, and sends each accepted order straight to the customer within 3 days, safely packed, in the product's own packaging.`,
        `Sends genuine products that match their description and photos, are safe and legal to sell in Nigeria, and carry any approval the law needs (for example NAFDAC or SON).`,
        `Does not add flyers, offers or contact details to the parcel asking the customer to buy from ${supplier} directly, and does not use the order to contact the customer.`,
      ],
    },
    {
      heading: "What the Shop does",
      paragraphs: [
        `Sets its own selling price and looks after its customers: questions, delivery updates and complaints.`,
        `Describes the products truthfully and does not promise anything about them that ${supplier} has not said.`,
        `Passes on each customer's order and delivery details correctly through the app.`,
      ],
    },
    {
      heading: "Money",
      paragraphs: [
        `When a customer pays by card, Paystack sends ${supplier}'s price straight to ${supplier}'s bank and ${shop}'s share to ${shop}'s bank. Shopinbos holds no one's money. Shopinbos's own fees are as shown in the app.`,
        `If ${supplier} is paid for an order and does not send it, ${supplier} pays the money back within 3 days. After that it is taken from ${supplier}'s next orders until it is paid.`,
      ],
    },
    {
      heading: "Returns",
      paragraphs: [
        `${supplier} takes back items that are wrong, damaged or not as described, and pays ${shop} back. ${shop} claims in its Shopinbos Wallet within 7 days of delivery, with photos or other proof.`,
        input.returnPolicy?.trim() ? `${supplier}'s return policy, which also applies: "${input.returnPolicy.trim().slice(0, 1200)}"` : `${supplier} has not written its own return policy, so this section is the return policy.`,
      ],
    },
    {
      heading: "Stopping new orders",
      paragraphs: [`${supplier} can decline new orders at any time, and ${shop} can remove ${supplier}'s products from its store at any time.`],
    },
    ...(input.sellerNote?.trim() ? [{ heading: "Notes agreed on the call", paragraphs: [input.sellerNote.trim().slice(0, 600)] }] : []),
    ...closingSections(shop, supplier),
  ];
  return {
    kind: "dropship",
    version: CONTRACT_VERSION.dropship,
    title: CONTRACT_TITLE.dropship,
    date: input.date.toISOString(),
    partyA: { label: "the Shop", ...party(input.shop.name, [input.shop.address, input.shop.city]) },
    partyB: { label: "the Supplier", ...party(input.supplier.name, [input.supplier.address, input.supplier.city, input.supplier.cacNumber ? `CAC ${input.supplier.cacNumber}` : null]) },
    sections,
  };
}

// ─── Delivery service agreement ───────────────────────────────────────────────

export interface DeliveryTerms {
  business: { name: string; role: "seller" | "supplier"; city?: string | null; address?: string | null };
  partner: { name: string; companyName?: string | null; address?: string | null; cacNumber?: string | null };
  date: Date;
}

export function deliveryDocument(input: DeliveryTerms): ContractDocument {
  const business = "the Business";
  const partner = "the Delivery Partner";
  const sections: ContractSection[] = [
    {
      heading: "What this contract is",
      paragraphs: [
        `${partner} collects parcels from ${business} (or from a supplier sending ${business}'s orders) and delivers them to ${business}'s customers in the areas ${partner} covers on Shopinbos.`,
        `Each delivery is priced by ${partner}'s public rate card on Shopinbos, or by a private rate card ${business} accepted in the app. The price shown when a delivery is booked is the price for that delivery.`,
      ],
    },
    {
      heading: "What the Delivery Partner does",
      paragraphs: [
        `Accepts or declines each job in the app, and collects accepted parcels at the agreed time and place.`,
        `Handles each parcel with care, does not open it, and delivers it to the customer named on the order at the address given, using the delivery code where the app asks for one.`,
        `Keeps the job's status up to date in the app, and says when a delivery fails and why. Fees for another attempt or a return are as on the rate card.`,
        `Uses riders who are trained, honest and identified in the app.`,
      ],
    },
    {
      heading: "What the Business does",
      paragraphs: [
        `Gives correct pickup and customer details, and has each parcel packed safely and ready at pickup.`,
        `Says when a parcel is fragile, heavy or needs special care, and never sends anything illegal or dangerous.`,
        `Pays delivery fees as shown in the app.`,
      ],
    },
    {
      heading: "Pay on delivery",
      paragraphs: [
        `Only when both sides switch it on in the app: ${partner} collects the customer's money at the door and pays it to ${business} the way and within the time the app sets out. Cash collected belongs to ${business} until it is paid over.`,
      ],
    },
    {
      heading: "Lost or damaged parcels",
      paragraphs: [
        `${partner} is responsible for a parcel from collection until delivery. If a parcel is lost, stolen or damaged in ${partner}'s care, ${partner} pays ${business} back its value as shown on the order. ${business} claims in its Shopinbos Wallet with the order and any proof.`,
      ],
    },
    ...closingSections(business, partner),
  ];
  return {
    kind: "delivery",
    version: CONTRACT_VERSION.delivery,
    title: CONTRACT_TITLE.delivery,
    date: input.date.toISOString(),
    partyA: { label: "the Business", ...party(input.business.name, [input.business.role === "supplier" ? "Supplier on Shopinbos" : "Shop on Shopinbos", input.business.address, input.business.city]) },
    partyB: {
      label: "the Delivery Partner",
      ...party(input.partner.name, [input.partner.companyName && input.partner.companyName !== input.partner.name ? input.partner.companyName : null, input.partner.address, input.partner.cacNumber ? `CAC ${input.partner.cacNumber}` : null]),
    },
    sections,
  };
}

/** Reads a stored document back (JSON from the database), or null when it isn't one. */
export function readContractDocument(value: unknown): ContractDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<ContractDocument>;
  if (!CONTRACT_KINDS.includes(doc.kind as ContractKind) || !Array.isArray(doc.sections) || !doc.partyA || !doc.partyB) return null;
  return doc as ContractDocument;
}
