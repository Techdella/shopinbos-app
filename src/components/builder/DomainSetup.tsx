"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FieldLabel, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { DomainOwnership } from "@/components/domains/DomainOwnership";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { useT } from "@/components/i18n/I18nProvider";
import { naira } from "@shared/onboarding";
import { DomainPurchaseBanner } from "@/components/domains/BoughtDomain";
import { friendlyError } from "@/lib/errors/report-client";

/** Where sellers pick a yearly Growth or Pro plan (SellerBillingSection). */
const PLANS_HREF = "/home/settings?tab=Billing";

/** A search result, priced in naira by the server (/api/domains/search). */
interface DomainResult {
  domain: string;
  ending: string;
  available: boolean;
  /** Naira for the first year; null when we don't sell it. */
  price: number | null;
  /** Naira for each renewal year. */
  renewalPrice: number | null;
  currency: string;
  tooExpensive?: boolean;
  /** The seller's annual plan pays for it (the purchase route checks again on the server). */
  free?: boolean;
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

  const [selectedPurchaseDomain, setSelectedPurchaseDomain] = useState<DomainResult | null>(null);
  const [contactSchema, setContactSchema] = useState<RegistrarContactSchema | null>(null);
  const [contactValues, setContactValues] = useState<StandardContactValues>(DEFAULT_CONTACT_VALUES);
  const [extraContactValues, setExtraContactValues] = useState<Record<string, string>>({});
  const [isLoadingContactSchema, setIsLoadingContactSchema] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  // Contact details first, then "Check before you pay" (spelling, yearly price, renewal, no refunds), then Paystack.
  const [confirming, setConfirming] = useState(false);
  // A free (annual plan) domain is bought in place: no Paystack, the progress banner shows the result.
  const [freeStarted, setFreeStarted] = useState(false);

  const freeOrigin = buildStorefrontOrigin({ slug: storeSlug });
  const freeDomain = freeOrigin.replace(/^https?:\/\//, "");

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
      setSearchError(error instanceof Error ? friendlyError(error) : t("setup.err.search"));
    } finally {
      setIsSearching(false);
    }
  }

  async function preparePurchase(domain: DomainResult) {
    setSelectedPurchaseDomain(domain);
    setPurchaseError(null);
    setPriceNotice(null);
    setConfirming(false);
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
      setPurchaseError(error instanceof Error ? friendlyError(error) : t("setup.err.next"));
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

  function contactPayload() {
    const additional = Object.fromEntries(
      Object.entries(extraContactValues)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );
    return {
      firstName: contactValues.firstName.trim(),
      lastName: contactValues.lastName.trim(),
      email: contactValues.email.trim(),
      // The registrar wants +2348012345678: no spaces or dashes.
      phone: contactValues.phone.replace(/[\s()-]/g, ""),
      address1: contactValues.address1.trim(),
      city: contactValues.city.trim(),
      state: contactValues.state.trim(),
      zip: contactValues.zip.trim(),
      country: contactValues.country.trim().toUpperCase(),
      ...(contactValues.address2.trim() ? { address2: contactValues.address2.trim() } : {}),
      ...(contactValues.companyName.trim() ? { companyName: contactValues.companyName.trim() } : {}),
      ...(Object.keys(additional).length > 0 ? { additional } : {}),
    };
  }

  /** Checks the contact form, then shows the confirm step. */
  function reviewPurchase() {
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

    setPurchaseError(null);
    setConfirming(true);
  }

  /** Pay first: the server records the purchase and sends the seller to Paystack. The domain is bought after. */
  async function payForDomain() {
    if (!selectedPurchaseDomain) return;
    setIsPurchasing(true);
    setPurchaseError(null);
    setPriceNotice(null);

    try {
      const response = await fetch("/api/domains/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: selectedPurchaseDomain.domain,
          years: 1,
          ...(selectedPurchaseDomain.free ? { expectFree: true } : { expectedAmountNgn: selectedPurchaseDomain.price ?? undefined }),
          contactInformation: contactPayload(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { free?: boolean; authorizationUrl?: string; amountNgn?: number; renewalNgn?: number }; error?: { code?: string; message?: string } }
        | null;

      if ((payload?.error?.code === "price_changed" || payload?.error?.code === "not_free") && payload.data?.amountNgn) {
        const amount = payload.data.amountNgn;
        setSelectedPurchaseDomain((current) => current ? { ...current, free: false, price: amount, renewalPrice: payload.data?.renewalNgn ?? current.renewalPrice } : current);
        setPriceNotice(payload.error.code === "not_free" ? t("free.notFree", { price: naira(amount) }) : t("confirm.priceChanged", { price: naira(amount) }));
        setIsPurchasing(false);
        return;
      }

      if (response.ok && payload?.data?.free) {
        setFreeStarted(true);
        setIsPurchasing(false);
        return;
      }

      if (!response.ok || !payload?.data?.authorizationUrl) {
        throw new Error(payload?.error?.message ?? t("setup.err.pay"));
      }

      window.location.assign(payload.data.authorizationUrl);
    } catch (error) {
      setPurchaseError(error instanceof Error ? friendlyError(error) : t("setup.err.pay"));
      setIsPurchasing(false);
    }
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
                    <div className={cx("mt-0.5 text-[13px]", result.available && result.price !== null ? "text-app-success" : "text-app-ink-soft")}>
                      {result.available
                        ? result.price !== null
                          ? result.free ? <strong>{t("free.badge")}</strong> : t("setup.firstYear", { price: naira(result.price) })
                          : result.tooExpensive ? t("setup.notSold") : t("setup.available")
                        : t("setup.taken")}
                    </div>
                  </div>
                  {(() => {
                    const buyable = result.available && result.price !== null;
                    return (
                      <PillButton size="sm" tone={buyable ? "ink" : "white"} disabled={!buyable} onClick={() => void preparePurchase(result)}>
                        {result.available ? (buyable ? t("setup.buy") : t("setup.notSoldBtn")) : t("setup.takenBtn")}
                      </PillButton>
                    );
                  })()}
                </li>
              ))}
            </ul>
          )}
          {searchResults.length > 0 && !selectedPurchaseDomain && searchResults.some((result) => result.available && result.price !== null && !result.free) && (
            <p className="mb-0 mt-2.5 text-[13px] leading-[1.5] text-app-ink-soft">
              {t("free.upsell")}{" "}
              <a href={PLANS_HREF} className="font-bold text-app-accent-ink no-underline hover:underline">{t("free.upsellLink")}</a>
            </p>
          )}

          {freeStarted && <div className="mt-4"><DomainPurchaseBanner result="processing" /></div>}

          {selectedPurchaseDomain && confirming && !freeStarted && (
            <ConfirmPurchase
              free={Boolean(selectedPurchaseDomain.free)}
              domain={selectedPurchaseDomain.domain}
              price={selectedPurchaseDomain.price ?? 0}
              renewalPrice={selectedPurchaseDomain.renewalPrice ?? selectedPurchaseDomain.price ?? 0}
              busy={isPurchasing}
              notice={priceNotice}
              error={purchaseError}
              onPay={() => void payForDomain()}
              onBack={() => {
                setConfirming(false);
                setPurchaseError(null);
                setPriceNotice(null);
              }}
            />
          )}

          {selectedPurchaseDomain && !confirming && (
            <div className="mt-4 rounded-[18px] bg-app-canvas p-4">
              <div className="min-w-0">
                <p className="m-0 text-[13px] font-bold text-app-ink-soft">{t("setup.buying")}</p>
                <div className="mt-0.5 break-all text-[20px] font-extrabold">{selectedPurchaseDomain.domain}</div>
                <div className="mt-0.5 text-[13px] text-app-ink-soft">
                  {selectedPurchaseDomain.free
                    ? t("free.badge")
                    : selectedPurchaseDomain.price !== null
                      ? t("setup.oneYear", { price: naira(selectedPurchaseDomain.price) })
                      : t("setup.priceOnPay")}
                </div>
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

              {purchaseError && <div className="mt-4"><Notice>{purchaseError}</Notice></div>}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <PillButton size="md" tone="accent" disabled={isLoadingContactSchema} onClick={reviewPurchase} className="w-full sm:w-auto">
                  {t("setup.toConfirm")}
                </PillButton>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPurchaseDomain(null);
                    setContactSchema(null);
                    setExtraContactValues({});
                    setPurchaseError(null);
                    setPriceNotice(null);
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

/** "Check before you pay": the name in big letters, the yearly price, the renewal and the no-refund rule. */
function ConfirmPurchase({
  free,
  domain,
  price,
  renewalPrice,
  busy,
  notice,
  error,
  onPay,
  onBack,
}: {
  /** Free with the annual plan: no price to pay, "Get it free" instead of Pay. */
  free: boolean;
  domain: string;
  price: number;
  renewalPrice: number;
  busy: boolean;
  notice: string | null;
  error: string | null;
  onPay: () => void;
  onBack: () => void;
}) {
  const t = useT("domain");
  return (
    <section className="mt-4 rounded-[18px] border-2 border-app-ink bg-white p-4 sm:p-5" aria-labelledby="confirm-domain-title">
      <p id="confirm-domain-title" className="m-0 text-[13px] font-bold text-app-ink-soft">{t("confirm.title")}</p>
      <div className="mt-2 break-all text-[28px] font-extrabold leading-tight tracking-[-0.5px] sm:text-[34px]">{domain}</div>
      <p className="mb-0 mt-1 text-[15px] font-bold">{t("confirm.spelled")}</p>
      <ul className="m-0 mt-4 grid list-none gap-2.5 p-0 text-[15px] leading-[1.45]">
        <li className="flex items-start gap-2.5">
          <Icon name="check" size={16} className="mt-1 shrink-0 text-app-success" />
          <span><strong>{free ? t("free.badge") : t("confirm.price", { price: naira(price) })}</strong></span>
        </li>
        <li className="flex items-start gap-2.5">
          <Icon name="clock" size={16} className="mt-1 shrink-0 text-app-ink-soft" />
          <span>{free ? t("free.renews", { price: naira(renewalPrice) }) : t("confirm.renews", { price: naira(renewalPrice) })}</span>
        </li>
        {!free && (
          <li className="flex items-start gap-2.5">
            <Icon name="warn" size={16} className="mt-1 shrink-0 text-app-danger" />
            <span>{t("confirm.noRefund")}</span>
          </li>
        )}
      </ul>
      {notice && <div className="mt-4"><Notice tone="info">{notice}</Notice></div>}
      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <PillButton size="lg" tone="accent" busy={busy} onClick={onPay} className="w-full sm:w-auto">
          {free ? t("free.get") : t("confirm.pay", { price: naira(price) })}
        </PillButton>
        <button type="button" onClick={onBack} className="min-h-[44px] px-2 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
          {t("confirm.back")}
        </button>
      </div>
      {!free && <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{t("confirm.paystack")}</p>}
    </section>
  );
}
