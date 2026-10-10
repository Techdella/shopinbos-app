"use client";

import { useEffect, useMemo, useState } from "react";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { buildStorefrontOrigin, getPlatformRootDomain } from "@/lib/domains/storefront";

interface DomainResult {
  domain: string;
  ending: string;
  available: boolean;
  price: number | null;
  currency: string;
}

interface DomainVerification {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

interface DomainConfiguration {
  configuredBy: "CNAME" | "A" | "http" | "dns-01" | null;
  acceptedChallenges: Array<"dns-01" | "http-01">;
  recommendedIPv4: Array<{ rank: number; value: string[] }>;
  recommendedCNAME: Array<{ rank: number; value: string }>;
  misconfigured: boolean;
}

interface ConnectedDomain {
  domain: string;
  verified: boolean;
  verification: DomainVerification[];
  configuration: DomainConfiguration | null;
  demo?: boolean;
}

interface RegistrarContactSchemaProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: string;
  enum?: string[];
  format?: string;
  properties?: Record<string, RegistrarContactSchemaProperty>;
  required?: string[];
}

interface RegistrarContactSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, RegistrarContactSchemaProperty>;
  required?: string[];
}

interface DomainOrderItem {
  domainName: string;
  status: string;
  price: number;
  years: number;
  autoRenew: boolean;
  purchaseType: string;
  error?: {
    code?: string;
    details?: Record<string, string>;
  };
}

interface DomainPurchaseStatusPayload {
  orderId: string;
  status: "draft" | "purchasing" | "completed" | "failed";
  domains: DomainOrderItem[];
  error?: {
    code?: string;
    message?: string;
  };
}

interface StandardContactValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  companyName: string;
}

interface DomainSetupProps {
  storeSlug: string;
  storeName: string;
  onDone: (domain: string | null) => void;
}

const STANDARD_CONTACT_KEYS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "address1",
  "address2",
  "city",
  "state",
  "zip",
  "country",
  "companyName",
]);

const DEFAULT_CONTACT_VALUES: StandardContactValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "NG",
  companyName: "",
};

function toTitle(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function getFieldInputType(
  key: string,
  property?: RegistrarContactSchemaProperty,
): "text" | "email" | "tel" {
  if (property?.format === "email" || key === "email") return "email";
  if (property?.format === "tel" || key === "phone" || key === "fax") return "tel";
  return "text";
}

function getSchemaSection(schema: RegistrarContactSchema | null) {
  const additional = schema?.properties?.additional;
  if (additional?.properties) {
    return {
      properties: additional.properties,
      required: additional.required ?? [],
      title: additional.title,
      description: additional.description,
    };
  }

  return {
    properties: schema?.properties ?? {},
    required: schema?.required ?? [],
    title: schema?.title,
    description: schema?.description,
  };
}

export function DomainSetup({ storeSlug, storeName, onDone }: DomainSetupProps) {
  const [option, setOption] = useState<"free" | "connect" | "buy" | null>(null);
  const [searchQuery, setSearchQuery] = useState(storeSlug);
  const [searchResults, setSearchResults] = useState<DomainResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [customDomainInput, setCustomDomainInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectedDomain, setConnectedDomain] = useState<ConnectedDomain | null>(null);

  const [selectedPurchaseDomain, setSelectedPurchaseDomain] = useState<DomainResult | null>(null);
  const [contactSchema, setContactSchema] = useState<RegistrarContactSchema | null>(null);
  const [contactValues, setContactValues] = useState<StandardContactValues>(DEFAULT_CONTACT_VALUES);
  const [extraContactValues, setExtraContactValues] = useState<Record<string, string>>({});
  const [isLoadingContactSchema, setIsLoadingContactSchema] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseOrder, setPurchaseOrder] = useState<DomainPurchaseStatusPayload | null>(null);
  const [purchaseIntegrationError, setPurchaseIntegrationError] = useState<string | null>(null);

  const rootDomain = getPlatformRootDomain();
  const freeDomain = `${storeSlug}.${rootDomain}`;
  const freeOrigin = buildStorefrontOrigin({ slug: storeSlug });

  const schemaSection = useMemo(() => getSchemaSection(contactSchema), [contactSchema]);
  const extraFields = useMemo(
    () =>
      Object.entries(schemaSection.properties).filter(([key]) => {
        if (key === "additional") return false;
        return !STANDARD_CONTACT_KEYS.has(key);
      }),
    [schemaSection],
  );
  const requiredExtraFields = useMemo(() => new Set(schemaSection.required), [schemaSection]);

  useEffect(() => {
    if (!purchaseOrder?.orderId || connectedDomain) return;
    if (purchaseOrder.status === "failed") return;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/domains/order/${purchaseOrder.orderId}`);
        const payload = (await response.json().catch(() => null)) as
          | {
              data?: {
                order?: DomainPurchaseStatusPayload;
                assignedDomain?: ConnectedDomain | null;
                integrationError?: string;
              };
              error?: { message?: string };
            }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Could not check your domain order.");
        }

        if (payload?.data?.order) {
          setPurchaseOrder(payload.data.order);
        }

        if (payload?.data?.integrationError) {
          setPurchaseIntegrationError(payload.data.integrationError);
        }

        if (payload?.data?.assignedDomain) {
          window.clearInterval(interval);
          setConnectedDomain(payload.data.assignedDomain);
        } else if (payload?.data?.order?.status === "failed") {
          window.clearInterval(interval);
        }
      } catch (error) {
        window.clearInterval(interval);
        setPurchaseError(error instanceof Error ? error.message : "Could not check your domain order.");
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [connectedDomain, purchaseOrder]);

  async function searchDomains() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError("Enter a word or brand name first.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/domains/search?q=${encodeURIComponent(query)}`);
      const payload = (await response.json().catch(() => null)) as
        | { data?: DomainResult[]; error?: { message?: string } }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Domain search failed.");
      }

      setSearchResults(payload?.data ?? []);
      if ((payload?.data ?? []).length === 0) {
        setSearchError("No domain ideas came back for that search. Try a shorter keyword.");
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Domain search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  async function connectDomain(domain = customDomainInput) {
    const normalized = domain.trim();
    if (!normalized) {
      setConnectError("Enter the domain you already own.");
      return;
    }

    setIsConnecting(true);
    setConnectError(null);
    setPurchaseError(null);
    setPurchaseIntegrationError(null);

    try {
      const response = await fetch("/api/domains/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: normalized }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: ConnectedDomain; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "We could not connect that domain.");
      }

      setConnectedDomain(payload.data);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "We could not connect that domain.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function preparePurchase(domain: DomainResult) {
    setSelectedPurchaseDomain(domain);
    setPurchaseError(null);
    setPurchaseIntegrationError(null);
    setPurchaseOrder(null);
    setContactSchema(null);
    setExtraContactValues({});
    setIsLoadingContactSchema(true);

    try {
      const response = await fetch(`/api/domains/contact-info?domain=${encodeURIComponent(domain.domain)}`);
      const payload = (await response.json().catch(() => null)) as
        | { data?: RegistrarContactSchema; error?: { message?: string } }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Could not load the registrar checkout fields.");
      }

      const schema = payload?.data ?? {};
      setContactSchema(schema);

      const nextExtraValues: Record<string, string> = {};
      const section = getSchemaSection(schema);
      Object.entries(section.properties).forEach(([key, property]) => {
        if (!STANDARD_CONTACT_KEYS.has(key) && typeof property.default === "string") {
          nextExtraValues[key] = property.default;
        }
      });
      setExtraContactValues(nextExtraValues);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Could not load the registrar checkout fields.");
    } finally {
      setIsLoadingContactSchema(false);
    }
  }

  function updateContactValue(key: keyof StandardContactValues, value: string) {
    setContactValues((current) => ({ ...current, [key]: value }));
  }

  function updateExtraContactValue(key: string, value: string) {
    setExtraContactValues((current) => ({ ...current, [key]: value }));
  }

  async function purchaseDomain() {
    if (!selectedPurchaseDomain) return;

    const requiredBaseFields: Array<keyof StandardContactValues> = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "address1",
      "city",
      "state",
      "zip",
      "country",
    ];

    const missingBaseField = requiredBaseFields.find((field) => !contactValues[field].trim());
    if (missingBaseField) {
      setPurchaseError(`Add your ${toTitle(missingBaseField).toLowerCase()} before continuing.`);
      return;
    }

    if (!contactValues.phone.trim().startsWith("+")) {
      setPurchaseError("Use your phone number in international format, for example +2348012345678.");
      return;
    }

    if (contactValues.country.trim().length !== 2) {
      setPurchaseError("Country should be a two-letter ISO code like NG or US.");
      return;
    }

    const missingExtraField = extraFields.find(
      ([key]) => requiredExtraFields.has(key) && !extraContactValues[key]?.trim(),
    );
    if (missingExtraField) {
      setPurchaseError(`Add ${toTitle(missingExtraField[0]).toLowerCase()} before continuing.`);
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);
    setPurchaseIntegrationError(null);

    try {
      const additional = Object.fromEntries(
        Object.entries(extraContactValues)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value.length > 0),
      );

      const response = await fetch("/api/domains/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: selectedPurchaseDomain.domain,
          years: 1,
          autoRenew,
          expectedPrice: selectedPurchaseDomain.price ?? undefined,
          contactInformation: {
            firstName: contactValues.firstName.trim(),
            lastName: contactValues.lastName.trim(),
            email: contactValues.email.trim(),
            phone: contactValues.phone.trim(),
            address1: contactValues.address1.trim(),
            city: contactValues.city.trim(),
            state: contactValues.state.trim(),
            zip: contactValues.zip.trim(),
            country: contactValues.country.trim().toUpperCase(),
            ...(contactValues.address2.trim() ? { address2: contactValues.address2.trim() } : {}),
            ...(contactValues.companyName.trim() ? { companyName: contactValues.companyName.trim() } : {}),
            ...(Object.keys(additional).length > 0 ? { additional } : {}),
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { domain: string; orderId: string }; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.data?.orderId) {
        throw new Error(payload?.error?.message ?? "Could not complete the registrar checkout.");
      }

      setPurchaseOrder({
        orderId: payload.data.orderId,
        status: "purchasing",
        domains: [
          {
            domainName: payload.data.domain,
            status: "purchasing",
            price: selectedPurchaseDomain.price ?? 0,
            years: 1,
            autoRenew,
            purchaseType: "registration",
          },
        ],
      });
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Could not complete the registrar checkout.");
    } finally {
      setIsPurchasing(false);
    }
  }

  function resetDomainFlow() {
    setConnectedDomain(null);
    setConnectError(null);
    setPurchaseError(null);
    setPurchaseIntegrationError(null);
    setPurchaseOrder(null);
    setSelectedPurchaseDomain(null);
    setContactSchema(null);
    setExtraContactValues({});
    setOption(null);
  }

  if (connectedDomain) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-[18px] border px-4 py-4" style={{ background: "rgb(14 42 56 / 0.03)", borderColor: "rgb(115 216 200 / 0.2)" }}>
          <ChipAvatar mascot="rex" size={32} />
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--color-teal-deep)" }}>
              Domain ready
            </div>
            <h3 className="mt-1 text-[20px] font-semibold" style={{ color: "var(--color-navy)" }}>
              {connectedDomain.domain}
            </h3>
            <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--color-muted)" }}>
              {connectedDomain.verified || connectedDomain.demo
                ? "Your store can now use this public address."
                : "The domain is attached, but Vercel still needs the DNS records below before traffic can go live."}
            </p>
          </div>
        </div>

        {connectedDomain.verification.length > 0 && (
          <div className="rounded-[18px] border bg-[rgb(14_42_56_/_0.02)] p-4" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
              Add these DNS records
            </div>
            <div className="mt-3 grid gap-2">
              {connectedDomain.verification.map((record) => (
                <div key={`${record.type}-${record.domain}-${record.value}`} className="rounded-[14px] border bg-white px-4 py-3" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <div className="grid gap-1 text-[12px] sm:grid-cols-[90px_1fr]">
                    <span style={{ color: "var(--color-muted)" }}>Type</span>
                    <span className="font-mono" style={{ color: "var(--color-navy)" }}>{record.type}</span>
                    <span style={{ color: "var(--color-muted)" }}>Host</span>
                    <span className="font-mono break-all" style={{ color: "var(--color-navy)" }}>{record.domain}</span>
                    <span style={{ color: "var(--color-muted)" }}>Value</span>
                    <span className="font-mono break-all" style={{ color: "var(--color-navy)" }}>{record.value}</span>
                  </div>
                  {record.reason && (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--color-muted)" }}>
                      {record.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {connectedDomain.configuration && !connectedDomain.verified && (
          <div className="rounded-[18px] border bg-white p-4" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
              Vercel recommendations
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {connectedDomain.configuration.recommendedCNAME.map((entry) => (
                <div key={`cname-${entry.rank}-${entry.value}`} className="rounded-[14px] bg-[rgb(14_42_56_/_0.03)] px-4 py-3 text-[12px]">
                  <div style={{ color: "var(--color-muted)" }}>Recommended CNAME</div>
                  <div className="mt-1 font-mono break-all" style={{ color: "var(--color-navy)" }}>{entry.value}</div>
                </div>
              ))}
              {connectedDomain.configuration.recommendedIPv4.flatMap((entry) => entry.value).map((value) => (
                <div key={`ipv4-${value}`} className="rounded-[14px] bg-[rgb(14_42_56_/_0.03)] px-4 py-3 text-[12px]">
                  <div style={{ color: "var(--color-muted)" }}>Recommended A record</div>
                  <div className="mt-1 font-mono break-all" style={{ color: "var(--color-navy)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onDone(connectedDomain.domain)}
            className="rounded-full px-6 py-3 text-[14px] font-semibold text-[var(--color-navy)]"
            style={{ background: "var(--color-mint)" }}
          >
            Continue to launch
          </button>
          <button
            type="button"
            onClick={resetDomainFlow}
            className="text-[13px] font-semibold underline"
            style={{ color: "var(--color-teal-deep)" }}
          >
            Connect a different domain
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-[18px] border px-4 py-4" style={{ background: "rgb(14 42 56 / 0.03)", borderColor: "rgb(115 216 200 / 0.2)" }}>
        <ChipAvatar mascot="rex" size={32} />
        <p className="text-[13px] leading-6" style={{ color: "var(--color-navy)" }}>
          Vercel powers your free wildcard subdomain, lets you attach a domain you already own, or register a new one for you with SSL handled automatically.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { id: "free" as const, label: "Free subdomain", desc: `${freeDomain} at no extra cost.` },
          { id: "connect" as const, label: "Connect my domain", desc: "Use a domain you already bought elsewhere." },
          { id: "buy" as const, label: "Register on Vercel", desc: "Search, pay, and attach the domain here." },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOption(item.id)}
            className="rounded-[16px] border px-4 py-4 text-left transition-all"
            style={{
              borderColor: option === item.id ? "var(--color-mint)" : "rgb(14 42 56 / 0.08)",
              background: option === item.id ? "rgb(115 216 200 / 0.06)" : "white",
            }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
              {item.id === "free" ? "Instant" : item.id === "connect" ? "Bring yours" : "Registrar"}
            </div>
            <div className="mt-2 text-[14px] font-semibold" style={{ color: "var(--color-navy)" }}>
              {item.label}
            </div>
            <div className="mt-1 text-[12px] leading-5" style={{ color: "var(--color-muted)" }}>
              {item.desc}
            </div>
          </button>
        ))}
      </div>

      {option === "free" && (
        <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
            Your free store link
          </div>
          <div className="mt-2 text-[22px] font-semibold break-all" style={{ color: "var(--color-navy)" }}>
            {freeDomain}
          </div>
          <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--color-muted)" }}>
            This is included with your store and already points at {storeName}. You can swap to a custom domain later.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onDone(null)}
              className="rounded-full px-6 py-3 text-[14px] font-semibold text-[var(--color-navy)]"
              style={{ background: "var(--color-mint)" }}
            >
              Use {freeDomain}
            </button>
            <a href={freeOrigin} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold underline" style={{ color: "var(--color-teal-deep)" }}>
              Preview link
            </a>
          </div>
        </div>
      )}

      {option === "connect" && (
        <div className="rounded-[18px] border bg-white p-5" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
            Connect a domain you already own
          </div>
          <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--color-muted)" }}>
            Enter the domain exactly as you want customers to visit it, for example <span className="font-mono">mystore.com</span>.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={customDomainInput}
              onChange={(event) => setCustomDomainInput(event.target.value)}
              placeholder="mystore.com"
              className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
              style={{ color: "var(--color-navy)" }}
            />
            <button
              type="button"
              onClick={() => connectDomain()}
              disabled={isConnecting}
              className="rounded-full px-6 py-3 text-[14px] font-semibold text-[var(--color-navy)] disabled:opacity-50"
              style={{ background: "var(--color-mint)" }}
            >
              {isConnecting ? "Connecting..." : "Add to Vercel"}
            </button>
          </div>
          {connectError && (
            <div className="mt-3 rounded-[14px] border px-4 py-3 text-[12px]" style={{ borderColor: "rgb(232 106 79 / 0.3)", background: "rgb(232 106 79 / 0.08)", color: "#9F2D20" }}>
              {connectError}
            </div>
          )}
        </div>
      )}

      {option === "buy" && (
        <div className="flex flex-col gap-4 rounded-[18px] border bg-white p-5" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
              Search domains
            </div>
            <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--color-muted)" }}>
              Search brand ideas, check availability, then fill in the registrar checkout and billing details Vercel requires.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void searchDomains();
                }
              }}
              placeholder="shopinbos, rexwear, glowandgo"
              className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
              style={{ color: "var(--color-navy)" }}
            />
            <button
              type="button"
              onClick={() => void searchDomains()}
              disabled={isSearching}
              className="rounded-full px-6 py-3 text-[14px] font-semibold text-[var(--color-navy)] disabled:opacity-50"
              style={{ background: "var(--color-mint)" }}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {searchError && (
            <div className="rounded-[14px] border px-4 py-3 text-[12px]" style={{ borderColor: "rgb(232 106 79 / 0.3)", background: "rgb(232 106 79 / 0.08)", color: "#9F2D20" }}>
              {searchError}
            </div>
          )}

          {searchResults.length > 0 && !selectedPurchaseDomain && (
            <div className="grid gap-2">
              {searchResults.map((result) => (
                <div key={result.domain} className="flex flex-col gap-3 rounded-[16px] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <div>
                    <div className="text-[14px] font-semibold break-all" style={{ color: "var(--color-navy)" }}>
                      {result.domain}
                    </div>
                    <div className="mt-1 text-[12px]" style={{ color: result.available ? "var(--color-teal-deep)" : "var(--color-muted)" }}>
                      {result.available
                        ? result.price !== null
                          ? `${result.currency} ${result.price.toFixed(2)} for the first year`
                          : "Available now"
                        : "Already taken"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void preparePurchase(result)}
                    disabled={!result.available}
                    className="rounded-full px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
                    style={{
                      background: result.available ? "var(--color-mint)" : "rgb(14 42 56 / 0.08)",
                      color: result.available ? "var(--color-navy)" : "var(--color-muted)",
                    }}
                  >
                    {result.available ? "Buy on Vercel" : "Unavailable"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedPurchaseDomain && (
            <div className="rounded-[18px] border bg-[rgb(14_42_56_/_0.02)] p-4" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
                    Registrar checkout
                  </div>
                  <div className="mt-2 text-[20px] font-semibold break-all" style={{ color: "var(--color-navy)" }}>
                    {selectedPurchaseDomain.domain}
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
                    {selectedPurchaseDomain.price !== null
                      ? `${selectedPurchaseDomain.currency} ${selectedPurchaseDomain.price.toFixed(2)} billed for 1 year`
                      : "Price will be confirmed by Vercel at purchase time"}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-muted)" }}>
                  <input type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} />
                  Auto-renew this domain
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { key: "firstName", label: "First name", placeholder: "Ada", required: true },
                  { key: "lastName", label: "Last name", placeholder: "Okafor", required: true },
                  { key: "email", label: "Email", placeholder: "you@example.com", required: true },
                  { key: "phone", label: "Phone", placeholder: "+2348012345678", required: true },
                  { key: "companyName", label: "Company name", placeholder: "Optional", required: false },
                  { key: "address1", label: "Address line 1", placeholder: "12 Admiralty Way", required: true },
                  { key: "address2", label: "Address line 2", placeholder: "Suite, floor, landmark", required: false },
                  { key: "city", label: "City", placeholder: "Lagos", required: true },
                  { key: "state", label: "State / region", placeholder: "Lagos", required: true },
                  { key: "zip", label: "Postal code", placeholder: "101233", required: true },
                  { key: "country", label: "Country code", placeholder: "NG", required: true },
                ].map((field) => (
                  <label key={field.key} className="grid gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-muted)" }}>
                    <span>
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    <input
                      value={contactValues[field.key as keyof StandardContactValues]}
                      onChange={(event) => updateContactValue(field.key as keyof StandardContactValues, event.target.value)}
                      placeholder={field.placeholder}
                      type={getFieldInputType(field.key)}
                      className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
                      style={{ color: "var(--color-navy)" }}
                    />
                  </label>
                ))}
              </div>

              {isLoadingContactSchema && (
                <div className="mt-4 text-[12px]" style={{ color: "var(--color-muted)" }}>
                  Loading any extra registrar requirements for this TLD...
                </div>
              )}

              {schemaSection.description && (
                <p className="mt-4 text-[12px] leading-6" style={{ color: "var(--color-muted)" }}>
                  {schemaSection.description}
                </p>
              )}

              {extraFields.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {extraFields.map(([key, property]) => (
                    <label key={key} className="grid gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-muted)" }}>
                      <span>
                        {property.title ?? toTitle(key)}
                        {requiredExtraFields.has(key) ? " *" : ""}
                      </span>
                      {property.enum && property.enum.length > 0 ? (
                        <select
                          value={extraContactValues[key] ?? ""}
                          onChange={(event) => updateExtraContactValue(key, event.target.value)}
                          className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
                          style={{ color: "var(--color-navy)" }}
                        >
                          <option value="">Select</option>
                          {property.enum.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={extraContactValues[key] ?? ""}
                          onChange={(event) => updateExtraContactValue(key, event.target.value)}
                          placeholder={property.description ?? property.title ?? toTitle(key)}
                          type={getFieldInputType(key, property)}
                          className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
                          style={{ color: "var(--color-navy)" }}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}

              {purchaseOrder && (
                <div className="mt-4 rounded-[14px] border bg-white px-4 py-3 text-[12px]" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <div className="font-semibold" style={{ color: "var(--color-navy)" }}>
                    Order {purchaseOrder.orderId}
                  </div>
                  <div className="mt-1" style={{ color: "var(--color-muted)" }}>
                    Status: {purchaseOrder.status}
                  </div>
                </div>
              )}

              {purchaseError && (
                <div className="mt-4 rounded-[14px] border px-4 py-3 text-[12px]" style={{ borderColor: "rgb(232 106 79 / 0.3)", background: "rgb(232 106 79 / 0.08)", color: "#9F2D20" }}>
                  {purchaseError}
                </div>
              )}

              {purchaseIntegrationError && (
                <div className="mt-4 rounded-[14px] border px-4 py-3 text-[12px]" style={{ borderColor: "rgb(242 169 59 / 0.28)", background: "rgb(242 169 59 / 0.08)", color: "#8A5A00" }}>
                  {purchaseIntegrationError}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void purchaseDomain()}
                  disabled={isPurchasing || isLoadingContactSchema}
                  className="rounded-full px-6 py-3 text-[14px] font-semibold text-[var(--color-navy)] disabled:opacity-50"
                  style={{ background: "var(--color-mint)" }}
                >
                  {isPurchasing ? "Processing..." : "Complete purchase"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPurchaseDomain(null);
                    setContactSchema(null);
                    setExtraContactValues({});
                    setPurchaseError(null);
                    setPurchaseIntegrationError(null);
                    setPurchaseOrder(null);
                  }}
                  className="text-[13px] font-semibold underline"
                  style={{ color: "var(--color-teal-deep)" }}
                >
                  Choose another domain
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
