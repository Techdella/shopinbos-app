"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FieldLabel, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { DomainOwnership } from "@/components/domains/DomainOwnership";
import { TechFold } from "@/components/simple/Fold";
import { buildStorefrontOrigin, getPlatformRootDomain } from "@/lib/domains/storefront";
import { useT } from "@/components/i18n/I18nProvider";

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

export type DomainOption = "free" | "connect" | "buy";

interface DomainSetupProps {
  storeSlug: string;
  storeName: string;
  onDone: (domain: string | null) => void;
  /** Controlled choice (the Domain page has its own toggle). When set, the three option cards are hidden. */
  option?: DomainOption;
  /** Label of the button that finishes the flow once a domain is attached. */
  doneLabel?: string;
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

export function DomainSetup({ storeSlug, storeName, onDone, option: controlledOption, doneLabel: doneLabelProp }: DomainSetupProps) {
  const t = useT("domain");
  const doneLabel = doneLabelProp ?? t("setup.continueLaunch");
  const [pickedOption, setOption] = useState<DomainOption | null>(null);
  const option = controlledOption ?? pickedOption;
  const [searchQuery, setSearchQuery] = useState(storeSlug);
  const [searchResults, setSearchResults] = useState<DomainResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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
          throw new Error(payload?.error?.message ?? t("setup.err.check"));
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
        setPurchaseError(error instanceof Error ? error.message : t("setup.err.check"));
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [connectedDomain, purchaseOrder, t]);

  async function searchDomains() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError(t("setup.err.typeFirst"));
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
        throw new Error(payload?.error?.message ?? t("setup.err.search"));
      }

      setSearchResults(payload?.data ?? []);
      if ((payload?.data ?? []).length === 0) {
        setSearchError(t("setup.err.noIdeas"));
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : t("setup.err.search"));
    } finally {
      setIsSearching(false);
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
        throw new Error(payload?.error?.message ?? t("setup.err.next"));
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
      setPurchaseError(error instanceof Error ? error.message : t("setup.err.next"));
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
      setPurchaseError(t("setup.err.addField", { field: t.dynamic(`setup.field.${missingBaseField}`, toTitle(missingBaseField).toLowerCase()) }));
      return;
    }

    if (!contactValues.phone.trim().startsWith("+")) {
      setPurchaseError(t("setup.err.phone"));
      return;
    }

    if (contactValues.country.trim().length !== 2) {
      setPurchaseError(t("setup.err.country"));
      return;
    }

    const missingExtraField = extraFields.find(
      ([key]) => requiredExtraFields.has(key) && !extraContactValues[key]?.trim(),
    );
    if (missingExtraField) {
      setPurchaseError(t("setup.err.addExtra", { field: toTitle(missingExtraField[0]).toLowerCase() }));
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
        throw new Error(payload?.error?.message ?? t("setup.err.pay"));
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
      setPurchaseError(error instanceof Error ? error.message : t("setup.err.pay"));
    } finally {
      setIsPurchasing(false);
    }
  }

  function resetDomainFlow() {
    setConnectedDomain(null);
    setPurchaseError(null);
    setPurchaseIntegrationError(null);
    setPurchaseOrder(null);
    setSelectedPurchaseDomain(null);
    setContactSchema(null);
    setExtraContactValues({});
    setOption(null);
  }

  if (connectedDomain) {
    const ready = connectedDomain.verified || connectedDomain.demo;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-[18px] bg-app-canvas px-4 py-4">
          <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full", ready ? "bg-app-success-tint text-app-success" : "bg-[#FDF0D5] text-[#8A5A00]")}>
            <Icon name={ready ? "check" : "clock"} size={18} />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-bold text-app-ink-soft">{ready ? t("setup.ready") : t("setup.almost")}</p>
            <h3 className="m-0 mt-0.5 break-all text-[20px] font-extrabold">{connectedDomain.domain}</h3>
            <p className="mb-0 mt-1.5 text-[14px] leading-[1.5] text-app-ink-soft">
              {ready
                ? t("setup.readyBody")
                : t("setup.settingUp")}
            </p>
          </div>
        </div>

        {(connectedDomain.verification.length > 0 || (connectedDomain.configuration && !connectedDomain.verified)) && (
          <TechFold forWho={t("own.forWho")}>
        {connectedDomain.verification.length > 0 && (
          <RecordList title={t("setup.addRecords")}>
            {connectedDomain.verification.map((record) => (
              <RecordRow key={`${record.type}-${record.domain}-${record.value}`} type={record.type} host={record.domain} value={record.value} note={record.reason} />
            ))}
          </RecordList>
        )}

        {connectedDomain.configuration && !connectedDomain.verified && (connectedDomain.configuration.recommendedCNAME.length > 0 || connectedDomain.configuration.recommendedIPv4.length > 0) && (
          <RecordList title={t("setup.pointHere")}>
            {connectedDomain.configuration.recommendedCNAME.map((entry) => (
              <RecordRow key={`cname-${entry.rank}-${entry.value}`} type="CNAME" host={connectedDomain.domain} value={entry.value} note={t("setup.cnameNote")} />
            ))}
            {connectedDomain.configuration.recommendedIPv4.flatMap((entry) => entry.value).map((value) => (
              <RecordRow key={`ipv4-${value}`} type="A" host={connectedDomain.domain} value={value} note={t("setup.aNote")} />
            ))}
          </RecordList>
        )}
          </TechFold>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <PillButton size="md" onClick={() => onDone(connectedDomain.domain)}>{doneLabel}</PillButton>
          <button type="button" onClick={resetDomainFlow} className="min-h-[44px] px-2 text-[14px] font-bold text-app-ink-soft underline-offset-4 hover:text-app-ink hover:underline">
            {t("own.different")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!controlledOption && (
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("setup.storeAddress")}>
          {[
            { id: "free" as const, label: t("setup.free"), desc: t("setup.freeDesc", { domain: freeDomain }) },
            { id: "connect" as const, label: t("choice.own"), desc: t("setup.ownDesc") },
            { id: "buy" as const, label: t("choice.buy"), desc: t("setup.buyDesc") },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={option === item.id}
              onClick={() => setOption(item.id)}
              className={cx(
                "min-h-[88px] rounded-[18px] border-2 bg-white px-4 py-3.5 text-left transition",
                option === item.id ? "border-app-ink" : "border-app-line hover:border-app-line-strong",
              )}
            >
              <span className="block text-[15px] font-extrabold">{item.label}</span>
              <span className="mt-1 block break-words text-[13px] leading-[1.45] text-app-ink-soft">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      {option === "free" && (
        <Panel>
          <p className="m-0 text-[13px] font-bold text-app-ink-soft">{t("setup.yourFree")}</p>
          <div className="mt-1 break-all text-[22px] font-extrabold tracking-[-0.3px]">{freeDomain}</div>
          <p className="mb-0 mt-1.5 text-[14px] leading-[1.5] text-app-ink-soft">
            {t("setup.pointsAt", { store: storeName })}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PillButton size="md" onClick={() => onDone(null)}>{t("setup.use", { domain: freeDomain })}</PillButton>
            <a href={freeOrigin} target="_blank" rel="noopener noreferrer" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">
              {t("setup.openIt")}
            </a>
          </div>
        </Panel>
      )}

      {option === "connect" && (
        <div className="grid min-w-0 gap-3">
          <DomainOwnership onVerified={(domain) => onDone(domain)} />
          <button type="button" onClick={() => onDone(null)} className="min-h-[44px] justify-self-start px-2 text-[14px] font-bold text-app-ink-soft underline-offset-4 hover:text-app-ink hover:underline">
            {t("setup.useForNow", { domain: freeDomain })}
          </button>
        </div>
      )}

      {option === "buy" && (
        <Panel>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void searchDomains();
            }}
          >
            <FieldLabel htmlFor="domain-search">{t("setup.searchLabel")}</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                id="domain-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="yourbrand"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="sm:flex-1"
              />
              <PillButton type="submit" size="lg" busy={isSearching} className="sm:w-auto">{t("setup.searchBtn")}</PillButton>
            </div>
            <p className="mb-0 mt-2.5 text-[13px] leading-[1.5] text-app-ink-soft">{t("setup.searchHelp")}</p>
          </form>

          {searchError && <div className="mt-3"><Notice>{searchError}</Notice></div>}

          {searchResults.length > 0 && !selectedPurchaseDomain && (
            <ul className="m-0 mt-4 list-none divide-y divide-app-line overflow-hidden rounded-[18px] border border-app-line p-0">
              {searchResults.map((result) => (
                <li key={result.domain} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="break-all text-[15px] font-bold">{result.domain}</div>
                    <div className={cx("mt-0.5 text-[13px]", result.available ? "text-app-success" : "text-app-ink-soft")}>
                      {result.available
                        ? result.price !== null
                          ? t("setup.firstYear", { price: `${result.currency} ${result.price.toFixed(2)}` })
                          : t("setup.available")
                        : t("setup.taken")}
                    </div>
                  </div>
                  <PillButton size="sm" tone={result.available ? "ink" : "white"} disabled={!result.available} onClick={() => void preparePurchase(result)}>
                    {result.available ? t("setup.buy") : t("setup.takenBtn")}
                  </PillButton>
                </li>
              ))}
            </ul>
          )}

          {selectedPurchaseDomain && (
            <div className="mt-4 rounded-[18px] bg-app-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[13px] font-bold text-app-ink-soft">{t("setup.buying")}</p>
                  <div className="mt-0.5 break-all text-[20px] font-extrabold">{selectedPurchaseDomain.domain}</div>
                  <div className="mt-0.5 text-[13px] text-app-ink-soft">
                    {selectedPurchaseDomain.price !== null
                      ? t("setup.oneYear", { price: `${selectedPurchaseDomain.currency} ${selectedPurchaseDomain.price.toFixed(2)}` })
                      : t("setup.priceOnPay")}
                  </div>
                </div>
                <label className="flex min-h-[40px] items-center gap-2 text-[14px] font-semibold">
                  <input type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} className="h-4 w-4 accent-[#16141F]" />
                  {t("setup.renew")}
                </label>
              </div>

              <p className="mb-0 mt-4 text-[13px] text-app-ink-soft">{t("setup.contactNeeded")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  { key: "firstName", label: t("setup.c.firstName"), placeholder: "Ada", required: true, auto: "given-name" },
                  { key: "lastName", label: t("setup.c.lastName"), placeholder: "Okafor", required: true, auto: "family-name" },
                  { key: "email", label: t("setup.c.email"), placeholder: "you@example.com", required: true, auto: "email" },
                  { key: "phone", label: t("setup.c.phone"), placeholder: "+2348012345678", required: true, auto: "tel" },
                  { key: "companyName", label: t("setup.c.companyName"), placeholder: t("setup.c.optional"), required: false, auto: "organization" },
                  { key: "address1", label: t("setup.c.address1"), placeholder: "12 Admiralty Way", required: true, auto: "address-line1" },
                  { key: "address2", label: t("setup.c.address2"), placeholder: t("setup.c.address2Ph"), required: false, auto: "address-line2" },
                  { key: "city", label: t("setup.c.city"), placeholder: "Lagos", required: true, auto: "address-level2" },
                  { key: "state", label: t("setup.c.state"), placeholder: "Lagos", required: true, auto: "address-level1" },
                  { key: "zip", label: t("setup.c.zip"), placeholder: "101233", required: true, auto: "postal-code" },
                  { key: "country", label: t("setup.c.country"), placeholder: "NG", required: true, auto: "country" },
                ].map((field) => (
                  <div key={field.key} className="min-w-0">
                    <FieldLabel htmlFor={`contact-${field.key}`}>{field.label}{field.required ? " *" : ""}</FieldLabel>
                    <TextInput
                      id={`contact-${field.key}`}
                      value={contactValues[field.key as keyof StandardContactValues]}
                      onChange={(event) => updateContactValue(field.key as keyof StandardContactValues, event.target.value)}
                      placeholder={field.placeholder}
                      type={getFieldInputType(field.key)}
                      autoComplete={field.auto}
                      required={field.required}
                      className="h-[48px] text-[15px]"
                    />
                  </div>
                ))}
              </div>

              {isLoadingContactSchema && <p className="mb-0 mt-4 text-[13px] text-app-ink-soft">{t("setup.checking")}</p>}
              {schemaSection.description && <p className="mb-0 mt-4 text-[13px] leading-[1.5] text-app-ink-soft">{schemaSection.description}</p>}

              {extraFields.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {extraFields.map(([key, property]) => (
                    <div key={key} className="min-w-0">
                      <FieldLabel htmlFor={`extra-${key}`}>{property.title ?? toTitle(key)}{requiredExtraFields.has(key) ? " *" : ""}</FieldLabel>
                      {property.enum && property.enum.length > 0 ? (
                        <select
                          id={`extra-${key}`}
                          value={extraContactValues[key] ?? ""}
                          onChange={(event) => updateExtraContactValue(key, event.target.value)}
                          className="h-[48px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none focus:border-app-ink"
                        >
                          <option value="">{t("setup.choose")}</option>
                          {property.enum.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      ) : (
                        <TextInput
                          id={`extra-${key}`}
                          value={extraContactValues[key] ?? ""}
                          onChange={(event) => updateExtraContactValue(key, event.target.value)}
                          placeholder={property.description ?? property.title ?? toTitle(key)}
                          type={getFieldInputType(key, property)}
                          className="h-[48px] text-[15px]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {purchaseOrder && (
                <div className="mt-4"><Notice tone="info">{t.dynamic(`setup.order.${purchaseOrder.status}`, t("setup.order.draft"))}</Notice></div>
              )}
              {purchaseError && <div className="mt-4"><Notice>{purchaseError}</Notice></div>}
              {purchaseIntegrationError && <div className="mt-4"><Notice tone="info">{purchaseIntegrationError}</Notice></div>}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <PillButton size="md" tone="accent" busy={isPurchasing} disabled={isLoadingContactSchema} onClick={() => void purchaseDomain()}>
                  {t("setup.payConnect")}
                </PillButton>
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
                  className="min-h-[44px] px-2 text-[14px] font-bold text-app-ink-soft hover:text-app-ink"
                >
                  {t("setup.another")}
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="min-w-0 rounded-[22px] border border-app-line bg-white p-4 sm:p-5">{children}</div>;
}

function RecordList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
      <h3 className="m-0 text-[15px] font-extrabold">{title}</h3>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0">{children}</ul>
    </section>
  );
}

function RecordRow({ type, host, value, note }: { type: string; host: string; value: string; note?: string }) {
  const t = useT("domain");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the value is selectable text.
    }
  }
  return (
    <li className="rounded-[16px] bg-app-canvas px-4 py-3">
      <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px]">
        <dt className="text-app-ink-soft">{t("setup.rec.type")}</dt>
        <dd className="m-0 font-mono font-bold">{type}</dd>
        <dt className="text-app-ink-soft">{t("setup.rec.name")}</dt>
        <dd className="m-0 break-all font-mono">{host}</dd>
        <dt className="text-app-ink-soft">{t("setup.rec.value")}</dt>
        <dd className="m-0 flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 break-all font-mono">{value}</span>
          <button type="button" onClick={() => void copy()} aria-label={t("setup.rec.copy", { type })} className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border border-app-line bg-white px-2.5 text-[12px] font-bold">
            <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? t("setup.copied") : t("setup.copy")}
          </button>
        </dd>
      </dl>
      {note && <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{note}</p>}
    </li>
  );
}
